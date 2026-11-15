"""FastAPI application entry point.

Run locally:
    cd backend
    .venv\\Scripts\\uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import admin, health, me
from app.core.config import Settings, get_settings
from app.services.supabase_admin import SupabaseAdminError

DESCRIPTION = """
Backend for the pharmacy / welfare-home medication platform.

Authentication is delegated to Supabase Auth. Every protected endpoint resolves
the caller's role and tenant from `public.profiles` and queries the database as
that user, so Row Level Security remains the authority on data access.
""".strip()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory, also used by tests with an overridden Settings."""
    resolved = settings or get_settings()

    app = FastAPI(
        title=resolved.app_name,
        version="0.3.0",
        description=DESCRIPTION,
    )

    @app.exception_handler(SupabaseAdminError)
    async def _supabase_admin_error(
        _request: Request, exc: SupabaseAdminError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "apikey"],
    )

    app.include_router(health.router)
    app.include_router(me.router, prefix=resolved.api_prefix)
    app.include_router(admin.router, prefix=resolved.api_prefix)

    return app


app = create_app()
