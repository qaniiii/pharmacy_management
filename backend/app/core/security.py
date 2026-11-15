"""Supabase Auth verification.

Two things must not be confused:

* the JWT proves *who* the caller is;
* `public.profiles` decides *what* they may do and which tenant they belong to.

Supabase puts `role: "authenticated"` in the token, and `user_metadata` is
writable by the user, so neither is used for authorisation. The profile is
fetched from PostgREST with the caller's own access token, which means the
`profiles_select_own` RLS policy applies and no service-role bypass is needed.

Modern Supabase projects sign tokens with ES256 and publish the public keys at
`/auth/v1/.well-known/jwks.json`; legacy projects still use an HS256 shared
secret. Both paths are supported.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Coroutine

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWK
from pydantic import BaseModel, ConfigDict

from app.core.config import Settings, get_settings
from app.models.domain import UserRole

ALLOWED_ALGORITHMS = frozenset({"ES256", "RS256", "HS256"})
PROFILE_COLUMNS = "id,email,full_name,role,welfare_home_id,pharmacy_id,is_active"
JWKS_TTL_SECONDS = 600.0

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="Supabase access token (`Authorization: Bearer <jwt>`).",
)


class CurrentUser(BaseModel):
    """The authenticated caller, resolved from `public.profiles`."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    id: str
    email: str
    full_name: str
    role: UserRole
    welfare_home_id: str | None = None
    pharmacy_id: str | None = None
    is_active: bool


class TokenClaims(BaseModel):
    """The subset of the Supabase JWT this service relies on."""

    model_config = ConfigDict(extra="ignore")

    sub: str
    email: str | None = None
    aud: str | list[str] | None = None
    exp: int | None = None
    iss: str | None = None


def _unauthorised(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


class _JWKSCache:
    """Small in-process cache of Supabase signing keys.

    Keys are refetched after `JWKS_TTL_SECONDS` or when an unknown `kid` shows
    up, which covers key rotation without a network round-trip per request.
    """

    def __init__(self) -> None:
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float = 0.0

    async def get(self, kid: str, settings: Settings) -> Any:
        if kid in self._keys and (time.monotonic() - self._fetched_at) < JWKS_TTL_SECONDS:
            return self._keys[kid].key

        await self._refresh(settings)

        cached = self._keys.get(kid)
        if cached is None:
            raise _unauthorised("Unknown token signing key")
        return cached.key

    async def _refresh(self, settings: Settings) -> None:
        try:
            async with httpx.AsyncClient(
                timeout=settings.request_timeout_seconds
            ) as client:
                response = await client.get(settings.jwks_url)
                if response.status_code == status.HTTP_404_NOT_FOUND:
                    # Older projects publish the same document without the
                    # `/auth/v1` prefix.
                    response = await client.get(
                        f"{settings.supabase_url}/.well-known/jwks.json"
                    )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase signing keys are unavailable",
            ) from exc

        document = response.json()
        keys = document.get("keys") if isinstance(document, dict) else None
        if not isinstance(keys, list) or not keys:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase JWKS document contained no keys",
            )

        self._keys = {
            jwk["kid"]: PyJWK(jwk, algorithm=jwk.get("alg"))
            for jwk in keys
            if isinstance(jwk, dict) and "kid" in jwk
        }
        self._fetched_at = time.monotonic()


_jwks_cache = _JWKSCache()


async def verify_access_token(token: str, settings: Settings) -> TokenClaims:
    """Verifies signature, issuer, audience and expiry of a Supabase JWT."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise _unauthorised("Malformed access token") from exc

    algorithm = header.get("alg")
    if algorithm not in ALLOWED_ALGORITHMS:
        raise _unauthorised("Unsupported token algorithm")

    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise _unauthorised(
                "HS256 tokens are not accepted: SUPABASE_JWT_SECRET is not configured"
            )
        key: Any = settings.supabase_jwt_secret
    else:
        kid = header.get("kid")
        if not kid:
            raise _unauthorised("Access token has no key id")
        key = await _jwks_cache.get(kid, settings)

    try:
        payload = jwt.decode(
            token,
            key=key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=settings.auth_issuer,
            options={"require": ["sub", "exp", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorised("Access token has expired") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorised("Invalid access token") from exc

    return TokenClaims.model_validate(payload)


async def _fetch_profile(
    access_token: str,
    user_id: str,
    settings: Settings,
) -> CurrentUser | None:
    """Reads the caller's profile through PostgREST as the caller."""
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    params = {"select": PROFILE_COLUMNS, "id": f"eq.{user_id}", "limit": "1"}

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{settings.rest_url}/profiles",
                headers=headers,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach Supabase",
        ) from exc

    if response.status_code in (
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    ):
        raise _unauthorised("Supabase rejected the access token")

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Profile lookup failed with status {response.status_code}",
        )

    rows = response.json()
    if not isinstance(rows, list) or not rows:
        return None

    return CurrentUser.model_validate(rows[0])


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """FastAPI dependency: validates the token and loads role + tenancy.

    Raises 401 for a missing/invalid token and 403 for an authenticated account
    that has no active profile — an account that exists in Supabase Auth but
    was never provisioned into the application.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorised("Missing bearer token")

    claims = await verify_access_token(credentials.credentials, settings)
    profile = await _fetch_profile(credentials.credentials, claims.sub, settings)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No application profile is provisioned for this account",
        )

    if not profile.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated",
        )

    return profile


def require_role(
    *allowed: UserRole,
) -> Callable[..., Coroutine[Any, Any, CurrentUser]]:
    """Dependency factory for endpoints limited to specific roles.

    Usage:
        @router.get("/orders", dependencies=[Depends(require_role(UserRole.PHARMACY_ADMIN))])
    """

    async def dependency(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if user.role not in allowed:
            permitted = ", ".join(role.value for role in allowed)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This endpoint requires one of: {permitted}",
            )
        return user

    return dependency
