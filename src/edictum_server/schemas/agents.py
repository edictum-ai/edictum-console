"""Request and response schemas for agent fleet status."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AgentStatusEntry(BaseModel):
    """A single agent's connection status."""

    agent_id: str
    env: str
    bundle_name: str | None
    policy_version: str | None
    status: str  # "current", "drift", "unknown"
    connected_at: datetime


class AgentFleetStatusResponse(BaseModel):
    """Response for the agent fleet status endpoint."""

    agents: list[AgentStatusEntry]
