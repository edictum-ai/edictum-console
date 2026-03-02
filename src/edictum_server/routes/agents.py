"""Agent fleet status and coverage endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.agents import AgentFleetStatusResponse, AgentStatusEntry
from edictum_server.schemas.coverage import AgentCoverage, AgentHistoryResponse, FleetCoverage
from edictum_server.services.coverage_service import compute_coverage, parse_since
from edictum_server.services.drift_service import check_drift
from edictum_server.services.fleet_coverage_service import compute_fleet_coverage
from edictum_server.services.history_service import get_agent_history

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("/status", response_model=AgentFleetStatusResponse)
async def agent_fleet_status(
    bundle_name: str | None = Query(default=None, description="Filter by bundle name"),
    auth: AuthContext = Depends(require_dashboard_auth),
    push: PushManager = Depends(get_push_manager),
    db: AsyncSession = Depends(get_db),
) -> AgentFleetStatusResponse:
    """Return live status of all connected agents for the tenant."""
    connections = push.get_agent_connections(auth.tenant_id, bundle_name=bundle_name)

    entries: list[AgentStatusEntry] = []
    for conn in connections:
        status = "unknown"
        if conn.policy_version and conn.env:
            status = await check_drift(
                db, auth.tenant_id, conn.policy_version, conn.env
            )

        entries.append(
            AgentStatusEntry(
                agent_id=conn.agent_id,
                env=conn.env,
                bundle_name=conn.bundle_name,
                policy_version=conn.policy_version,
                status=status,
                connected_at=conn.connected_at,
            )
        )

    return AgentFleetStatusResponse(agents=entries)


# --- Coverage endpoints ---
# IMPORTANT: fleet-coverage MUST be declared BEFORE /{agent_id} routes
# to avoid FastAPI capturing "fleet-coverage" as an agent_id parameter.


@router.get("/fleet-coverage", response_model=FleetCoverage)
async def fleet_coverage(
    since: str | None = Query(
        default=None,
        description="Time window: '1h', '6h', '24h', '7d', '30d' or ISO timestamp",
    ),
    env: str | None = Query(default=None, description="Filter by environment"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> FleetCoverage:
    """Return fleet-level coverage summary for all agents in tenant."""
    try:
        since_dt = parse_since(since)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await compute_fleet_coverage(db, auth.tenant_id, since_dt, env=env)


@router.get("/{agent_id}/coverage", response_model=AgentCoverage)
async def agent_coverage(
    agent_id: str,
    request: Request,
    since: str | None = Query(
        default=None,
        description="Time window: '1h', '6h', '24h', '7d', '30d' or ISO timestamp",
    ),
    include_verdicts: bool = Query(
        default=False, description="Include verdict breakdown per tool"
    ),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> AgentCoverage:
    """Return coverage analysis for a single agent."""
    try:
        since_dt = parse_since(since)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    redis = getattr(request.app.state, "redis", None)
    result = await compute_coverage(
        db,
        auth.tenant_id,
        agent_id,
        since_dt,
        include_verdicts=include_verdicts,
        redis=redis,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"No events found for agent '{agent_id}'")
    return result


@router.get("/{agent_id}/history", response_model=AgentHistoryResponse)
async def agent_history(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=200, description="Max timeline entries"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> AgentHistoryResponse:
    """Return contract change timeline and drift history for an agent."""
    result = await get_agent_history(db, auth.tenant_id, agent_id, limit=limit)
    if result is None:
        raise HTTPException(status_code=404, detail="No events found for this agent")
    return result
