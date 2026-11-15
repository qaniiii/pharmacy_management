"""Contracts for the system-admin provisioning endpoints.

The account is created through the Supabase Admin API with metadata that
`public.handle_new_user()` understands:

    { "role": "welfare_admin",  "welfare_home_id": "<uuid>", "full_name": "..." }
    { "role": "pharmacy_admin", "pharmacy_id": "<uuid>",     "full_name": "..." }

Everything is validated here before a single request reaches Supabase, so an
operator cannot create an account whose metadata the database trigger will
reject halfway through.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.domain import UserRole

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ProvisionableRole(str, Enum):
    """Roles a system administrator may provision.

    `system_admin` is deliberately absent: the first platform administrator is
    granted by SQL, never by a provisioning request.
    """

    WELFARE_ADMIN = "welfare_admin"
    PHARMACY_ADMIN = "pharmacy_admin"


class ProvisionMode(str, Enum):
    """How the new account receives its credentials."""

    PASSWORD = "password"
    INVITE = "invite"


class ProvisionUserRequest(BaseModel):
    """Body of `POST /api/v1/admin/users`."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    full_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    role: ProvisionableRole

    # Exactly one tenancy key must be supplied, matching `role`.
    welfare_home_id: UUID | None = None
    pharmacy_id: UUID | None = None

    # Omit `password` to send a Supabase invitation email instead. The minimum
    # matches Supabase Auth's own baseline; the maximum is bcrypt's 72-byte cap.
    password: str | None = Field(default=None, min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(cleaned):
            raise ValueError("email must be a valid email address")
        return cleaned

    @field_validator("full_name")
    @classmethod
    def _normalise_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("full_name must not be blank")
        return cleaned

    @field_validator("phone")
    @classmethod
    def _normalise_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def _tenancy_matches_role(self) -> Self:
        if self.role is ProvisionableRole.WELFARE_ADMIN:
            if self.welfare_home_id is None:
                raise ValueError(
                    "welfare_home_id is required when role is welfare_admin"
                )
            if self.pharmacy_id is not None:
                raise ValueError(
                    "pharmacy_id must not be set when role is welfare_admin"
                )
        else:
            if self.pharmacy_id is None:
                raise ValueError("pharmacy_id is required when role is pharmacy_admin")
            if self.welfare_home_id is not None:
                raise ValueError(
                    "welfare_home_id must not be set when role is pharmacy_admin"
                )
        return self

    @property
    def mode(self) -> ProvisionMode:
        return (
            ProvisionMode.PASSWORD
            if self.password is not None
            else ProvisionMode.INVITE
        )

    @property
    def tenant_table(self) -> str:
        return (
            "welfare_homes"
            if self.role is ProvisionableRole.WELFARE_ADMIN
            else "pharmacies"
        )

    @property
    def tenant_id(self) -> UUID:
        # The validator above guarantees exactly one of these is populated.
        if self.welfare_home_id is not None:
            return self.welfare_home_id
        assert self.pharmacy_id is not None
        return self.pharmacy_id


class UserStatusUpdate(BaseModel):
    """Body of `PATCH /api/v1/admin/users/{user_id}/status`."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool


class ProvisionedUser(BaseModel):
    """Response body after the profile has been created and verified."""

    model_config = ConfigDict(extra="ignore")

    id: UUID
    email: str
    full_name: str
    phone: str | None = None
    role: UserRole
    welfare_home_id: UUID | None = None
    pharmacy_id: UUID | None = None
    is_active: bool
    mode: Literal["password", "invite"]


__all__ = [
    "ProvisionableRole",
    "ProvisionedUser",
    "ProvisionMode",
    "ProvisionUserRequest",
    "UserStatusUpdate",
]
