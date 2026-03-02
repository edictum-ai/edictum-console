"""Schemas for the /api/v1/keys endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from edictum_server.security.validators import ValidationError as SecurityError
from edictum_server.security.validators import sanitize_text

EnvName = Literal["production", "staging", "development"]


class CreateKeyRequest(BaseModel):
    """Request body for creating a new API key."""

    env: EnvName
    label: str | None = Field(default=None, max_length=255)

    @field_validator("label")
    @classmethod
    def _validate_label(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            return sanitize_text(v, max_length=255)
        except SecurityError as exc:
            raise ValueError(str(exc)) from exc


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
