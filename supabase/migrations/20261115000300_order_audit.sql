-- =============================================================================
-- Migration 3 of 3 — Order audit trail
--
-- Every INSERT and every status transition on public.orders is written to
-- public.order_audit_logs by a SECURITY DEFINER trigger, so the trail cannot be
-- forged or suppressed by a tenant-scoped caller (there is no INSERT policy).
-- The log is append-only: UPDATE / DELETE / TRUNCATE are rejected by trigger.
-- =============================================================================

begin;

create table public.order_audit_logs (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete restrict,
  from_status public.order_status,               -- NULL = order creation
  to_status   public.order_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
);

comment on table public.order_audit_logs is
  'Append-only audit trail of order creation and status transitions. from_status IS NULL marks creation.';

create index order_audit_logs_order_id_changed_at_idx
  on public.order_audit_logs (order_id, changed_at desc);
create index order_audit_logs_changed_by_idx
  on public.order_audit_logs (changed_by) where changed_by is not null;

-- ---------------------------------------------------------------------------
-- Audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id   uuid := auth.uid();
  actor_role public.user_role := public.current_profile_role();
begin
  if tg_op = 'INSERT' then
    insert into public.order_audit_logs
      (order_id, from_status, to_status, changed_by, metadata)
    values (
      new.id,
      null,
      new.status,
      actor_id,
      jsonb_build_object(
        'event',          'order_created',
        'order_number',   new.order_number,
        'welfare_home_id', new.welfare_home_id,
        'pharmacy_id',    new.pharmacy_id,
        'actor_role',     actor_role
      )
    );
    return new;
  end if;

  -- UPDATE OF status also fires when status is set to its current value;
  -- only record real transitions.
  if new.status is distinct from old.status then
    insert into public.order_audit_logs
      (order_id, from_status, to_status, changed_by, metadata)
    values (
      new.id,
      old.status,
      new.status,
      actor_id,
      jsonb_build_object(
        'event',            'status_changed',
        'order_number',     new.order_number,
        'previous_status',  old.status,
        'new_status',       new.status,
        'rejection_reason', new.rejection_reason,
        'actor_role',       actor_role
      )
    );
  end if;

  return new;
end;
$$;

create trigger orders_audit_status_change
  after insert or update of status on public.orders
  for each row execute function public.log_order_status_change();

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'order_audit_logs is append-only'
    using errcode = '42501';
end;
$$;

create trigger order_audit_logs_no_update_or_delete
  before update or delete on public.order_audit_logs
  for each row execute function public.prevent_audit_log_mutation();

create trigger order_audit_logs_no_truncate
  before truncate on public.order_audit_logs
  for each statement execute function public.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- RLS: read-only, tenant-scoped through the parent order
-- ---------------------------------------------------------------------------
alter table public.order_audit_logs enable row level security;

revoke all on table public.order_audit_logs from anon, authenticated;
grant select on table public.order_audit_logs to authenticated;

create policy order_audit_logs_select
  on public.order_audit_logs for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and exists (
        select 1
        from public.orders o
        where o.id = order_audit_logs.order_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
      )
    )
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and exists (
        select 1
        from public.orders o
        where o.id = order_audit_logs.order_id
          and o.pharmacy_id = (select public.current_pharmacy_id())
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy exists: only the SECURITY DEFINER trigger and
-- the service role can write here.

-- ---------------------------------------------------------------------------
-- Baseline rows for orders that already existed before this migration.
-- (No-op on a fresh database.)
-- ---------------------------------------------------------------------------
insert into public.order_audit_logs
  (order_id, from_status, to_status, changed_by, changed_at, metadata)
select
  o.id,
  null,
  o.status,
  o.requested_by,
  o.created_at,
  jsonb_build_object(
    'event',        'backfill',
    'order_number', o.order_number,
    'note',         'Baseline snapshot captured when the audit trail was introduced'
  )
from public.orders o
where not exists (
  select 1 from public.order_audit_logs l where l.order_id = o.id
);

commit;
