-- =============================================================================
-- Migration 1 of 3 — Core schema
-- Pharmacy <-> Welfare Home medication management platform (MVP)
--
-- Domains:
--   * system_admin   -> owns the platform and holds break-glass access to all tenants
--   * welfare_admin  -> belongs to exactly ONE welfare_home (customer tenant)
--   * pharmacy_admin -> belongs to exactly ONE pharmacy    (supplier tenant)
--
-- Locked domain rules encoded below:
--   1. inventory_items.welfare_home_id is NOT NULL and resident_id is NULLABLE.
--        resident_id IS NULL     -> general pooled facility stock
--        resident_id IS NOT NULL -> resident-specific prescription stock
--      A resident's stock must belong to the same welfare home as the item.
--   2. Ordering is direct 1-to-1: one welfare home -> one registered pharmacy.
--      Status flow is strictly: pending -> accepted | rejected | cancelled
--                                           accepted -> prepared
--                                           prepared -> completed
--   3. Orders and order items carry no patient key. The resident link lives in
--      order_residents and the stock link in order_item_inventory, both of
--      which are invisible to pharmacy_admin.
--
-- Apply order: 000100 (this file) -> 000200 (RLS) -> 000300 (audit).
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerated domain values
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'system_admin',
  'welfare_admin',
  'pharmacy_admin'
);

create type public.order_status as enum (
  'pending',   -- submitted by welfare_admin, awaiting pharmacy decision
  'accepted',  -- pharmacy_admin confirmed it will fulfil the order
  'rejected',  -- pharmacy_admin declined (reason required)
  'prepared',  -- pharmacy_admin finished picking/packing
  'completed', -- goods received / order closed
  'cancelled'  -- withdrawn by the welfare_admin before the pharmacy acted
);

-- ---------------------------------------------------------------------------
-- welfare_homes — the customer tenant
-- ---------------------------------------------------------------------------
create table public.welfare_homes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  registration_number text not null unique,
  address_line1       text not null,
  address_line2       text,
  city                text not null,
  region              text,
  postal_code         text,
  phone               text,
  email               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint welfare_homes_name_not_blank
    check (length(btrim(name)) > 0),
  constraint welfare_homes_registration_not_blank
    check (length(btrim(registration_number)) > 0)
);

comment on table public.welfare_homes is
  'Customer tenant. Welfare admins are scoped to exactly one row of this table.';

-- ---------------------------------------------------------------------------
-- pharmacies — the supplier tenant
-- ---------------------------------------------------------------------------
create table public.pharmacies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  license_number   text not null unique,
  contact_person   text,
  address_line1    text not null,
  address_line2    text,
  city             text not null,
  region           text,
  postal_code      text,
  phone            text,
  email            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pharmacies_name_not_blank
    check (length(btrim(name)) > 0),
  constraint pharmacies_license_not_blank
    check (length(btrim(license_number)) > 0)
);

comment on table public.pharmacies is
  'Supplier tenant. Welfare admins may only read active pharmacies (plus pharmacies they already ordered from).';

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, carries role + tenant binding
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text not null,
  phone           text,
  role            public.user_role not null,
  -- Exactly one of these is populated, and it must match the role.
  welfare_home_id uuid references public.welfare_homes (id) on delete restrict,
  pharmacy_id     uuid references public.pharmacies (id) on delete restrict,
  is_active       boolean not null default true,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_tenancy_matches_role check (
    (role = 'system_admin'
       and welfare_home_id is null and pharmacy_id is null)
    or (role = 'welfare_admin'
       and welfare_home_id is not null and pharmacy_id is null)
    or (role = 'pharmacy_admin'
       and pharmacy_id is not null and welfare_home_id is null)
  )
);

comment on table public.profiles is
  'Application identity. Tenant binding lives here so RLS can derive the caller scope from auth.uid().';

create unique index profiles_email_unique_idx
  on public.profiles (lower(email));
create index profiles_welfare_home_id_idx
  on public.profiles (welfare_home_id) where welfare_home_id is not null;
create index profiles_pharmacy_id_idx
  on public.profiles (pharmacy_id) where pharmacy_id is not null;

