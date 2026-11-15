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

## Setup

1. Copy `.env.example` to `.env.local` at the repository root and fill in the
   Supabase URL and anon key. Both apps read that single file.
2. Frontend:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
3. Backend:
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\python -m pip install -r requirements.txt
   .\.venv\Scripts\uvicorn app.main:app --reload --port 8000
   ```

Verification the scaffold was built against:

```powershell
cd frontend; npm run build
cd ..\backend; .\.venv\Scripts\python -c "from app.main import app"
```

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
