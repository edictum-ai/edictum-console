"""Schemas for the /api/v1/keys endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from edictum_server.security.validators import sanitize_html


class CreateKeyRequest(BaseModel):
    """Request body for creating a new API key."""

    env: str = Field(..., max_length=50, description="Environment name (dev, staging, prod)")
    label: str | None = Field(None, max_length=255, description="Human-readable label for the key")
    
    @field_validator('env')
    @classmethod
    def validate_env(cls, v: str) -> str:
        """Validate environment name."""
        if not v:
            raise ValueError('Environment is required')
        return sanitize_html(v, max_length=50)
    
    @field_validator('label')
    @classmethod
    def validate_label(cls, v: str | None) -> str | None:
        """Sanitize label to prevent XSS. Security: Finding H1, H2."""
        if v is None:
            return v
        return sanitize_html(v, max_length=255)


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
