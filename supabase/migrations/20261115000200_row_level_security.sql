-- =============================================================================
-- Migration 2 of 3 — Row Level Security
--
-- Model enforced here:
--   * pharmacy_admin  -> may read orders (and their lines) addressed to its own
--                        pharmacy, and its own pharmacy/profile rows.
--                        It has NO policy on residents or inventory_items, so
--                        those tables are unreadable and unwritable for it.
--   * welfare_admin   -> every policy is additionally pinned to
--                        welfare_home_id = current_welfare_home_id().
--   * system_admin    -> platform-wide access, including PHI (break-glass/support).
--
-- Notes:
--   * RLS is the only client-facing gate. service_role bypasses RLS by design
--     and must never be exposed to the browser.
--   * Helper calls are wrapped in scalar subqueries so they are evaluated once
--     per statement rather than once per row.
-- =============================================================================

begin;

alter table public.welfare_homes   enable row level security;
alter table public.pharmacies      enable row level security;
alter table public.profiles        enable row level security;
alter table public.residents       enable row level security;
alter table public.inventory_items enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.order_residents enable row level security;
alter table public.order_item_inventory enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges: start from zero for anon, then grant the minimum per table.
-- (RLS still applies on top of these grants.)
-- ---------------------------------------------------------------------------
revoke all on table
  public.welfare_homes,
  public.pharmacies,
  public.profiles,
  public.residents,
  public.inventory_items,
  public.orders,
  public.order_items,
  public.order_residents,
  public.order_item_inventory
  from anon, authenticated;

grant select on table public.welfare_homes, public.pharmacies, public.profiles       to authenticated;
grant insert, update, delete on table public.welfare_homes, public.pharmacies        to authenticated;
grant update, delete on table public.profiles                                        to authenticated;
grant select, insert, update, delete on table public.residents, public.inventory_items to authenticated;
grant select, insert, update on table public.orders                                  to authenticated;
grant select, insert, update, delete on table public.order_items                     to authenticated;
grant select, insert, delete on table public.order_residents                         to authenticated;
grant select, insert, delete on table public.order_item_inventory                    to authenticated;

-- Needed because orders.order_number is generated from this sequence in a
-- column default, which is evaluated as the inserting role.
grant usage on sequence public.order_number_seq to authenticated;

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_system_admin
  on public.profiles for select to authenticated
  using ((select public.is_system_admin()));

-- Colleagues inside the same tenant may see each other (e.g. an audit trail
-- rendered with requester names), but never across tenants.
create policy profiles_select_same_tenant
  on public.profiles for select to authenticated
  using (
    (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and pharmacy_id = (select public.current_pharmacy_id())
    )
  );

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_system_admin
  on public.profiles for update to authenticated
  using ((select public.is_system_admin()))
  with check ((select public.is_system_admin()));

create policy profiles_delete_system_admin
  on public.profiles for delete to authenticated
  using ((select public.is_system_admin()));

-- No INSERT policy: rows are created by the auth.users trigger (security
-- definer) or by the service role.

-- ===========================================================================
-- welfare_homes
-- ===========================================================================
create policy welfare_homes_select
  on public.welfare_homes for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and id = (select public.current_welfare_home_id())
    )
    -- A pharmacy may resolve the name/address of homes it actually serves.
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and exists (
        select 1
        from public.orders o
        where o.welfare_home_id = welfare_homes.id
          and o.pharmacy_id = (select public.current_pharmacy_id())
      )
    )
  );

create policy welfare_homes_update
  on public.welfare_homes for update to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and id = (select public.current_welfare_home_id())
    )
  )
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and id = (select public.current_welfare_home_id())
    )
  );

create policy welfare_homes_insert_system_admin
  on public.welfare_homes for insert to authenticated
  with check ((select public.is_system_admin()));

create policy welfare_homes_delete_system_admin
  on public.welfare_homes for delete to authenticated
  using ((select public.is_system_admin()));

-- ===========================================================================
-- pharmacies
-- ===========================================================================
create policy pharmacies_select
  on public.pharmacies for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and id = (select public.current_pharmacy_id())
    )
    -- Directory for the ordering screen: active pharmacies, plus any pharmacy
    -- this home already has order history with (so history never loses joins).
    -- The helper is SECURITY DEFINER to avoid orders <-> pharmacies policy
    -- recursion.
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and (
        is_active
        or (select public.welfare_home_has_ordered_with(pharmacies.id))
      )
    )
  );

create policy pharmacies_update
  on public.pharmacies for update to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and id = (select public.current_pharmacy_id())
    )
  )
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and id = (select public.current_pharmacy_id())
    )
  );

create policy pharmacies_insert_system_admin
  on public.pharmacies for insert to authenticated
  with check ((select public.is_system_admin()));

create policy pharmacies_delete_system_admin
  on public.pharmacies for delete to authenticated
  using ((select public.is_system_admin()));

-- ===========================================================================
-- residents — PHI. Deliberately NO policy for pharmacy_admin.
-- ===========================================================================
create policy residents_select_welfare_admin
  on public.residents for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy residents_insert_welfare_admin
  on public.residents for insert to authenticated
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy residents_update_welfare_admin
  on public.residents for update to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  )
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy residents_delete_welfare_admin
  on public.residents for delete to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

