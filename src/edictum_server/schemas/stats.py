"""Schemas for the stats endpoints."""

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


class ContractCoverage(BaseModel):
    """Per-contract aggregated stats."""

    decision_name: str = Field(..., description="Name of the contract")
    total_evaluations: int = Field(..., description="Total evaluation events")
    total_denials: int = Field(..., description="Events with verdict=denied")
    total_warnings: int = Field(..., description="Events with verdict=call_would_deny")
    last_triggered: str | None = Field(None, description="ISO timestamp of last event")


class ContractStatsResponse(BaseModel):
    """Contract-level statistics for a time window."""

    coverage: list[ContractCoverage] = Field(default_factory=list)
    total_events: int = Field(..., description="Total events in the time window")
    period_start: str = Field(..., description="ISO timestamp of window start")
    period_end: str = Field(..., description="ISO timestamp of window end")
