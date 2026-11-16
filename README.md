# Pharmacy & Welfare Medication Platform

Monorepo for a B2B medication ordering platform: welfare homes order from
registered pharmacies, with strict tenant isolation and no patient identifiers
on pharmacy-facing rows.

```
frontend/   Next.js 16 (App Router, TypeScript, Tailwind CSS)
backend/    FastAPI (Pydantic v2)
supabase/   SQL migrations: schema, RLS, audit trail
```

## Status

- **Phase 1 — database:** applied and verified. `supabase/migrations` contains
  the schema, the RLS matrix, the order state machine (including
  `pending -> cancelled`) and the append-only audit trail.
- **Phase 2 — scaffolding:** auth wiring and role routing are live. The
  dashboards show the signed-in administrator's role and tenant but no domain
  data yet.
- **Phase 3 — administration:** `/admin` onboards welfare homes and pharmacies
  and provisions their administrator accounts. Account creation and activation
  go through FastAPI with the service role; every list is read under RLS.
- **Phase 4 — welfare home:** `/welfare?tab=residents|inventory|orders` gives a
  welfare administrator the resident register, hybrid pooled/resident stock,
  and direct medication ordering with lifecycle actions and the audit timeline.
  Every read and write is scoped by RLS to the caller's `welfare_home_id`.
- **Phase 5 — pharmacy fulfilment:** `/pharmacy` gives a pharmacy administrator
  the incoming order queue with status filters, welfare-home delivery details,
  line-item pricing while an order is pending, and the
  accept / reject / prepare / complete lifecycle with the audit timeline. The
  portal never queries any resident or stock table.

## Setup

1. Copy `.env.example` to `.env.local` at the repository root and fill in the
   Supabase URL, anon key and service-role key. Both apps read that single file.
   `SUPABASE_SERVICE_ROLE_KEY` is used only by FastAPI for provisioning.
2. In Supabase Auth, disable public sign-ups and add
   `http://localhost:3000/invite` to the redirect URL allow-list so invitation
   links can reach the password screen.
3. Frontend:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
4. Backend:
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\python -m pip install -r requirements.txt
   .\.venv\Scripts\uvicorn app.main:app --reload --port 8000
   ```

Verification:

```powershell
cd frontend; npx tsc --noEmit; npm run lint; npm run build
cd ..\backend; .\.venv\Scripts\python tests\test_admin_smoke.py
cd ..\backend; .\.venv\Scripts\python -c "from app.main import app"
```

## Onboarding a tenant without SQL

1. Sign in as a `system_admin` and open `/admin`.
2. On **Welfare homes** or **Pharmacies**, register the tenant.
3. On **Administrators**, choose the role and tenant, then either send an
   invitation email or set a temporary password. The backend creates the auth
   user with the metadata `handle_new_user()` expects and verifies the resulting
   profile.
4. Deactivate rather than delete: tenant and account deactivation block access
   while preserving order history and audit rows.

## Access model

| Role | Area | Tenant binding |
| --- | --- | --- |
| `system_admin` | `/admin` | platform-wide |
| `welfare_admin` | `/welfare` | exactly one welfare home |
| `pharmacy_admin` | `/pharmacy` | exactly one pharmacy |

Accounts are provisioned by an administrator; there is no public sign-up.
Role and tenancy are always read from `public.profiles` on the server, never
from JWT metadata, and every query runs as the signed-in user so Row Level
Security remains the final authority.

See `frontend/README.md`, `backend/README.md` and `supabase/README.md` for the
details.
