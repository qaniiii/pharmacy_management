"""Liveness endpoint. Kept dependency-free so it works during an outage."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    environment: str
    supabase_configured: bool


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description=(
        "Returns process health only. It does not call Supabase, so a failing "
        "database or auth project does not take the probe down."
    ),
)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        environment=settings.environment,
        supabase_configured=settings.supabase_configured,
    )
