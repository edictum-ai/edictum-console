"""Agent registration management endpoints (dashboard auth)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.agent_registrations import (
    AgentRegistrationResponse,
    AgentRegistrationUpdate,
    BulkAssignRequest,
    BulkAssignResponse,
)
from edictum_server.services import agent_registration_service as svc
from edictum_server.services import assignment_service

router = APIRouter(prefix="/api/v1/agent-registrations", tags=["agent-registrations"])


def _to_response(
    agent: object,
    resolved_bundle: str | None = None,
) -> AgentRegistrationResponse:
    """Convert an AgentRegistration ORM object to a response schema."""
    from edictum_server.db.models import AgentRegistration

    assert isinstance(agent, AgentRegistration)
    return AgentRegistrationResponse(
        id=agent.id,
        agent_id=agent.agent_id,
        display_name=agent.display_name,
        tags=agent.tags,
        bundle_name=agent.bundle_name,
        resolved_bundle=resolved_bundle,
        last_seen_at=agent.last_seen_at,
        created_at=agent.created_at,
    )


@router.get("", response_model=list[AgentRegistrationResponse])
async def list_registrations(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[AgentRegistrationResponse]:
    """List all registered agents for the tenant."""
    agents = await svc.list_agents(db, auth.tenant_id)
    results = []
    for agent in agents:
        bundle_name, _source, _, _ = await assignment_service.resolve_bundle(
            db, auth.tenant_id, agent.agent_id
        )
        results.append(_to_response(agent, resolved_bundle=bundle_name))
    return results


@router.patch("/{agent_id}", response_model=AgentRegistrationResponse)
async def update_registration(
    agent_id: str,
    body: AgentRegistrationUpdate,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> AgentRegistrationResponse:
    """Update an agent's display name, tags, or explicit bundle assignment."""
    # Check if agent exists first to get old bundle_name for change detection
    old_agent = await svc.get_agent(db, auth.tenant_id, agent_id)
    if not old_agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    old_bundle = old_agent.bundle_name

    kwargs = {}
    if body.display_name is not None:
        kwargs["display_name"] = body.display_name
    if body.tags is not None:
        kwargs["tags"] = body.tags
    if body.bundle_name is not None:
        kwargs["bundle_name"] = body.bundle_name if body.bundle_name != "" else None

    agent = await svc.update_agent(db, auth.tenant_id, agent_id, **kwargs)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    bundle_name, source, _, _ = await assignment_service.resolve_bundle(
        db, auth.tenant_id, agent.agent_id
    )

    # Push assignment_changed event if bundle_name changed
    new_bundle = agent.bundle_name
    if new_bundle != old_bundle:
        push.push_to_agent(
            agent_id,
            {
                "type": "assignment_changed",
                "agent_id": agent_id,
                "bundle_name": new_bundle,
                "source": "explicit",
            },
            tenant_id=auth.tenant_id,
        )
        push.push_to_dashboard(
            auth.tenant_id,
            {
                "type": "assignment_changed",
                "agent_id": agent_id,
                "bundle_name": new_bundle,
                "source": "explicit",
            },
        )

    return _to_response(agent, resolved_bundle=bundle_name)


@router.post("/bulk-assign", response_model=BulkAssignResponse)
async def bulk_assign_bundle(
    body: BulkAssignRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> BulkAssignResponse:
    """Assign a bundle to multiple agents at once."""
    count = await svc.bulk_assign(db, auth.tenant_id, body.agent_ids, body.bundle_name)

    # Push assignment_changed to each affected agent
    for aid in body.agent_ids:
        push.push_to_agent(
            aid,
            {
                "type": "assignment_changed",
                "agent_id": aid,
                "bundle_name": body.bundle_name,
                "source": "explicit",
            },
            tenant_id=auth.tenant_id,
        )
    # Notify dashboard once
    push.push_to_dashboard(
        auth.tenant_id,
        {
            "type": "assignment_changed",
            "agent_id": "__bulk__",
            "bundle_name": body.bundle_name,
            "source": "explicit",
        },
    )

    return BulkAssignResponse(updated=count)
