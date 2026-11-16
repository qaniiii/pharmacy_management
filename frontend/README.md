# Frontend — Next.js 16

App Router, TypeScript, Tailwind CSS 4. Phase 3 adds the system-admin portal:
welfare-home and pharmacy onboarding, tenant selection, administrator
provisioning and account activation. Phase 4 adds the welfare-home workspace:
residents, hybrid inventory and direct medication ordering. Phase 5 adds the
pharmacy fulfilment portal: the incoming order queue, pending-order pricing and
the accept / reject / prepare / complete lifecycle.

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit
```

## Environment

The app reads the repository-root `.env.local` (loaded explicitly in
`next.config.ts` via `@next/env`, because Next only auto-loads env files from
the app directory):

| Variable | Needed by |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server |
| `API_BASE_URL` | server actions calling FastAPI (default `http://localhost:8000`) |

`SUPABASE_SERVICE_ROLE_KEY` is intentionally unreadable from this app. Reads and
tenant CRUD go to Supabase as the signed-in user, so RLS stays in force.
Provisioning and account activation are the only operations that need the
service role; they are delegated to FastAPI, which receives the caller's access
token and re-checks `system_admin`.

## Authentication model

- `proxy.ts` runs on every non-asset request: it refreshes the Supabase session,
  loads `profiles.role` / `profiles.is_active`, and enforces the area mapping.
- Unauthenticated → `/login?next=…`.
- Session without an active profile → cookies cleared → `/login?reason=account_unavailable`.
- Wrong area for the role → redirected to the caller's own dashboard.
- Each dashboard repeats the check in `requireRole()` as defence in depth.
- `/login` has no sign-up UI: accounts and profiles are provisioned by a system
  administrator.
- `/invite` is the one public landing page besides `/login`. It consumes the
  Supabase invitation fragment (or `?code=`) and asks the new administrator to
  choose a password. Add `<site-url>/invite` to the Supabase Auth redirect
  allow-list.

## Admin portal

`/admin?tab=welfare|pharmacies|users` is limited to `system_admin`:

| Tab | Reads (Supabase, RLS) | Writes |
| --- | --- | --- |
| Welfare homes | all `welfare_homes` | insert; toggle `is_active` |
| Pharmacies | all `pharmacies` | insert; toggle `is_active` |
| Administrators | all `profiles` joined to tenant names | `POST /api/v1/admin/users`; `PATCH …/status` via FastAPI |

- Tenant creates/deactivates run through server actions in `app/admin/actions.ts`
  using the cookie-bound Supabase client.
- Provisioning sends the strict `ProvisionUserPayload` to FastAPI. The backend
  creates the auth user with `handle_new_user()` metadata, patches the phone and
  verifies the resulting profile; failures roll the auth user back.
- Access can be delivered as an invitation email or a temporary password.
- Every action re-runs `requireRole("system_admin")`; the UI never sees the
  service-role key.
- The Users tab refuses to deactivate the current account in the UI; the backend
  additionally refuses self-deactivation and removing the last system admin.

## Welfare home workspace

`/welfare?tab=residents|inventory|orders` is limited to `welfare_admin`:

| Tab | Reads (Supabase, RLS) | Writes |
| --- | --- | --- |
| Residents | residents for the caller's home | insert; update; toggle `is_active` |
| Inventory | inventory plus resident names, joined in memory | insert; update; toggle `is_active`; dispense/restock quantity |
| Orders | orders, lines, private resident links and audit logs | create order (plus lines and private links); withdraw pending; confirm prepared receipt |

- The resident register exposes every schema field, including allergies and care
  notes. Records are deactivated rather than deleted.
- Inventory separates `resident_id IS NULL` pooled stock from
  resident-specific prescription stock. Low-stock (`quantity_on_hand <=
  reorder_level`) and expiring/expired batches are highlighted in the table.
- The order drawer writes `orders`, `order_items`, `order_residents` and
  `order_item_inventory` in that order. If a child write fails, the lines and
  private links are removed while the order is still pending and the order is
  cancelled, so no orphaned pending draft is left behind.
