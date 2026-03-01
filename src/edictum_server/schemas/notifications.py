"""Schemas for the /api/v1/notifications/channels endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from edictum_server.security.validators import sanitize_html


class RoutingFilters(BaseModel):
    """Optional routing filters for notification channels."""

    environments: list[str] | None = None
    agent_patterns: list[str] | None = None
    contract_names: list[str] | None = None


class CreateChannelRequest(BaseModel):
    """Request body for creating a notification channel."""

    name: str = Field(min_length=1, max_length=100)
    channel_type: Literal["telegram", "slack", "slack_app", "webhook", "email", "discord"]
    config: dict
    filters: RoutingFilters | None = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Sanitize name to prevent XSS. Security: Finding H1, H2."""
        return sanitize_html(v, max_length=100)


class UpdateChannelRequest(BaseModel):
    """Request body for updating a notification channel."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    config: dict | None = None
    enabled: bool | None = None
    filters: RoutingFilters | None = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        """Sanitize name to prevent XSS. Security: Finding H1, H2."""
        if v is None:
            return v
        return sanitize_html(v, max_length=100)


class ChannelResponse(BaseModel):
    """Public-facing notification channel info."""

    id: uuid.UUID
    name: str
    channel_type: str
    config: dict
    enabled: bool
    filters: dict | None
    created_at: datetime
    last_test_at: datetime | None
    last_test_ok: bool | None


class TestResult(BaseModel):
    """Result of a channel test."""

    success: bool
    message: str
