"""Identity endpoint proving the auth dependency end to end."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user

router = APIRouter(tags=["identity"])


@router.get(
    "/me",
    response_model=CurrentUser,
    summary="Current administrator",
    description=(
        "Validates the Supabase access token, then returns the role and tenant "
        "binding read from `public.profiles`."
    ),
)
async def read_current_user(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    return user
