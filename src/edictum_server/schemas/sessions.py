"""Schemas for the session-state endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SessionValueResponse(BaseModel):
    """Response when reading a session key."""

    value: str | None


class SetValueRequest(BaseModel):
    """Request body for setting a session key."""

    value: str = Field(..., description="The string value to store")


class IncrementRequest(BaseModel):
    """Request body for incrementing a numeric session key."""

    amount: float = Field(default=1, description="Amount to increment by")


class IncrementResponse(BaseModel):
    """Response after incrementing a session key."""

    value: float
