"""FastAPI application entry point.

Run locally:
    cd backend
    .venv\\Scripts\\uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, me
from app.core.config import Settings, get_settings

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
        version="0.2.0",
        description=DESCRIPTION,
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

    return app


app = create_app()
