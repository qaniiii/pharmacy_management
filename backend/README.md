# Backend — FastAPI

Typed settings, Supabase token verification, CORS, a health probe and the
system-admin provisioning endpoints. Every other domain endpoint will follow the
same rule: authenticate as the caller and let Row Level Security decide access.

## Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: <http://localhost:8000/docs>

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | none | Process liveness; does not call Supabase |
| `GET` | `/api/v1/me` | Bearer | Resolved role and tenant binding |
| `POST` | `/api/v1/admin/users` | `system_admin` | Create a tenant administrator |
| `PATCH` | `/api/v1/admin/users/{user_id}/status` | `system_admin` | Activate/deactivate an account |

## Configuration

`app/core/config.py` reads OS environment variables first and then, for local
development, the repository-root `.env.local` (falling back to `.env`), so the
frontend and API can share one secret store. **No env file is required**: missing
files are ignored, which is what Render and CI rely on.

Required keys: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
with optional `SUPABASE_URL` / `SUPABASE_ANON_KEY` aliases.

`CORS_ORIGINS` (aliases `BACKEND_CORS_ORIGINS`, `CORS_ALLOW_ORIGINS`) accepts
either a JSON array or a comma-separated string, and defaults to
`http://localhost:3000`:

```dotenv
CORS_ORIGINS=["https://your-app.vercel.app"]
CORS_ORIGINS=https://your-app.vercel.app,https://staging.your-app.vercel.app
```

Entry order is preserved and duplicates are removed; a trailing slash on an
`http(s)` origin is stripped, because browsers never send one in `Origin`.

The admin endpoints additionally need:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Creates `auth.users` rows and updates `profiles`; server-only |
| `FRONTEND_BASE_URL` | Base URL used by Supabase invitation emails (default `http://localhost:3000`) |

A missing service-role key fails the admin endpoints with `503` instead of
falling back to a caller-scoped client.

## Token verification

`app/core/security.py`:

1. Reads the `Authorization: Bearer` header.
2. Verifies signature, `aud`, `iss` and `exp`.
   - `ES256`/`RS256` keys come from
     `<project>/auth/v1/.well-known/jwks.json`, cached in-process and refreshed
     on an unknown `kid` or after 10 minutes.
   - `HS256` is only accepted when `SUPABASE_JWT_SECRET` is configured.
3. Loads the caller's row from `public.profiles` through PostgREST **as that
   user** (`apikey` + their access token), so the `profiles_select_own` RLS
   policy applies and no service-role bypass is involved.
4. Returns `CurrentUser` with `role`, `welfare_home_id` and `pharmacy_id`.

The JWT's own `role` claim is `authenticated` and `user_metadata` is
user-writable, so neither is used for authorisation. A token that verifies but
has no profile — or an inactive one — is rejected with `403`.

`require_role(*roles)` is the dependency factory used by the admin routes.

## Administrator provisioning

`POST /api/v1/admin/users` accepts:

```json
{
  "email": "admin@home.org",
  "full_name": "Thandi Mokoena",
  "phone": "+27 82 000 0000",
  "role": "welfare_admin",
  "welfare_home_id": "00000000-0000-0000-0000-000000000000",
  "pharmacy_id": null,
  "password": "optional-temporary-password"
}
```

* Exactly one tenancy key must match `role`; `system_admin` cannot be provisioned
  through the API.
* With `password`, the account is created via `POST /auth/v1/admin/users` with
  `email_confirm: true`. Without it, `POST /auth/v1/invite` sends an invitation
  to `FRONTEND_BASE_URL/invite`, where the administrator sets their password.
* In both cases the `raw_user_meta_data` is exactly
  `{ role, full_name, welfare_home_id | pharmacy_id }`, which is the contract
  `public.handle_new_user()` reads. The profile is created in the same auth
  transaction.
* The trigger does not copy `phone`, so the service role patches it afterwards.
  If the profile is missing or does not match the requested role/tenant/email,
  the new auth user is deleted so the request can be retried.
* Duplicate emails return `409`; unknown tenants `404`; deactivated tenants `409`.

`PATCH /api/v1/admin/users/{user_id}/status` flips `profiles.is_active` and sets
`ban_duration` to `876000h` (deactivate) or `none` (activate). Deactivating your
own account, or the last active `system_admin`, is refused with `409`.

## Verification

`tests/test_admin_smoke.py` runs 13 assertions against the ASGI app with
`httpx.MockTransport` standing in for Supabase — no network or real credentials
needed:

```powershell
cd backend
.\.venv\Scripts\python.exe tests\test_admin_smoke.py
```

It covers `401`/`403`, validation (`422`), metadata sent to GoTrue, invite vs
password mode, duplicate email, profile-rollback on a failed patch, ban/unban,
and the self/last-admin guards.
