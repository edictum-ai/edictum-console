"""Agent fleet status endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.agents import AgentFleetStatusResponse, AgentStatusEntry
from edictum_server.services.drift_service import check_drift

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
