"""Typed mirrors of the PostgreSQL enums and tables.

These models describe rows as they come back from PostgREST. They are the
contract for every endpoint, so a column rename in a migration must break the
type checker rather than fail silently at runtime.

Source of truth:
    supabase/migrations/20261115000100_core_schema.sql
    supabase/migrations/20261115000300_order_audit.sql
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserRole(str, Enum):
    """`public.user_role`."""

    SYSTEM_ADMIN = "system_admin"
    WELFARE_ADMIN = "welfare_admin"
    PHARMACY_ADMIN = "pharmacy_admin"


class OrderStatus(str, Enum):
    """`public.order_status` — the locked state machine."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    PREPARED = "prepared"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RowModel(BaseModel):
    """Base for database rows: ignores unknown columns added by migrations."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")


class Profile(RowModel):
    """`public.profiles` — identity plus tenant binding."""

    id: UUID
    email: str
    full_name: str
    phone: str | None = None
    role: UserRole
    welfare_home_id: UUID | None = None
    pharmacy_id: UUID | None = None
    is_active: bool = True
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class WelfareHome(RowModel):
    """`public.welfare_homes` — the customer tenant."""

    id: UUID
    name: str
    registration_number: str
    address_line1: str
    address_line2: str | None = None
    city: str
    region: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Pharmacy(RowModel):
    """`public.pharmacies` — the supplier tenant."""

    id: UUID
    name: str
    license_number: str
    contact_person: str | None = None
    address_line1: str
    address_line2: str | None = None
    city: str
    region: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Resident(RowModel):
    """`public.residents` — PHI, never readable by a pharmacy admin."""

    id: UUID
    welfare_home_id: UUID
    full_name: str
    date_of_birth: date | None = None
    gender: str | None = None
    room_number: str | None = None
    medical_record_number: str | None = None
    allergies: list[str] = Field(default_factory=list)
    care_notes: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class InventoryItem(RowModel):
    """`public.inventory_items` — pooled stock (resident_id NULL) or
    resident-specific prescription stock (resident_id set)."""

    id: UUID
    welfare_home_id: UUID
    resident_id: UUID | None = None
    medication_name: str
    generic_name: str | None = None
    strength: str | None = None
    dosage_form: str | None = None
    unit: str = "unit"
    quantity_on_hand: Decimal = Decimal("0")
    reorder_level: Decimal = Decimal("0")
    batch_number: str | None = None
    expiry_date: date | None = None
    storage_location: str | None = None
    notes: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class Order(RowModel):
    """`public.orders` — deliberately carries no resident key."""

    id: UUID
    order_number: str
    welfare_home_id: UUID
    pharmacy_id: UUID
    resident_reference: str | None = None
    status: OrderStatus
    requested_by: UUID | None = None
    decided_by: UUID | None = None
    notes: str | None = None
    rejection_reason: str | None = None
    total_amount: Decimal = Decimal("0")
    submitted_at: datetime
    accepted_at: datetime | None = None
    prepared_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    status_changed_at: datetime
    created_at: datetime
    updated_at: datetime


class OrderItem(RowModel):
    """`public.order_items` — snapshot lines; no resident or stock key."""

    id: UUID
    order_id: UUID
    welfare_home_id: UUID
    medication_name: str
    strength: str | None = None
    dosage_form: str | None = None
    unit: str = "unit"
    quantity: Decimal
    unit_price: Decimal = Decimal("0")
    line_total: Decimal
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class OrderResident(RowModel):
    """`public.order_residents` — tenant-private resident link."""

    order_id: UUID
    welfare_home_id: UUID
    resident_id: UUID
    created_at: datetime


class OrderItemInventory(RowModel):
    """`public.order_item_inventory` — tenant-private stock traceability."""

    order_item_id: UUID
    welfare_home_id: UUID
    inventory_item_id: UUID
    created_at: datetime


class OrderAuditLog(RowModel):
    """`public.order_audit_logs` — append-only, written by trigger only."""

    id: int
    order_id: UUID
    from_status: OrderStatus | None = None
    to_status: OrderStatus
    changed_by: UUID | None = None
    changed_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "InventoryItem",
    "Order",
    "OrderAuditLog",
    "OrderItem",
    "OrderItemInventory",
    "OrderResident",
    "OrderStatus",
    "Pharmacy",
    "Profile",
    "Resident",
    "UserRole",
    "WelfareHome",
]
