"""System-admin tenant provisioning.

Every route is protected by `require_role("system_admin")`. The service-role
key is used only here, behind the API, so it never reaches the browser.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import get_admin_client
from app.core.security import CurrentUser, require_role
from app.models.admin import ProvisionedUser, ProvisionUserRequest, UserStatusUpdate
from app.models.domain import Profile, UserRole
from app.services.supabase_admin import SupabaseAdminService

router = APIRouter(prefix="/admin", tags=["administration"])


@router.post(
    "/users",
    response_model=ProvisionedUser,
    status_code=status.HTTP_201_CREATED,
    summary="Provision a tenant administrator",
    description=(
        "Creates the Supabase Auth account with the `raw_user_meta_data` that "
        "`handle_new_user()` requires, so `public.profiles` is populated in the "
        "same transaction. Omit `password` to send an invitation email instead. "
        "If the profile cannot be verified, the new auth user is deleted so the "
        "request can be retried."
    ),
    responses={
        400: {"description": "Supabase rejected the account details"},
        404: {"description": "Welfare home or pharmacy not found"},
        409: {"description": "Email already registered or tenant deactivated"},
        502: {"description": "Supabase or the profile trigger failed"},
        503: {"description": "Service-role key not configured"},
    },
)
async def provision_admin_user(
    payload: ProvisionUserRequest,
    _actor: CurrentUser = Depends(require_role(UserRole.SYSTEM_ADMIN)),
    service: SupabaseAdminService = Depends(get_admin_client),
) -> ProvisionedUser:
    return await service.provision_admin(payload)


@router.patch(
    "/users/{user_id}/status",
    response_model=Profile,
    summary="Activate or deactivate an administrator",
    description=(
        "Updates `profiles.is_active` and bans/unbans the matching Supabase "
        "Auth user. Deactivating yourself or the last active system "
        "administrator is refused."
    ),
    responses={
        404: {"description": "Profile not found"},
        409: {"description": "Self-deactivation or last system administrator"},
        502: {"description": "Supabase rejected the update"},
        503: {"description": "Service-role key not configured"},
    },
)
async def update_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    actor: CurrentUser = Depends(require_role(UserRole.SYSTEM_ADMIN)),
    service: SupabaseAdminService = Depends(get_admin_client),
) -> Profile:
    return await service.set_user_active(str(user_id), payload.is_active, actor)


__all__ = ["router"]
