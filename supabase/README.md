# Database layer (Supabase / PostgreSQL)

First deliverable only: schema, RLS and order audit. No frontend or backend code yet.

```
supabase/
  migrations/
    20261115000100_core_schema.sql          -- tables, constraints, triggers, state machine
    20261115000200_row_level_security.sql   -- RLS policies + grants
    20261115000300_order_audit.sql          -- order_audit_logs + trigger
    20261116000100_pharmacy_order_pricing.sql -- pharmacy-only unit_price policy + guard
```

Apply in that order (they are written to be run exactly once).

- CLI: `supabase link --project-ref <ref>` then `supabase db push`
- Or run the four files in order in the Supabase SQL editor.

`handle_new_user` attaches to `auth.users`, so the schema must exist before any
user is created.

## Security model

| Table | `system_admin` | `welfare_admin` | `pharmacy_admin` |
| --- | --- | --- | --- |
| `profiles` | read/update all | own row + colleagues in own home | own row + colleagues in own pharmacy |
| `welfare_homes` | all | own home | homes it has orders with |
| `pharmacies` | all | active pharmacies + its order history | own pharmacy |
| `residents` | all | own home only | **no policy — no access** |
| `inventory_items` | all | own home only | **no policy — no access** |
| `orders` | all | own home, insert as `pending`, may withdraw while pending | addressed to its pharmacy |
| `order_items` | all | own pending orders | read; update `unit_price` while pending |
| `order_residents` | all | own home, while order is pending | **no policy — no access** |
| `order_item_inventory` | all | own home, while order is pending | **no policy — no access** |
| `order_audit_logs` | read | own home via order | own pharmacy via order |

`pharmacy_admin` has no `SELECT`/`INSERT`/`UPDATE`/`DELETE` policy on
`residents` or `inventory_items`, so those tables return an empty result set and
writes fail regardless of what the client sends.

`order_items` pricing is deliberately narrow: migration 4 adds an UPDATE policy
for `pharmacy_admin` that is pinned to pending orders addressed to its own
pharmacy, and `guard_order_item_pharmacy_pricing` rejects any column change
other than `unit_price`. The pre-existing `guard_order_item_edits` trigger still
freezes every line once the order leaves `pending`.

Tenant scoping is derived from `auth.uid()` through `SECURITY DEFINER` helpers
(`current_profile_role`, `current_welfare_home_id`, `current_pharmacy_id`,
`is_system_admin`) so policies never recurse into `profiles` RLS.

## Domain rules encoded in the schema

- **Pooled vs resident stock**: `inventory_items.resident_id` is nullable.
  `NULL` = shared facility stock; set = prescription stock for that resident.
  A composite FK on `(resident_id, welfare_home_id)` makes it impossible to
  file one home's resident under another home. The FK is `MATCH SIMPLE`, so
  pooled rows (`resident_id IS NULL`) are unaffected.
- **Direct ordering**: `orders` carries exactly one `welfare_home_id` and one
  `pharmacy_id`. There is no bidding/quote table.
- **State machine** (trigger `enforce_order_status_rules`, not just RLS):

  | From | To | Actor |
  | --- | --- | --- |
  | `pending` | `accepted` / `rejected` | `pharmacy_admin` |
  | `pending` | `cancelled` | `welfare_admin` |
  | `accepted` | `prepared` | `pharmacy_admin` |
  | `prepared` | `completed` | `pharmacy_admin` or `welfare_admin` |

  Every other edge raises `42501`. Cancellation is a status change, never a
  delete; `cancelled` is terminal. Tenancy fields (`welfare_home_id`,
  `pharmacy_id`, `requested_by`, `order_number`, `submitted_at`) are immutable
  for tenant callers. `rejected` requires `rejection_reason`.
- **No patient keys on pharmacy-facing rows**: `orders` and `order_items` contain
  no `resident_id` and no `inventory_item_id`. The patient link lives in
  `order_residents` and the stock link in `order_item_inventory`; both are
  tenant-private (own home only) so a pharmacy cannot identify a resident or
  correlate two orders to the same person through a stable id. Use
  `orders.resident_reference` (e.g. `Wing-B/12`) for bag labelling and never put
  names, DOB or MRNs in it.
- **Totals** are derived: `order_items.line_total` is a generated column and
  `orders.total_amount` is forced from the lines on every write, so a client
  cannot post a fake total.
- **Frozen history**: `order_items`, `order_residents` and `order_item_inventory`
  become read-only once the order leaves `pending`; orders are not deletable
  through the API, and a withdrawal is a `cancelled` status.

## Audit trail

`orders_audit_status_change` fires `AFTER INSERT OR UPDATE OF status`, writing
`order_audit_logs` with `from_status`, `to_status`, `changed_by`, `changed_at`
and JSON metadata (order number, actor role, rejection reason). Creation is
logged with `from_status = NULL`, and a withdrawal is logged as
`pending -> cancelled`. Existing orders get one baseline row when the migration
runs.

The log is append-only: there is no insert/update/delete policy and triggers
reject `UPDATE`, `DELETE` and `TRUNCATE` even for the table owner.

## Account provisioning

1. **Disable public sign-ups** in Supabase Auth. This is required: tenant
   profiles are created from sign-up metadata.
2. Tenant admins are created through the Admin API / Dashboard with metadata:
   ```json
   { "role": "welfare_admin", "welfare_home_id": "<uuid>", "full_name": "..." }
   { "role": "pharmacy_admin", "pharmacy_id": "<uuid>", "full_name": "..." }
   ```
   Missing tenancy metadata is rejected at the database level.
3. The first `system_admin` is never trusted from metadata. Create the auth user
   (Dashboard), then grant the profile by SQL:
   ```sql
   insert into public.profiles (id, email, full_name, role)
   select id, email, 'Platform Admin', 'system_admin'
   from auth.users where email = 'admin@yourorg.test';
   ```
4. Only `system_admin` may change a profile's role, tenant binding, email or
   `is_active` (`guard_profile_privileges`). Users may still edit their own
   display name/phone.

## Operational notes

- Keep the `service_role` key server-side only; it bypasses RLS by design.
- Deactivate, don't delete: `residents` with stock or order history cannot be
  deleted (FK), and orders/audit rows are immutable. Use `is_active`.
- `orders.resident_id` no longer exists. For a resident-specific order, insert
  the link row while the order is pending:
  ```sql
  insert into public.order_residents (order_id, resident_id) values (<order>, <resident>);
  insert into public.order_item_inventory (order_item_id, inventory_item_id)
  values (<line>, <inventory item>);   -- optional traceability / stock deduction
  ```
  `welfare_home_id` on those rows is derived by trigger, and the composite FKs
  reject cross-home links. Both tables freeze once the order leaves `pending`.
- The pharmacy directory for a welfare admin includes inactive pharmacies only
  when an order history exists with them, so order history keeps its joins.
- Verification: the migrations were executed against an in-memory PostgreSQL
  (PGlite) with 60 assertions covering the RLS matrix, the full order lifecycle
  including withdrawal, the audit trail, PHI-isolation checks (including
  `information_schema` assertions that no patient keys exist on
  `orders`/`order_items`) and privilege-escalation attempts. All passed.
