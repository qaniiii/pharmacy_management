-- =============================================================================
-- Migration 5 — Automatic stock reconciliation on order completion
--
-- When a welfare home confirms receipt (prepared -> completed), every order
-- line that was linked to a stock row in `order_item_inventory` should top the
-- linked `inventory_items` row back up by the ordered quantity.
--
-- The write cannot be driven by the caller: `order_item_inventory` and
-- `inventory_items` have no pharmacy_admin RLS policy, so a pharmacy completing
-- the order would be unable to read the links or update the stock. The trigger
-- function is therefore SECURITY DEFINER and runs as its owner, while every
-- other gate (state machine, RLS, grants) is unchanged.
--
-- Guarantees:
--   * Fires strictly on OLD.status = 'prepared' AND NEW.status = 'completed'
--     (the WHEN clause and the transition check agree).
--   * Only lines with an explicit stock link are reconciled; unlinked lines
--     (free-text medication) are ignored.
--   * The inventory row and the line must both belong to the order's welfare
--     home, so a forged cross-tenant link can never credit another home.
--   * Several order lines pointing at the same stock row are summed first, so
--     the update applies once per inventory row.
--   * The transition completed -> completed is not an allowed edge, and the
--     trigger never fires on it, so a stock row cannot be credited twice.
--
-- No PHI table is read and no RLS policy is broadened.
-- =============================================================================

begin;

create or replace function public.reconcile_inventory_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Defence in depth: the trigger WHEN clause already restricts this, but keep
  -- the function itself tied to the one transition it is allowed to credit.
  if old.status <> 'prepared' or new.status <> 'completed' then
    return null;
  end if;

  with restock as (
    select link.inventory_item_id as inventory_item_id,
           sum(item.quantity)     as quantity
      from public.order_items item
      join public.order_item_inventory link
        on link.order_item_id = item.id
     where item.order_id = new.id
       and item.welfare_home_id = new.welfare_home_id
       and link.welfare_home_id = new.welfare_home_id
     group by link.inventory_item_id
  )
  update public.inventory_items inv
     set quantity_on_hand = inv.quantity_on_hand + restock.quantity
    from restock
   where inv.id = restock.inventory_item_id
     and inv.welfare_home_id = new.welfare_home_id;

  return null;
end;
$$;

comment on function public.reconcile_inventory_on_order_completed() is
  'Credits linked inventory rows when an order moves prepared -> completed. SECURITY DEFINER so a pharmacy-driven completion works without exposing stock or resident links to pharmacy RLS.';

create trigger orders_reconcile_inventory_on_completed
  after update of status on public.orders
  for each row
  when (old.status = 'prepared' and new.status = 'completed')
  execute function public.reconcile_inventory_on_order_completed();

-- Trigger functions cannot be invoked directly; remove the implicit PUBLIC
-- execute grant anyway so the surface stays explicit.
revoke all on function public.reconcile_inventory_on_order_completed() from public;

commit;
