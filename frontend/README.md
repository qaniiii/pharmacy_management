# Frontend — Next.js 16

App Router, TypeScript, Tailwind CSS 4. This is the Phase 2 scaffold: every
route is authenticated and role-gated, and the dashboards render real profile
and tenant rows. Domain screens (residents, inventory, orders) are not built
yet.

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

`SUPABASE_SERVICE_ROLE_KEY` is intentionally unreadable from this app. All
database access is made as the signed-in user, so RLS stays in force.

## Authentication model

- `proxy.ts` runs on every non-asset request: it refreshes the Supabase session,
  loads `profiles.role` / `profiles.is_active`, and enforces the area mapping.
- Unauthenticated → `/login?next=…`.
- Session without an active profile → cookies cleared → `/login?reason=account_unavailable`.
- Wrong area for the role → redirected to the caller's own dashboard.
- Each dashboard repeats the check in `requireRole()` as defence in depth.
- `/login` has no sign-up UI: accounts and profiles are provisioned by a system
  administrator through the Supabase Admin API or SQL.

## Layout

```
app/
  layout.tsx            root layout
  page.tsx              role-based redirect
  login/                server action + client form, no sign-up
  admin/ welfare/ pharmacy/   role dashboards
components/role-dashboard.tsx
lib/
  env.ts                required public env vars
  supabase/client.ts    browser client
  supabase/server.ts    cookie-bound server client
  auth/                 role map, profile guard, tenant loading, actions
  types/database.ts     hand-written mirror of supabase/migrations
proxy.ts                session refresh + route guard (Next 16 proxy)
```

`lib/types/database.ts` is hand-maintained against
`supabase/migrations/20261115000100_core_schema.sql` and
`20261115000300_order_audit.sql`. It includes `order_residents` and
`order_item_inventory` and the `cancelled` order status. Regenerate from the
database if the schema moves faster than the migrations.
