"""Schemas for the event-ingestion endpoint."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class EventPayload(BaseModel):
    """A single audit event emitted by an agent."""

    call_id: str = Field(..., description="Globally unique call identifier for dedup")
    agent_id: str = Field(..., description="Identifier of the reporting agent")
    tool_name: str = Field(..., description="Tool that was called")
    verdict: str = Field(..., description="Contract verdict (allow, deny, etc.)")
    mode: str = Field(..., description="Evaluation mode (enforce, observe, etc.)")
    timestamp: datetime = Field(..., description="When the event occurred (agent clock)")
    payload: dict[str, object] | None = Field(
        default=None, description="Optional extra data attached to the event"
    )


class EventBatchRequest(BaseModel):
    """Batch of events sent by an agent in a single HTTP call."""

    events: list[EventPayload] = Field(
        ..., min_length=1, description="One or more audit events"
    )


class EventResponse(BaseModel):
    """A single audit event returned by the query endpoint."""

    id: str
    call_id: str
    agent_id: str
    tool_name: str
    verdict: str
    mode: str
    timestamp: datetime
    payload: dict[str, object] | None = None
    created_at: datetime


class EventIngestResponse(BaseModel):
    """Response after ingesting a batch of events."""

    accepted: int = Field(..., description="Number of newly stored events")
    duplicates: int = Field(
        ..., description="Number of events skipped (already ingested)"
    )