-- ---------------------------------------------------------------------------
-- residents — PHI. Never visible to pharmacy_admin (enforced in RLS).
-- ---------------------------------------------------------------------------
create table public.residents (
  id                    uuid primary key default gen_random_uuid(),
  welfare_home_id       uuid not null references public.welfare_homes (id) on delete cascade,
  full_name             text not null,
  date_of_birth         date,
  gender                text,
  room_number           text,
  medical_record_number text,
  allergies             text[] not null default '{}',
  care_notes            text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint residents_full_name_not_blank
    check (length(btrim(full_name)) > 0),
  constraint residents_medical_record_number_unique
    unique (welfare_home_id, medical_record_number),
  -- Target for the composite FK from inventory_items / order_residents.
  constraint residents_id_welfare_home_id_key
    unique (id, welfare_home_id)
);

comment on table public.residents is
  'Resident PHI. RLS grants access to the owning welfare_home only; pharmacy_admin has no policy at all.';

create index residents_welfare_home_id_idx
  on public.residents (welfare_home_id);
create index residents_active_by_home_idx
  on public.residents (welfare_home_id, full_name) where is_active;

-- ---------------------------------------------------------------------------
-- inventory_items — pooled facility stock (resident_id IS NULL)
--                   or resident-specific prescription stock (resident_id set)
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id                uuid primary key default gen_random_uuid(),
  welfare_home_id   uuid not null references public.welfare_homes (id) on delete cascade,
  resident_id       uuid,
  medication_name   text not null,
  generic_name      text,
  strength          text,
  dosage_form       text,
  unit              text not null default 'unit',
  quantity_on_hand  numeric(12, 2) not null default 0,
  reorder_level     numeric(12, 2) not null default 0,
  batch_number      text,
  expiry_date       date,
  storage_location  text,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint inventory_items_medication_name_not_blank
    check (length(btrim(medication_name)) > 0),
  constraint inventory_items_quantity_non_negative
    check (quantity_on_hand >= 0),
  constraint inventory_items_reorder_level_non_negative
    check (reorder_level >= 0),
  -- MATCH SIMPLE: when resident_id IS NULL the FK is not checked, which is
  -- exactly the pooled-stock case. When resident_id is set, the (resident,
  -- home) pair must exist, so a resident's stock can never be filed under
  -- another welfare home.
  constraint inventory_items_resident_same_home
    foreign key (resident_id, welfare_home_id)
    references public.residents (id, welfare_home_id),
  -- Target for the composite FK from order_item_inventory.
  constraint inventory_items_id_welfare_home_id_key
    unique (id, welfare_home_id)
);

comment on column public.inventory_items.resident_id is
  'NULL = general pooled facility stock. NOT NULL = prescription stock allocated to that resident of the same welfare home.';

create index inventory_items_welfare_home_id_idx
  on public.inventory_items (welfare_home_id);
create index inventory_items_resident_id_idx
  on public.inventory_items (resident_id) where resident_id is not null;
create index inventory_items_home_active_idx
  on public.inventory_items (welfare_home_id, medication_name) where is_active;
create index inventory_items_expiry_date_idx
  on public.inventory_items (expiry_date) where expiry_date is not null;

-- ---------------------------------------------------------------------------
-- orders — direct 1-to-1 ordering between one home and one pharmacy
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique default (
    'ORD-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.order_number_seq')::text, 6, '0')
  ),
  welfare_home_id    uuid not null references public.welfare_homes (id) on delete restrict,
  pharmacy_id        uuid not null references public.pharmacies (id) on delete restrict,
  -- Non-identifying label the pharmacy can print on the package (e.g. room
  -- code "Wing-B/12"). The order deliberately carries NO resident key: the
  -- patient link lives in order_residents, which pharmacies cannot read.
  resident_reference text,
  status             public.order_status not null default 'pending',
  requested_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  decided_by         uuid references public.profiles (id) on delete set null,
  notes              text,
  rejection_reason   text,
  total_amount       numeric(12, 2) not null default 0,
  submitted_at       timestamptz not null default now(),
  accepted_at        timestamptz,
  prepared_at        timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  status_changed_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint orders_total_amount_non_negative
    check (total_amount >= 0),
  constraint orders_rejection_requires_reason
    check (status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0),
  -- Lets order_residents enforce "same welfare home" with a composite FK.
  constraint orders_id_welfare_home_id_key
    unique (id, welfare_home_id)
);

comment on table public.orders is
  'A welfare home orders directly from exactly one registered pharmacy. Status transitions are guarded by trigger + RLS. Contains no resident identifier so pharmacy_admin cannot build a patient history.';

