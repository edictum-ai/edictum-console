"""SSE streaming endpoints for real-time push to agents and dashboards."""

from __future__ import annotations

import asyncio
import json as _json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from edictum_server.auth.dependencies import (
    AuthContext,
    require_api_key,
    require_dashboard_auth,
)
from edictum_server.db.engine import get_db
from edictum_server.push.manager import DashboardConnection, PushManager, get_push_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stream", tags=["stream"])


async def _event_generator(
    queue: asyncio.Queue[dict[str, Any]],
) -> AsyncGenerator[dict[str, str], None]:
    """Yield SSE-formatted events from the queue until cancelled."""
    try:
        while True:
            data = await queue.get()
            yield {
                "event": data.get("type", "message"),
                "data": _json.dumps(data),
            }
    except asyncio.CancelledError:
        return


@router.get("")
async def stream(
    env: str = Query(..., description="Environment to subscribe to"),
    bundle_name: str | None = Query(default=None, description="Filter by bundle name"),
    policy_version: str | None = Query(default=None, description="Agent's current policy version"),
    tags: str | None = Query(default=None, description="JSON-encoded agent tags"),
    auth: AuthContext = Depends(require_api_key),
    push: PushManager = Depends(get_push_manager),
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    """SSE endpoint for agents to receive real-time bundle updates.

    Auto-registers the agent if not already known. Resolves bundle assignment
    if agent didn't provide an explicit bundle_name.
    """
    from edictum_server.services import agent_registration_service, assignment_service

    agent_id = auth.agent_id or "unknown"

    # Parse tags if provided
    parsed_tags: dict | None = None
    if tags:
        try:
            parsed_tags = _json.loads(tags)
        except (ValueError, TypeError):
            parsed_tags = None

    # Auto-register agent (upsert — creates or updates last_seen_at)
    await agent_registration_service.upsert_agent(db, auth.tenant_id, agent_id)

    # Resolve bundle assignment if agent didn't provide bundle_name
    effective_bundle = bundle_name
    if not effective_bundle:
        resolved, _source, _, _ = await assignment_service.resolve_bundle(
            db,
            auth.tenant_id,
            agent_id,
            agent_tags=parsed_tags,
            agent_provided_bundle=None,
        )
        effective_bundle = resolved

    conn = push.subscribe(
        env,
        tenant_id=auth.tenant_id,
        agent_id=agent_id,
        bundle_name=effective_bundle,
        policy_version=policy_version,
    )

    async def event_stream() -> AsyncGenerator[dict[str, str], None]:
        try:
            async for event in _event_generator(conn.queue):
                yield event
        finally:
            push.unsubscribe(env, conn)

    return EventSourceResponse(event_stream())


@router.get("/dashboard")
async def stream_dashboard(
    auth: AuthContext = Depends(require_dashboard_auth),
    push: PushManager = Depends(get_push_manager),
) -> EventSourceResponse:
    """SSE endpoint for the dashboard to receive real-time updates.

    Uses cookie auth. Subscribes to ALL environments for the tenant.
    Forwards approval_created, approval_decided, approval_timeout,
    and contract_update events.
    """
    conn: DashboardConnection = push.subscribe_dashboard(auth.tenant_id)

    async def event_stream() -> AsyncGenerator[dict[str, str], None]:
        try:
            async for event in _event_generator(conn.queue):
                yield event
        finally:
            push.unsubscribe_dashboard(auth.tenant_id, conn)

    return EventSourceResponse(event_stream())
