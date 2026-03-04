"""Schemas for agent registration and assignment rule endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# --- Agent Registration ---

class AgentRegistrationResponse(BaseModel):
    id: uuid.UUID
    agent_id: str
    display_name: str | None
    tags: dict
    bundle_name: str | None
    resolved_bundle: str | None = None
    last_seen_at: datetime | None
    created_at: datetime


class AgentRegistrationUpdate(BaseModel):
    display_name: str | None = None
    tags: dict | None = None
    bundle_name: str | None = None


class BulkAssignRequest(BaseModel):
    agent_ids: list[str] = Field(..., min_length=1, max_length=100)
    bundle_name: str


class BulkAssignResponse(BaseModel):
    updated: int


# --- Assignment Rules ---

class AssignmentRuleCreate(BaseModel):
    priority: int = Field(..., ge=0)
    pattern: str = Field(..., min_length=1, max_length=200)
    tag_match: dict | None = None
    bundle_name: str = Field(..., min_length=1)
    env: str = Field(..., min_length=1)


class AssignmentRuleUpdate(BaseModel):
    priority: int | None = Field(default=None, ge=0)
    pattern: str | None = Field(default=None, min_length=1, max_length=200)
    tag_match: dict | None = None
    bundle_name: str | None = Field(default=None, min_length=1)
    env: str | None = Field(default=None, min_length=1)


class AssignmentRuleResponse(BaseModel):
    id: uuid.UUID
    priority: int
    pattern: str
    tag_match: dict | None
    bundle_name: str
    env: str
    created_at: datetime


class ResolvedAssignment(BaseModel):
    """Result of bundle resolution for an agent."""
    bundle_name: str | None
    source: str  # "explicit" | "rule" | "agent_provided" | "none"
    rule_id: uuid.UUID | None = None
    rule_pattern: str | None = None
