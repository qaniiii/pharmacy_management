"""Application settings.

The monorepo keeps one `.env.local` at the repository root so local development
has a single place to rotate secrets. Deployments (Render, CI) do not ship an
env file at all: every value is read from real OS environment variables, and
missing env files are simply ignored.

Precedence (highest wins):
    1. real environment variables (Render, CI, shell)
    2. repository-root `.env.local`
    3. repository-root `.env`
    4. `backend/.env.local`
    5. `backend/.env`

`SUPABASE_SERVICE_ROLE_KEY` is optional and only used by the system-admin
provisioning endpoints, which must create `auth.users` rows and bypass RLS.
Request handling for every other endpoint authenticates as the caller and
relies on Row Level Security, so the key is never used for user-facing queries.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

ENV_FILES: tuple[Path, ...] = (
    REPO_ROOT / ".env.local",
    REPO_ROOT / ".env",
    BACKEND_DIR / ".env.local",
    BACKEND_DIR / ".env",
)


class Settings(BaseSettings):
    """Runtime configuration, validated once at import time."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "Pharmacy & Welfare API"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    # Supabase project -------------------------------------------------------
    supabase_url: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_URL",
        ),
    )
    supabase_anon_key: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_ANON_KEY",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ),
    )
    supabase_service_role_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY"),
    )

    # Auth -------------------------------------------------------------------
    # Modern Supabase projects sign access tokens with an asymmetric key
    # published at /auth/v1/.well-known/jwks.json. A legacy project that still
    # signs with HS256 can provide the shared secret instead.
    supabase_jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_JWT_SECRET"),
    )
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_issuer_suffix: str = "/auth/v1"

    # HTTP -------------------------------------------------------------------
    # Accepts either a JSON array (`["https://a.example","https://b.example"]`)
    # or a comma-separated list (`https://a.example,https://b.example`). Both
    # forms are normalised to one comma-separated string, so the field stays a
    # simple `str` for env parsing while `cors_origins` returns the list.
    cors_allow_origins: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices(
            "CORS_ORIGINS",
            "BACKEND_CORS_ORIGINS",
            "CORS_ALLOW_ORIGINS",
        ),
    )
    request_timeout_seconds: float = 10.0

    # Invitations sent by the Admin API link back to the Next.js app, which
    # hosts the password-reset form at /login.
    frontend_base_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("FRONTEND_BASE_URL"),
    )

    @field_validator("supabase_url")
    @classmethod
    def _normalise_supabase_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned:
            raise ValueError(
                "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL must not be empty"
            )
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("SUPABASE_URL must start with http:// or https://")
        return cleaned

    @field_validator("supabase_anon_key")
    @classmethod
    def _require_anon_key(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY must not be empty"
            )
        return cleaned

    @field_validator("frontend_base_url")
    @classmethod
    def _normalise_frontend_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned:
            return "http://localhost:3000"
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("FRONTEND_BASE_URL must start with http:// or https://")
        return cleaned

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def _normalise_cors_origins(cls, value: object) -> str:
        """Accept a JSON array or a comma-separated list of origins."""
        if value is None:
            return ""

        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return ""
            if raw.startswith("["):
                try:
                    decoded = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        "CORS_ORIGINS looks like a JSON array but could not be "
                        f"parsed: {exc.msg}"
                    ) from exc
                if not isinstance(decoded, list):
                    raise ValueError(
                        "CORS_ORIGINS must be a JSON array of URLs or a "
                        "comma-separated string"
                    )
                entries = [str(entry) for entry in decoded]
            else:
                entries = raw.split(",")
        elif isinstance(value, (list, tuple, set, frozenset)):
            entries = [str(entry) for entry in value]
        else:
            raise ValueError(
                "CORS_ORIGINS must be a JSON array of URLs or a comma-separated "
                "string"
            )

        cleaned: list[str] = []
        for entry in entries:
            origin = entry.strip()
            if not origin:
                continue
            # Browsers send Origin without a trailing slash, so a configured
            # "https://app.example.com/" would otherwise never match.
            if "://" in origin:
                origin = origin.rstrip("/")
            cleaned.append(origin)

        return ",".join(cleaned)

    @property
    def cors_origins(self) -> list[str]:
        """Origins as a deduplicated list, keeping the configured order."""
        ordered: dict[str, None] = {}
        for origin in self.cors_allow_origins.split(","):
            origin = origin.strip()
            if origin:
                ordered.setdefault(origin, None)
        return list(ordered)

    @property
    def auth_issuer(self) -> str:
        return f"{self.supabase_url}{self.supabase_jwt_issuer_suffix}"

    @property
    def jwks_url(self) -> str:
        return f"{self.auth_issuer}/.well-known/jwks.json"

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url}/rest/v1"

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_anon_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """FastAPI dependency; cached so the env files are parsed once."""
    return Settings()
