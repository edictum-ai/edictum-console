"""Pydantic v2 schemas for agent coverage analysis."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class TimeWindow(BaseModel):
    """Time range for coverage analysis."""

    since: datetime
    until: datetime


class DeployedBundleInfo(BaseModel):
    """Summary of the deployed bundle for an agent's environment."""

    name: str
    version: int
    revision_hash: str


class ToolCoverage(BaseModel):
    """Coverage status for a single tool."""

    tool_name: str
    status: str  # "enforced", "observed", "ungoverned"
    contract_name: str | None = None
    contract_type: str | None = None  # "pre", "post", "session"
    mode: str | None = None  # "enforce", "observe"
    bundle_name: str | None = None
    event_count: int
    last_used: datetime
    # Optional verdict breakdown (only when include_verdicts=True)
    deny_count: int | None = None
    allow_count: int | None = None
    observe_count: int | None = None


class CoverageSummary(BaseModel):
    """Aggregate coverage counts for one agent."""

    total_tools: int
    enforced: int
    observed: int
    ungoverned: int
    coverage_pct: int  # enforced / total * 100


class AgentCoverage(BaseModel):
    """Full coverage analysis for a single agent."""

    agent_id: str
    environment: str
    time_window: TimeWindow
    deployed_bundle: DeployedBundleInfo | None = None
    tools: list[ToolCoverage]
    summary: CoverageSummary


class AgentCoverageSummary(BaseModel):
    """Lightweight per-agent coverage for fleet view."""

    agent_id: str
    environment: str
    total_tools: int
    enforced: int
    observed: int
    ungoverned: int
    coverage_pct: int
    drift_status: str = "unknown"  # "current", "drift", "unknown"


class UngovernedToolSummary(BaseModel):
    """An ungoverned tool with the agents that use it."""

    tool_name: str
    agent_count: int
    agent_ids: list[str]


class FleetSummary(BaseModel):
    """Fleet-level aggregate metrics."""

    total_agents: int
    fully_enforced: int
    with_ungoverned: int
    with_drift: int
    total_ungoverned_tools: int
    ungoverned_tools: list[UngovernedToolSummary]


class FleetCoverage(BaseModel):
    """Fleet coverage response."""

    time_window: TimeWindow
    agents: list[AgentCoverageSummary]
    fleet_summary: FleetSummary


# ---------------------------------------------------------------------------
# History schemas
# ---------------------------------------------------------------------------


class HistoryEvent(BaseModel):
    """A single entry in an agent's history timeline."""

    type: Literal["deployment", "drift_resolved", "drift_detected", "first_seen"]
    timestamp: datetime

    # deployment fields (present when type == "deployment")
    bundle_name: str | None = None
    bundle_version: int | None = None
    deployed_by: str | None = None
    revision_hash: str | None = None

    # drift_resolved fields (present when type == "drift_resolved")
    policy_version: str | None = None
    drift_duration_seconds: int | None = None

    # drift_detected fields (present when type == "drift_detected")
    expected_version: str | None = None
    actual_version: str | None = None

    # first_seen fields (present when type == "first_seen")
    environment: str | None = None


class AgentHistoryResponse(BaseModel):
    """Response for the agent history endpoint."""

    agent_id: str
    environment: str | None
    events: list[HistoryEvent]
