"""Schemas for the /api/v1/keys endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CreateKeyRequest(BaseModel):
    """Request body for creating a new API key."""

    env: str
    label: str | None = None


class CreateKeyResponse(BaseModel):
    """Response after creating an API key. The full key is shown only once."""

    id: str
    key: str
    prefix: str
    env: str
    label: str | None
    created_at: datetime


class ApiKeyInfo(BaseModel):
    """Public-facing API key metadata (no secret material)."""

    id: str
    prefix: str
    env: str
    label: str | None
    created_at: datetime
