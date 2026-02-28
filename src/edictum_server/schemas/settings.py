"""Pydantic schemas for settings endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RotateKeyResponse(BaseModel):
    """Response after rotating the signing key."""

    public_key: str
    rotated_at: datetime
    deployments_re_signed: int


class PurgeEventsResponse(BaseModel):
    """Response after purging old events."""

    deleted_count: int
    cutoff: datetime
