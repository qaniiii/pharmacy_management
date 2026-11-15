# Backend — FastAPI

Phase 2 scaffold: typed settings, Supabase token verification, CORS and a
health probe. No domain endpoints yet.

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

## Configuration

`app/core/config.py` reads the repository-root `.env.local` (and falls back to
`.env`), so the frontend and API share one secret store. Required keys:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, with optional
`SUPABASE_URL` / `SUPABASE_ANON_KEY` aliases; `BACKEND_CORS_ORIGINS` defaults to
`http://localhost:3000`.

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

`require_role(*roles)` is the dependency factory for future role-scoped
endpoints.