comment on column public.orders.resident_reference is
  'Non-identifying reference shown to the pharmacy. Do not store names, DOB or MRN here.';

create index orders_welfare_home_id_idx
  on public.orders (welfare_home_id, status, created_at desc);
create index orders_pharmacy_id_idx
  on public.orders (pharmacy_id, status, created_at desc);
create index orders_open_queue_idx
  on public.orders (pharmacy_id, submitted_at)
  where status in ('pending', 'accepted', 'prepared');

-- ---------------------------------------------------------------------------
-- order_items — medication lines. Snapshot fields so history survives edits
-- to inventory_items; line_total is always derived.
-- ---------------------------------------------------------------------------
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null,
  welfare_home_id   uuid not null,
  medication_name   text not null,
  strength          text,
  dosage_form       text,
  unit              text not null default 'unit',
  quantity          numeric(12, 2) not null,
  unit_price        numeric(12, 2) not null default 0,
  line_total        numeric(12, 2) generated always as (quantity * unit_price) stored,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint order_items_medication_name_not_blank
    check (length(btrim(medication_name)) > 0),
  constraint order_items_quantity_positive
    check (quantity > 0),
  constraint order_items_unit_price_non_negative
    check (unit_price >= 0),
  -- welfare_home_id is derived by trigger; the composite FK keeps item and
  -- order in the same home.
  constraint order_items_order_same_home
    foreign key (order_id, welfare_home_id)
    references public.orders (id, welfare_home_id)
    on delete cascade,
  constraint order_items_id_welfare_home_id_key
    unique (id, welfare_home_id)
);

comment on table public.order_items is
  'Medication lines as the pharmacy sees them: a snapshot with no inventory or resident key.';

create index order_items_order_id_idx
  on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Tenant-private links
--
-- These two tables hold the only references from an order to a resident or to
-- a resident-specific inventory row. They exist so that public.orders and
-- public.order_items stay completely free of patient keys: a pharmacy that can
-- read an order cannot derive who it is for, nor correlate two orders to the
-- same person through a stable inventory id.
--
-- Both are readable/writable only by the owning welfare_home (and system_admin).
-- ---------------------------------------------------------------------------
create table public.order_residents (
  order_id        uuid primary key references public.orders (id) on delete cascade,
  welfare_home_id uuid not null,
  resident_id     uuid not null,
  created_at      timestamptz not null default now(),
  constraint order_residents_order_same_home
    foreign key (order_id, welfare_home_id)
    references public.orders (id, welfare_home_id)
    on delete cascade,
  constraint order_residents_resident_same_home
    foreign key (resident_id, welfare_home_id)
    references public.residents (id, welfare_home_id)
);

comment on table public.order_residents is
  'Patient linkage for an order. Deliberately separate from orders so pharmacy_admin has no resident key to read.';

create index order_residents_resident_id_idx
  on public.order_residents (resident_id);

create table public.order_item_inventory (
  order_item_id     uuid primary key references public.order_items (id) on delete cascade,
  welfare_home_id   uuid not null,
  inventory_item_id uuid not null,
  created_at        timestamptz not null default now(),
  constraint order_item_inventory_item_same_home
    foreign key (order_item_id, welfare_home_id)
    references public.order_items (id, welfare_home_id)
    on delete cascade,
  constraint order_item_inventory_stock_same_home
    foreign key (inventory_item_id, welfare_home_id)
    references public.inventory_items (id, welfare_home_id)
    on delete cascade
);

comment on table public.order_item_inventory is
  'Which inventory row a line was drawn from (stock deduction / traceability). Hidden from pharmacy_admin so a resident-specific item id cannot be correlated across orders.';

create index order_item_inventory_inventory_item_id_idx
  on public.order_item_inventory (inventory_item_id);

-- Both child tables inherit the home from their parent, so clients only send
-- the real keys and the composite FKs can enforce same-home integrity.
create or replace function public.derive_link_welfare_home()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'order_residents' then
    select o.welfare_home_id into new.welfare_home_id
      from public.orders o where o.id = new.order_id;
  elsif tg_table_name = 'order_item_inventory' then
    select oi.welfare_home_id into new.welfare_home_id
      from public.order_items oi where oi.id = new.order_item_id;
  end if;
  return new;
end;
$$;

create trigger order_residents_derive_welfare_home
  before insert on public.order_residents
  for each row execute function public.derive_link_welfare_home();