-- ===========================================================================
-- inventory_items — pooled + resident stock. NO policy for pharmacy_admin.
-- ===========================================================================
create policy inventory_items_select_welfare_admin
  on public.inventory_items for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy inventory_items_insert_welfare_admin
  on public.inventory_items for insert to authenticated
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy inventory_items_update_welfare_admin
  on public.inventory_items for update to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  )
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy inventory_items_delete_welfare_admin
  on public.inventory_items for delete to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

-- ===========================================================================
-- orders
-- ===========================================================================
create policy orders_select
  on public.orders for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and pharmacy_id = (select public.current_pharmacy_id())
    )
  );

-- Welfare admins open orders only for their own home, only as 'pending', only
-- against an active registered pharmacy, and only under their own name.
create policy orders_insert_welfare_admin
  on public.orders for insert to authenticated
  with check (
    (select public.current_profile_role()) = 'welfare_admin'
    and welfare_home_id = (select public.current_welfare_home_id())
    and status = 'pending'
    and requested_by = (select auth.uid())
    and exists (
      select 1
      from public.pharmacies p
      where p.id = pharmacy_id
        and p.is_active
    )
  );

-- Welfare admins may edit their own order while it is pending, may withdraw it
-- (pending -> cancelled), and may confirm receipt once it was prepared. The
-- trigger in migration 1 rejects every status edge they may not drive, and
-- cancelled/completed orders drop out of this policy entirely.
create policy orders_update_welfare_admin
  on public.orders for update to authenticated
  using (
    (select public.current_profile_role()) = 'welfare_admin'
    and welfare_home_id = (select public.current_welfare_home_id())
    and status in ('pending', 'prepared')
  )
  with check (
    (select public.current_profile_role()) = 'welfare_admin'
    and welfare_home_id = (select public.current_welfare_home_id())
    and status in ('pending', 'prepared', 'completed', 'cancelled')
  );

-- Pharmacies act only on orders addressed to them and cannot re-target them.
create policy orders_update_pharmacy_admin
  on public.orders for update to authenticated
  using (
    (select public.current_profile_role()) = 'pharmacy_admin'
    and pharmacy_id = (select public.current_pharmacy_id())
  )
  with check (
    (select public.current_profile_role()) = 'pharmacy_admin'
    and pharmacy_id = (select public.current_pharmacy_id())
  );

create policy orders_update_system_admin
  on public.orders for update to authenticated
  using ((select public.is_system_admin()))
  with check ((select public.is_system_admin()));

-- Intentionally no DELETE policy: orders are append-only history.
-- Cancelling/inactivating happens through state, not deletion.

-- ===========================================================================
-- order_items
-- ===========================================================================
create policy order_items_select
  on public.order_items for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and exists (
        select 1
        from public.orders o
        where o.id = order_items.order_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
      )
    )
    or (
      (select public.current_profile_role()) = 'pharmacy_admin'
      and exists (
        select 1
        from public.orders o
        where o.id = order_items.order_id
          and o.pharmacy_id = (select public.current_pharmacy_id())
      )
    )
  );

create policy order_items_insert_welfare_admin
  on public.order_items for insert to authenticated
  with check (
    (select public.current_profile_role()) = 'welfare_admin'
    and welfare_home_id = (select public.current_welfare_home_id())
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.welfare_home_id = (select public.current_welfare_home_id())
        and o.status = 'pending'
    )
  );

create policy order_items_update_welfare_admin
  on public.order_items for update to authenticated
  using (
    (select public.current_profile_role()) = 'welfare_admin'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.welfare_home_id = (select public.current_welfare_home_id())
        and o.status = 'pending'
    )
  )
  with check (
    (select public.current_profile_role()) = 'welfare_admin'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.welfare_home_id = (select public.current_welfare_home_id())
        and o.status = 'pending'
    )
  );

create policy order_items_delete_welfare_admin
  on public.order_items for delete to authenticated
  using (
    (select public.current_profile_role()) = 'welfare_admin'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.welfare_home_id = (select public.current_welfare_home_id())
        and o.status = 'pending'
    )
  );

-- ===========================================================================
-- order_residents / order_item_inventory — tenant-private patient linkage.
-- No policy exists for pharmacy_admin on either table, so it can neither read
-- nor write them. Rows are immutable once created (keys only); edits are made by
-- deleting and re-adding while the order is still pending.
-- ===========================================================================
create policy order_residents_select_welfare_admin
  on public.order_residents for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy order_residents_insert_welfare_admin
  on public.order_residents for insert to authenticated
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
      and exists (
        select 1
        from public.orders o
        where o.id = order_residents.order_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
          and o.status = 'pending'
      )
    )
  );

create policy order_residents_delete_welfare_admin
  on public.order_residents for delete to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
      and exists (
        select 1
        from public.orders o
        where o.id = order_residents.order_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
          and o.status = 'pending'
      )
    )
  );

create policy order_item_inventory_select_welfare_admin
  on public.order_item_inventory for select to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
    )
  );

create policy order_item_inventory_insert_welfare_admin
  on public.order_item_inventory for insert to authenticated
  with check (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
      and exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.id = order_item_inventory.order_item_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
          and o.status = 'pending'
      )
    )
  );

create policy order_item_inventory_delete_welfare_admin
  on public.order_item_inventory for delete to authenticated
  using (
    (select public.is_system_admin())
    or (
      (select public.current_profile_role()) = 'welfare_admin'
      and welfare_home_id = (select public.current_welfare_home_id())
      and exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.id = order_item_inventory.order_item_id
          and o.welfare_home_id = (select public.current_welfare_home_id())
          and o.status = 'pending'
      )
    )
  );

commit;
