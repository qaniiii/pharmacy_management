"""Supabase Admin API client for tenant provisioning.

This is the only module that uses `SUPABASE_SERVICE_ROLE_KEY`. It must never be
imported by code that runs in the browser or by ordinary user-facing request
handlers: the service role bypasses Row Level Security by design.

Two Supabase surfaces are involved:

* GoTrue admin API — `POST /auth/v1/admin/users`, `POST /auth/v1/invite`,
  `PUT /auth/v1/admin/users/{id}`, `DELETE /auth/v1/admin/users/{id}`.
* PostgREST — `PATCH /rest/v1/profiles` to attach the phone number that
  `handle_new_user()` does not copy, and to flip `profiles.is_active`.

The account creation and the profile insert happen in one database transaction:
`handle_new_user()` runs inside the auth insert, so a missing tenant or an
invalid role rejects the whole call. The phone patch is a second step; if it
fails, the just-created auth user is deleted so a retry is possible.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.core.security import CurrentUser
from app.models.admin import (
    ProvisionedUser,
    ProvisionMode,
    ProvisionUserRequest,
)
from app.models.domain import Profile, UserRole

logger = logging.getLogger(__name__)

# ~100 years. Supabase has no explicit "banned" flag; a long duration is the
# documented way to disable sign-in while keeping the account.
BAN_DURATION = "876000h"
UNBAN_DURATION = "none"

TENANT_TABLES = {
    "welfare_homes": "welfare home",
    "pharmacies": "pharmacy",
}


class SupabaseAdminError(Exception):
    """A failure that maps directly onto an HTTP response."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or f"HTTP {response.status_code}").strip()[:300]

    if isinstance(payload, dict):
        for key in ("msg", "message", "error_description", "error", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:300]
    return f"HTTP {response.status_code}"