create trigger order_item_inventory_derive_welfare_home
  before insert on public.order_item_inventory
  for each row execute function public.derive_link_welfare_home();



-- ---------------------------------------------------------------------------
-- Invoker-scope helpers
--
-- SECURITY DEFINER so a policy on public.profiles can call them without
-- recursing into profiles RLS. They are read-only lookups of the caller's own
-- row and are wrapped in scalar subqueries inside policies so Postgres
-- evaluates them once per statement (InitPlan) instead of once per row.
--
-- auth.uid() is still meaningful inside SECURITY DEFINER: it reads the JWT
-- claims of the request, not the function owner.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active;
$$;

create or replace function public.current_welfare_home_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.welfare_home_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role = 'welfare_admin';
$$;

create or replace function public.current_pharmacy_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.pharmacy_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role = 'pharmacy_admin';
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'system_admin'
      and p.is_active
  );
$$;

-- Used by the pharmacies SELECT policy. It is SECURITY DEFINER and therefore
-- opaque to the RLS rewriter: without it, "orders insert policy -> pharmacies
-- policy -> orders" would be detected as infinite policy recursion.
create or replace function public.welfare_home_has_ordered_with(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    where o.pharmacy_id = p_pharmacy_id
      and o.welfare_home_id = public.current_welfare_home_id()
  );
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_welfare_home_id() from public;
revoke all on function public.current_pharmacy_id() from public;
revoke all on function public.is_system_admin() from public;
revoke all on function public.welfare_home_has_ordered_with(uuid) from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_welfare_home_id() to authenticated;
grant execute on function public.current_pharmacy_id() to authenticated;
grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.welfare_home_has_ordered_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger welfare_homes_set_updated_at
  before update on public.welfare_homes
  for each row execute function public.set_updated_at();

create trigger pharmacies_set_updated_at
  before update on public.pharmacies
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger residents_set_updated_at
  before update on public.residents
  for each row execute function public.set_updated_at();

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile guard — a user may edit their own profile, but only system_admin
-- (or a service-role/direct-SQL connection, where auth.uid() is null) may
-- change role, tenant binding or activation state.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null for service_role / migrations / psql: trusted.
  if auth.uid() is null or public.is_system_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.welfare_home_id is distinct from old.welfare_home_id
     or new.pharmacy_id is distinct from old.pharmacy_id
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    raise exception
      'Only a system_admin may change role, tenant binding, email or activation state'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Order status state machine
--   pending  -> accepted | rejected   (pharmacy_admin)
--   pending  -> cancelled             (welfare_admin — withdrawal, never a delete)
--   accepted -> prepared              (pharmacy_admin)
--   prepared -> completed             (pharmacy_admin or welfare_admin)
--   system_admin / service_role       any transition in the graph above
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_status_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id      uuid := auth.uid();
  actor_role    public.user_role := public.current_profile_role();
  is_trusted    boolean := actor_id is null
                           or public.current_profile_role() = 'system_admin';
  is_transition boolean := new.status is distinct from old.status;
  is_allowed    boolean := false;
begin
  -- Tenancy/origin fields are immutable for every tenant-scoped caller.
  if not is_trusted then
    if new.order_number   is distinct from old.order_number
       or new.welfare_home_id is distinct from old.welfare_home_id
       or new.pharmacy_id     is distinct from old.pharmacy_id
       or new.requested_by    is distinct from old.requested_by
       or new.submitted_at    is distinct from old.submitted_at then
      raise exception 'Order tenancy, number and origin fields are immutable'
        using errcode = '42501';
    end if;
  end if;

  if not is_transition then
    return new;
  end if;

  -- 1. Is this an edge in the locked state machine?
  is_allowed := (old.status::text, new.status::text) in (
    ('pending',  'accepted'),
    ('pending',  'rejected'),
    ('pending',  'cancelled'),
    ('accepted', 'prepared'),
    ('prepared', 'completed')
  );

  -- 2. Is the caller's role allowed to drive that edge?
  if is_allowed and not is_trusted then
    is_allowed := case
      when new.status in ('accepted', 'rejected') then actor_role = 'pharmacy_admin'
      when new.status = 'prepared'                then actor_role = 'pharmacy_admin'
      when new.status = 'completed'               then actor_role in ('pharmacy_admin', 'welfare_admin')
      when new.status = 'cancelled'               then actor_role = 'welfare_admin'
      else false
    end;
  end if;

  if not is_allowed then
    raise exception 'Illegal order status transition: % -> %', old.status, new.status
      using errcode = '42501';
  end if;

  new.status_changed_at := now();

  if new.status = 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
    new.decided_by  := coalesce(new.decided_by, actor_id);
    new.rejection_reason := null;
  elsif new.status = 'rejected' then
    new.decided_by := coalesce(new.decided_by, actor_id);
  elsif new.status = 'prepared' then
    new.prepared_at := coalesce(new.prepared_at, now());
  elsif new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

