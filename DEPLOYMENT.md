# Deployment checklist (Vercel + Render + Supabase)

Production topology:

| Piece | Host | Source | Public? |
| --- | --- | --- | --- |
| Next.js portal | Vercel | `/frontend` | yes |
| FastAPI service | Render | `/backend` | yes (CORS-limited) |
| Postgres + Auth | Supabase | `supabase/migrations` | via anon key + RLS |

Deploy in this order: **database → backend → frontend**. The frontend needs the
Render URL, and the backend needs the Vercel URL for CORS.

---

## 1. Database (Supabase)

Apply every migration once, in filename order, to the production project:

```
supabase/migrations/20261115000100_core_schema.sql
supabase/migrations/20261115000200_row_level_security.sql
supabase/migrations/20261115000300_order_audit.sql
supabase/migrations/20261116000100_pharmacy_order_pricing.sql
supabase/migrations/20261116000200_auto_stock_reconciliation.sql
```

- CLI: `supabase link --project-ref <ref>` then `supabase db push`
- Or paste each file into the Supabase SQL editor in order.
- `handle_new_user` attaches to `auth.users`, so the schema must exist **before**
  the first administrator is invited.
- After migrating, confirm in the dashboard that RLS is enabled on `residents`,
  `inventory_items`, `orders`, `order_items` and the link tables.
- Never put the service role key in the frontend, and never ship it to a browser.

## 2. Backend (Render)

The repo-root `render.yaml` is a blueprint for the API:

- `rootDir: backend`
- build: `pip install --upgrade pip && pip install -r requirements.txt`
- start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- health check: `/health`

Create the service with **New → Blueprint**, point it at this repository, then
fill in the variables marked `sync: false`:

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | used to verify caller tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | for `/admin` | server-only, bypasses RLS |
| `SUPABASE_JWT_SECRET` | no | only for legacy HS256 projects |
| `CORS_ORIGINS` | yes | the Vercel origin(s) — see below |
| `FRONTEND_BASE_URL` | yes | `https://<your-app>.vercel.app` |
| `ENVIRONMENT` | no | defaults to `production` in the blueprint |
| `PYTHON_VERSION` | no | pinned to `3.13.7` in the blueprint |

`app/core/config.py` reads plain OS environment variables. An env file is not
required and is ignored when absent; OS values always win over file values.

### CORS formats

`CORS_ORIGINS` accepts either form — both normalise to the same list:

```
["https://your-app.vercel.app","https://staging-your-app.vercel.app"]
https://your-app.vercel.app,https://staging-your-app.vercel.app
```

Origins must be scheme + host with **no path and no trailing slash**. Add the
custom domain too if one is attached. `BACKEND_CORS_ORIGINS` and
`CORS_ALLOW_ORIGINS` remain accepted aliases.

## 3. Frontend (Vercel)

Import the repository and set **Root Directory → `frontend`**. Next.js is
detected automatically; keep the default build command (`npm run build`).

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | inlined into the client bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public by design; RLS enforces access |
| `API_BASE_URL` | yes | the Render URL, e.g. `https://pharmacy-welfare-api.onrender.com` |

- `next.config.ts` falls back to `process.env` when no repo-root `.env.local`
  exists, so dashboard values are picked up on a clean Vercel checkout.
- Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.
- `NEXT_PUBLIC_*` values are baked in at build time: after changing one, trigger
  a new deployment rather than just restarting.

## 4. Post-deploy verification

1. `GET https://<render-service>/health` → `{"status":"ok", "environment":"production", "supabase_configured":true}`.
2. Sign in at `https://<vercel-app>/login` as a `system_admin`.
3. `/admin` → onboard a welfare home and a pharmacy, then activate both accounts.
4. `/welfare` → add a resident and stock, place an order.
5. `/pharmacy` → price the pending order, accept, prepare.
6. `/welfare` → confirm receipt; check that the linked stock quantity increased.
7. Both order views → run the billing export for the current month and confirm
   the CSV and print statement match the completed orders.
8. Browser devtools: the pharmacy portal must never request `residents`,
   `inventory_items`, `order_residents` or `order_item_inventory`.

## 5. Operational notes

- **Rotating keys:** update Supabase → Render env → Vercel env, then redeploy
  both services. `NEXT_PUBLIC_*` changes need a frontend rebuild.
- **CORS failures** are almost always a trailing slash, a missing scheme, or a
  Vercel preview URL that was never added to `CORS_ORIGINS`.
- **Cold starts** on Render's free plan can delay the first request; the health
  probe warms the service.
- **Rollbacks:** Vercel keeps immutable deployments (promote a previous one).
  Render redeploys the selected commit. Migrations are forward-only — write a
  new migration rather than editing an applied file.
