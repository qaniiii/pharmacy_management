# Frontend — Next.js 16

App Router, TypeScript, Tailwind CSS 4. Phase 3 adds the system-admin portal:
welfare-home and pharmacy onboarding, tenant selection, administrator
provisioning and account activation. Welfare/pharmacy domain screens (residents,
inventory, orders) are still to come.

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
  welfare/ pharmacy/    role dashboards
components/
  app-header.tsx        shared authenticated header/footer
  role-dashboard.tsx    welfare/pharmacy placeholder dashboard
  admin/                forms, tables, badges, tab nav, status toggles
lib/
  env.ts                required public env vars
  api/backend.ts        server-side FastAPI client (Bearer token from Supabase)
  admin/                data loaders, validation, form state, tab routing
  supabase/client.ts    browser client
  supabase/server.ts    cookie-bound server client
  auth/                 role map, profile guard, tenant loading, actions
  types/database.ts     hand-written mirror of supabase/migrations
  types/api.ts          FastAPI payloads and responses
proxy.ts                session refresh + route guard (Next 16 proxy)
```

`lib/types/database.ts` is hand-maintained against
`supabase/migrations/20261115000100_core_schema.sql` and
`20261115000300_order_audit.sql`. It includes `order_residents`,
`order_item_inventory`, the `cancelled` order status and the
`profiles → welfare_homes/pharmacies` relations used by embedded selects.
Regenerate from the database if the schema moves faster than the migrations.