class SupabaseAdminService:
    """Thin, testable wrapper around the privileged Supabase endpoints."""

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport

    # -- plumbing ---------------------------------------------------------
    @property
    def _headers(self) -> dict[str, str]:
        key = self._settings.supabase_service_role_key
        if not key:
            raise SupabaseAdminError(
                503,
                "SUPABASE_SERVICE_ROLE_KEY is not configured; "
                "tenant provisioning is unavailable.",
            )
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=self._settings.request_timeout_seconds,
            transport=self._transport,
        )

    def _auth_url(self, path: str) -> str:
        return f"{self._settings.supabase_url}/auth/v1{path}"

    def _rest_url(self, table: str) -> str:
        return f"{self._settings.rest_url}/{table}"

    async def _send(
        self,
        method: str,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        headers = self._headers
        if prefer:
            headers = {**headers, "Prefer": prefer}

        try:
            async with self._client() as client:
                return await client.request(
                    method,
                    url,
                    headers=headers,
                    json=json,
                    params=params,
                )
        except httpx.HTTPError as exc:
            raise SupabaseAdminError(
                502, "Could not reach Supabase. Try again shortly."
            ) from exc

    @staticmethod
    def _require_success(response: httpx.Response, action: str) -> None:
        if 200 <= response.status_code < 300:
            return

        detail = _error_detail(response)
        lowered = detail.lower()

        if response.status_code == 409 or (
            response.status_code == 422
            and any(word in lowered for word in ("already", "exists", "registered"))
        ):
            raise SupabaseAdminError(
                409, "An account with this email address already exists."
            )

        if response.status_code in (401, 403):
            raise SupabaseAdminError(
                503,
                "Supabase rejected the service-role key. "
                "Check SUPABASE_SERVICE_ROLE_KEY.",
            )

        if response.status_code == 404:
            raise SupabaseAdminError(404, f"{action}: {detail}")

        if response.status_code == 422:
            raise SupabaseAdminError(400, f"{action}: {detail}")

        raise SupabaseAdminError(502, f"{action} failed: {detail}")

    @staticmethod
    def _json(response: httpx.Response) -> Any:
        try:
            return response.json()
        except ValueError as exc:
            raise SupabaseAdminError(
                502, "Supabase returned a response that was not JSON."
            ) from exc

    # -- reads ------------------------------------------------------------
    async def _select(
        self,
        table: str,
        params: dict[str, str],
    ) -> list[dict[str, Any]]:
        response = await self._send("GET", self._rest_url(table), params=params)
        self._require_success(response, f"Reading {table}")
        document = self._json(response)
        if not isinstance(document, list):
            raise SupabaseAdminError(502, f"Unexpected {table} response from Supabase.")
        return [row for row in document if isinstance(row, dict)]

    async def _get_profile(self, user_id: str) -> dict[str, Any] | None:
        rows = await self._select(
            "profiles",
            {"id": f"eq.{user_id}", "select": "*", "limit": "1"},
        )
        return rows[0] if rows else None

    async def _assert_tenant(self, table: str, tenant_id: str) -> None:
        label = TENANT_TABLES[table]
        rows = await self._select(
            table,
            {"id": f"eq.{tenant_id}", "select": "id,is_active", "limit": "1"},
        )
        if not rows:
            raise SupabaseAdminError(404, f"No {label} exists with that id.")
        if not rows[0].get("is_active", False):
            raise SupabaseAdminError(
                409,
                f"That {label} is deactivated. Reactivate it before provisioning "
                "an administrator.",
            )

    # -- writes -----------------------------------------------------------
    async def _create_auth_user(
        self,
        payload: ProvisionUserRequest,
        metadata: dict[str, str],
    ) -> dict[str, Any]:
        if payload.mode is ProvisionMode.PASSWORD:
            response = await self._send(
                "POST",
                self._auth_url("/admin/users"),
                json={
                    "email": payload.email,
                    "password": payload.password,
                    "email_confirm": True,
                    "user_metadata": metadata,
                },
            )
            self._require_success(response, "Account creation")
        else:
            response = await self._send(
                "POST",
                self._auth_url("/invite"),
                json={
                    "email": payload.email,
                    "data": metadata,
                    "redirect_to": f"{self._settings.frontend_base_url}/invite",
                },
            )
            self._require_success(response, "Invitation")

        document = self._json(response)
        # GoTrue returns the user at the root for admin creation and inside
        # `user` on some versions; accept both.
        user = document.get("user") if isinstance(document, dict) else None
        if not isinstance(user, dict):
            user = document if isinstance(document, dict) else None

        user_id = user.get("id") if user else None
        if not isinstance(user_id, str) or not user_id:
            raise SupabaseAdminError(
                502, "Supabase did not return the new user's id."
            )
        return user

    async def _sync_profile(
        self,
        user_id: str,
        phone: str | None,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{user_id}", "select": "*"}

        if phone:
            response = await self._send(
                "PATCH",
                self._rest_url("profiles"),
                params=params,
                json={"phone": phone},
                prefer="return=representation",
            )
            action = "Profile phone update"
        else:
            response = await self._send("GET", self._rest_url("profiles"), params=params)
            action = "Profile lookup"

        self._require_success(response, action)
        rows = self._json(response)
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
            raise SupabaseAdminError(
                502,
                "The profile row was not created from the account metadata. "
                "Check that handle_new_user() is installed and the tenant exists.",
            )
        return rows[0]

    async def _delete_auth_user_quietly(self, user_id: str) -> None:
        """Rollback helper: best effort, never masks the original failure."""
        try:
            response = await self._send(
                "DELETE",
                self._auth_url(f"/admin/users/{user_id}"),
                params={"should_soft_delete": "false"},
            )
            self._require_success(response, "Account rollback")
        except SupabaseAdminError:
            logger.exception("Could not roll back auth user %s", user_id)

    async def _set_auth_ban(self, user_id: str, *, banned: bool) -> None:
        response = await self._send(
            "PUT",
            self._auth_url(f"/admin/users/{user_id}"),
            json={"ban_duration": BAN_DURATION if banned else UNBAN_DURATION},
        )
        self._require_success(response, "Account status update")

    # -- public operations ------------------------------------------------
    async def provision_admin(self, payload: ProvisionUserRequest) -> ProvisionedUser:
        """Creates the auth account, lets the trigger build the profile, then
        attaches the phone number and verifies the result."""
        tenant_id = str(payload.tenant_id)
        await self._assert_tenant(payload.tenant_table, tenant_id)

        metadata: dict[str, str] = {
            "role": payload.role.value,
            "full_name": payload.full_name,
        }
        if payload.role.value == UserRole.WELFARE_ADMIN.value:
            metadata["welfare_home_id"] = tenant_id
        else:
            metadata["pharmacy_id"] = tenant_id

        user = await self._create_auth_user(payload, metadata)
        user_id = str(user["id"])

        try:
            profile = await self._sync_profile(user_id, payload.phone)
            self._assert_profile_matches(profile, payload)
            return ProvisionedUser.model_validate(
                {**profile, "mode": payload.mode.value}
            )
        except Exception:
            await self._delete_auth_user_quietly(user_id)
            raise

    @staticmethod
    def _assert_profile_matches(
        profile: dict[str, Any],
        payload: ProvisionUserRequest,
    ) -> None:
        expected_tenant = str(payload.tenant_id)
        actual_tenant = (
            str(profile.get("welfare_home_id") or "")
            if payload.role.value == UserRole.WELFARE_ADMIN.value
            else str(profile.get("pharmacy_id") or "")
        )

        if (
            str(profile.get("role")) != payload.role.value
            or actual_tenant != expected_tenant
            or str(profile.get("email", "")).lower() != payload.email
        ):
            raise SupabaseAdminError(
                502,
                "The profile created by handle_new_user() does not match the "
                "requested role, tenant or email. The account was rolled back.",
            )

    async def set_user_active(
        self,
        user_id: str,
        is_active: bool,
        actor: CurrentUser,
    ) -> Profile:
        """Flips `profiles.is_active` and bans/unbans the matching auth user.

        Self-deactivation and removing the last active system administrator are
        refused: both would lock the platform's own administration out.
        """
        target = await self._get_profile(user_id)
        if target is None:
            raise SupabaseAdminError(404, "No profile exists with that id.")

        if not is_active:
            if user_id == actor.id:
                raise SupabaseAdminError(
                    409, "You cannot deactivate your own account."
                )

            if str(target.get("role")) == UserRole.SYSTEM_ADMIN.value:
                admins = await self._select(
                    "profiles",
                    {
                        "role": "eq.system_admin",
                        "is_active": "eq.true",
                        "select": "id",
                    },
                )
                if len(admins) <= 1:
                    raise SupabaseAdminError(
                        409,
                        "The platform must keep at least one active system "
                        "administrator.",
                    )

        previous_active = bool(target.get("is_active", True))

        # Auth first: if it fails, the profile still describes the real state.
        await self._set_auth_ban(user_id, banned=not is_active)

        try:
            response = await self._send(
                "PATCH",
                self._rest_url("profiles"),
                params={"id": f"eq.{user_id}", "select": "*"},
                json={"is_active": is_active},
                prefer="return=representation",
            )
            self._require_success(response, "Profile activation update")
            rows = self._json(response)
            if not isinstance(rows, list) or not rows:
                raise SupabaseAdminError(
                    502, "Supabase did not return the updated profile."
                )
        except Exception:
            # Keep Auth and profiles consistent before surfacing the failure.
            try:
                await self._set_auth_ban(user_id, banned=not previous_active)
            except SupabaseAdminError:
                logger.exception(
                    "Could not restore auth ban state for user %s", user_id
                )
            raise

        return Profile.model_validate(rows[0])


__all__ = ["SupabaseAdminError", "SupabaseAdminService"]
