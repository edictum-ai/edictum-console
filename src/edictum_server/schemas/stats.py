"""Schemas for the stats overview endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StatsOverviewResponse(BaseModel):
    """Dashboard overview statistics."""

    pending_approvals: int = Field(..., description="Number of pending approval requests")
    active_agents: int = Field(..., description="Distinct agents seen in the last hour")
    total_agents: int = Field(..., description="Distinct agents seen all-time")
    events_24h: int = Field(..., description="Total events in the last 24 hours")
    denials_24h: int = Field(..., description="Events with verdict=denied in the last 24 hours")
    observe_findings_24h: int = Field(
        0, description="Events in observe mode with verdict=call_would_deny in 24h"
    )
    contracts_triggered_24h: int = Field(
        0, description="Distinct contracts triggered in the last 24 hours"
    )
