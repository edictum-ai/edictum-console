"""Event-ingestion endpoint — ``POST /api/v1/events``."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import (
    AuthContext,
    get_current_tenant,
    require_api_key,
)
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.events import (
    EventBatchRequest,
    EventIngestResponse,
    EventResponse,
)
from edictum_server.services.event_service import ingest_events, query_events

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.post(
    "",
    response_model=EventIngestResponse,
    status_code=200,
    summary="Ingest a batch of audit events",
)
async def post_events(
    body: EventBatchRequest,
    auth: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> EventIngestResponse:
    """Accept a batch of audit events from an agent.

    Duplicate events (same ``tenant_id`` + ``call_id``) are silently ignored.
    """
    accepted, duplicates = await ingest_events(db, auth.tenant_id, body.events, env=auth.env)
    await db.commit()

    # Notify dashboard subscribers about new events.  Push one summary
    # message per batch rather than one per event to avoid flooding.
    if accepted > 0:
        push.push_to_dashboard(auth.tenant_id, {
            "type": "event_created",
            "accepted": accepted,
        })

    return EventIngestResponse(accepted=accepted, duplicates=duplicates)


@router.get(
    "",
    response_model=list[EventResponse],
    summary="Query audit events",
)
async def get_events(
    agent_id: str | None = None,
    tool_name: str | None = None,
    verdict: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[EventResponse]:
    """Query audit events with optional filters."""
    # API key auth is scoped to an environment — only return events for that env
    env_filter = auth.env if auth.auth_type == "api_key" else None
    events = await query_events(
        db,
        auth.tenant_id,
        agent_id=agent_id,
        tool_name=tool_name,
        verdict=verdict,
        env=env_filter,
        since=since,
        until=until,
        limit=limit,
    )
    return [
        EventResponse(
            id=str(e.id),
            call_id=e.call_id,
            agent_id=e.agent_id,
            tool_name=e.tool_name,
            verdict=e.verdict,
            mode=e.mode,
            timestamp=e.timestamp,
            payload=e.payload,
            created_at=e.created_at,
        )
        for e in events
    ]
