"""Schemas for the approval-queue endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ApprovalStatusType = Literal["pending", "approved", "denied", "timeout"]


class CreateApprovalRequest(BaseModel):
    agent_id: str
    tool_name: str
    tool_args: dict[str, Any] | None = None
    message: str
    timeout: int = Field(default=300, ge=1, le=86400)
    timeout_effect: Literal["deny", "allow"] = "deny"


class ApprovalResponse(BaseModel):
    id: str
    status: str
    agent_id: str
    tool_name: str
    tool_args: dict[str, Any] | None = None
    message: str
    env: str
    timeout_seconds: int
    timeout_effect: str
    decided_by: str | None = None
    decided_at: datetime | None = None
    decision_reason: str | None = None
    created_at: datetime


class SubmitDecisionRequest(BaseModel):
    approved: bool
    decided_by: str | None = None
    reason: str | None = None