- The bag reference is the only resident-related field visible to the pharmacy.
  The drawer warns against names/DOB/MRNs and the server refuses a reference
  that contains the linked resident's name or medical record number.
- Withdraw is `pending -> cancelled`; confirm receipt is `prepared -> completed`.
  Both are enforced by the database state-machine trigger as well as RLS.

## Pharmacy workspace

`/pharmacy` is limited to `pharmacy_admin` and shows only orders addressed to the
caller's pharmacy:

| Area | Reads (Supabase, RLS) | Writes |
| --- | --- | --- |
| Order queue | orders, order items, audit logs and the requesting welfare home's name/address/contact | — |
| Pending order | same, with editable `unit_price` per line | save prices, then `pending -> accepted` |
| Rejection | same | `pending -> rejected` with a required reason |
| Fulfilment | same | `accepted -> prepared`; `prepared -> completed` |
| Header | own `pharmacies` row | — |

- Status pills filter the queue (All, Pending, Accepted, Prepared, Completed,
  Rejected, Cancelled) with counts derived from the live data.
- The portal never queries `residents`, `inventory_items`, `order_residents` or
  `order_item_inventory`. Only `orders.resident_reference` (the non-identifying
  bag label) is shown to the pharmacy.
- Prices can only be written while the order is pending. Migration
  `20261116000100_pharmacy_order_pricing.sql` adds the missing pharmacy
  `order_items` update policy plus a guard trigger that permits **only**
  `unit_price` changes. The existing guard freezes lines once the order leaves
  pending.
- Every transition is also enforced by `enforce_order_status_rules` and by RLS;
  a rejection requires a non-empty `rejection_reason` (check constraint too).
- The action layer derives `pharmacy_id` from `profiles`, never from a hidden
  field, and uses the cookie-bound Supabase client so RLS remains authoritative.

## Layout

```
app/
  layout.tsx            root layout
  page.tsx              role-based redirect
  login/                server action + client form, no sign-up
  invite/               invitation landing page; consumes Supabase token
  admin/
    page.tsx            tabbed platform-administration portal
    actions.ts          tenant CRUD + FastAPI provisioning actions
  welfare/
    page.tsx            resident, inventory and ordering workspace
    actions.ts          resident/stock CRUD, quantity, order lifecycle actions
  pharmacy/
    page.tsx            order queue, pricing and fulfilment workspace
    actions.ts          accept/reject/prepare/complete actions
components/
  app-header.tsx        shared authenticated header/footer
  role-dashboard.tsx    pharmacy placeholder dashboard
  admin/                forms, tables, badges, tab nav, status toggles
  welfare/              residents, inventory, order drawer/history, modals
  pharmacy/             order queue, fulfilment card, pricing/rejection forms
  orders/               shared order status badge
lib/
  env.ts                required public env vars
  api/backend.ts        server-side FastAPI client (Bearer token from Supabase)
  format.ts             shared locale-stable date/amount/quantity formatting
  admin/                data loaders, validation, form state, tab routing
  welfare/              data loaders, validation, tabs, inventory helpers
  pharmacy/             queue data loader, pricing/rejection validation, state
  supabase/client.ts    browser client
  supabase/server.ts    cookie-bound server client
  auth/                 role map, profile guard, tenant loading, actions
  types/database.ts     hand-written mirror of supabase/migrations
  types/api.ts          FastAPI payloads and responses
proxy.ts                session refresh + route guard (Next 16 proxy)
```

`lib/types/database.ts` is hand-maintained against
`supabase/migrations/20261115000100_core_schema.sql`,
`20261115000300_order_audit.sql` and
`20261116000100_pharmacy_order_pricing.sql`. It includes `order_residents`,
`order_item_inventory`, the `cancelled` order status and the
`profiles → welfare_homes/pharmacies` relations used by embedded selects.
Regenerate from the database if the schema moves faster than the migrations.
