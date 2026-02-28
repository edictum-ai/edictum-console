"""Schemas for the /api/v1/notifications/channels endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CreateChannelRequest(BaseModel):
    """Request body for creating a notification channel."""

    name: str = Field(min_length=1, max_length=100)
    channel_type: Literal["telegram", "slack", "webhook"]
    config: dict


class UpdateChannelRequest(BaseModel):
    """Request body for updating a notification channel."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    config: dict | None = None
    enabled: bool | None = None


class ChannelResponse(BaseModel):
    """Public-facing notification channel info."""

    id: uuid.UUID
    name: str
    channel_type: str
    config: dict
    enabled: bool
    created_at: datetime
    last_test_at: datetime | None
    last_test_ok: bool | None


class TestResult(BaseModel):
    """Result of a channel test."""

    success: bool
    message: str
