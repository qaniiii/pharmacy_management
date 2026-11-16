-- =============================================================================
-- Migration 4 — Pharmacy order-item pricing
--
-- A pharmacy must be able to price the medication lines of an order that is
-- still pending, immediately before accepting it. The original RLS matrix only
-- let the owning welfare home update order_items, so a pharmacy's price write
-- was filtered out by RLS.
--
-- This migration:
--   1. Adds the missing tenant-scoped UPDATE policy for pharmacy_admin.
--   2. Adds a BEFORE UPDATE guard that restricts a pharmacy to changing
--      unit_price only: medication, quantity, notes and tenancy keys stay owned
--      by the welfare home. The existing guard_order_item_edits trigger still
--      freezes every line as soon as the order leaves pending.
--
-- No PHI table is touched, and pharmacy_admin still has no policy on residents,
-- inventory_items, order_residents or order_item_inventory.
-- =============================================================================

begin;

create policy order_items_update_pharmacy_admin
  on public.order_items for update to authenticated
  using (
    (select public.current_profile_role()) = 'pharmacy_admin'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.pharmacy_id = (select public.current_pharmacy_id())
        and o.status = 'pending'
    )
  )
  with check (
    (select public.current_profile_role()) = 'pharmacy_admin'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.pharmacy_id = (select public.current_pharmacy_id())
        and o.status = 'pending'
    )
  );

create or replace function public.guard_order_item_pharmacy_pricing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The welfare home owns the clinical content; a pharmacy may only price it.
  -- service_role / direct SQL (auth.uid() is null) is unrestricted.
  if public.current_profile_role() = 'pharmacy_admin' then
    if new.order_id         is distinct from old.order_id
       or new.welfare_home_id is distinct from old.welfare_home_id
       or new.medication_name is distinct from old.medication_name
       or new.strength      is distinct from old.strength
       or new.dosage_form   is distinct from old.dosage_form
       or new.unit          is distinct from old.unit
       or new.quantity      is distinct from old.quantity
       or new.notes         is distinct from old.notes then
      raise exception 'A pharmacy may only update the unit price of a pending order item'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger order_items_guard_pharmacy_pricing
  before update on public.order_items
  for each row execute function public.guard_order_item_pharmacy_pricing();

commit;