create trigger orders_enforce_status_rules
  before update on public.orders
  for each row execute function public.enforce_order_status_rules();

-- ---------------------------------------------------------------------------
-- Order totals are derived from order_items; clients can never drift them.
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_order_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set total_amount = coalesce(
           (select sum(oi.line_total)
              from public.order_items oi
             where oi.order_id = target_order), 0)
   where o.id = target_order;
  return null;
end;
$$;

create or replace function public.force_order_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- On INSERT there are no items yet, so this yields 0.
  new.total_amount := coalesce(
    (select sum(oi.line_total)
       from public.order_items oi
      where oi.order_id = new.id), 0);
  return new;
end;
$$;

create trigger orders_force_total
  before insert or update on public.orders
  for each row execute function public.force_order_total();

create trigger order_items_recalculate_total
  after insert or update or delete on public.order_items
  for each row execute function public.recalculate_order_total();

-- ---------------------------------------------------------------------------
-- Item lines inherit their order's welfare home (used by the composite FK and
-- by the tenant-private inventory link).
-- ---------------------------------------------------------------------------
create or replace function public.derive_order_item_welfare_home()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select o.welfare_home_id
    into new.welfare_home_id
    from public.orders o
   where o.id = new.order_id;
  return new;
end;
$$;

create trigger order_items_derive_welfare_home
  before insert or update of order_id on public.order_items
  for each row execute function public.derive_order_item_welfare_home();

-- ---------------------------------------------------------------------------
-- Item lines freeze as soon as the pharmacy acts on the order.
-- ---------------------------------------------------------------------------
create or replace function public.guard_order_item_edits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_order  uuid := coalesce(new.order_id, old.order_id);
  order_state   public.order_status;
begin
  select o.status into order_state
    from public.orders o
   where o.id = target_order;

  if order_state is null then
    -- Parent already gone (cascade); nothing to guard.
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if order_state <> 'pending' then
    raise exception 'Order items are read-only once the order leaves pending (current: %)', order_state
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger order_items_guard_edits
  before insert or update or delete on public.order_items
  for each row execute function public.guard_order_item_edits();

-- ---------------------------------------------------------------------------
-- Self-service profile bootstrap for invited users.
--
-- Only tenant roles are accepted from user metadata. A 'system_admin' value is
-- deliberately ignored (the auth user is still created) and must be granted
-- afterwards by SQL, so nobody can self-assign platform-wide privileges.
--
-- Operationally: disable public sign-ups in Supabase Auth and provision tenant
-- admins through the Admin API with role + tenancy metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  role_text    text := meta ->> 'role';
  home_id      uuid := nullif(meta ->> 'welfare_home_id', '')::uuid;
  pharmacy     uuid := nullif(meta ->> 'pharmacy_id', '')::uuid;
  granted_role public.user_role;
begin
  -- No role claim: auth user was created by an operator (Dashboard/Admin API or
  -- SQL); the profile is provisioned separately. Never auto-create one here.
  if role_text is null then
    return new;
  end if;

  -- Privileged role requested from untrusted metadata: create no profile.
  if role_text = 'system_admin' then
    return new;
  end if;

  if role_text not in ('welfare_admin', 'pharmacy_admin') then
    raise exception 'Unsupported role in signup metadata: %', role_text;
  end if;

  granted_role := role_text::public.user_role;

  if granted_role = 'welfare_admin' and home_id is null then
    raise exception 'welfare_admin signups require a welfare_home_id in user metadata';
  end if;

  if granted_role = 'pharmacy_admin' and pharmacy is null then
    raise exception 'pharmacy_admin signups require a pharmacy_id in user metadata';
  end if;

  insert into public.profiles (id, email, full_name, role, welfare_home_id, pharmacy_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(meta ->> 'full_name', ''), split_part(new.email, '@', 1)),
    granted_role,
    home_id,
    pharmacy
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
