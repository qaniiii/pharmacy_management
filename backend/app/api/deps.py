"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.services.supabase_admin import SupabaseAdminService


def get_admin_client(
    settings: Settings = Depends(get_settings),
) -> SupabaseAdminService:
    """Service-role client for provisioning.

    Fails closed when the key is absent rather than silently falling back to a
    caller-scoped client: account creation is impossible without it.
    """
    if not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "SUPABASE_SERVICE_ROLE_KEY is not configured, so tenant "
                "provisioning is unavailable."
            ),
        )
    return SupabaseAdminService(settings)


__all__ = ["get_admin_client"]
