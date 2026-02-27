"""SSE streaming endpoints for real-time push to agents and dashboards."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, Query
from sse_starlette.sse import EventSourceResponse

from edictum_server.auth.dependencies import (
    AuthContext,
    require_api_key,
    require_dashboard_auth,
)
from edictum_server.push.manager import PushManager, get_push_manager

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
                "data": json.dumps(data),
            }
    except asyncio.CancelledError:
        return


@router.get("")
async def stream(
    env: str = Query(..., description="Environment to subscribe to"),
    _auth: AuthContext = Depends(require_api_key),
    push: PushManager = Depends(get_push_manager),
) -> EventSourceResponse:
    """SSE endpoint for agents to receive real-time bundle updates.

    Agents connect with their API key and specify the target environment.
    The server pushes bundle_deployed events whenever a new bundle is
    deployed to that environment.
    """
    queue = push.subscribe(env)

    async def event_stream() -> AsyncGenerator[dict[str, str], None]:
        try:
            async for event in _event_generator(queue):
                yield event
        finally:
            push.unsubscribe(env, queue)

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
    queue = push.subscribe_dashboard(auth.tenant_id)

    async def event_stream() -> AsyncGenerator[dict[str, str], None]:
        try:
            async for event in _event_generator(queue):
                yield event
        finally:
            push.unsubscribe_dashboard(auth.tenant_id, queue)

    return EventSourceResponse(event_stream())
