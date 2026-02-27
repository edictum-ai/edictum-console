"""In-process push manager for SSE broadcasting to connected agents."""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from typing import Any

from fastapi import Request

# Event types forwarded to dashboard SSE subscribers.
_DASHBOARD_EVENT_TYPES = frozenset({
    "approval_created",
    "approval_decided",
    "approval_timeout",
    "contract_update",
})


class PushManager:
    """Manages per-environment SSE connections using asyncio Queues.

    Each connected agent subscribes to a queue for its environment.
    When a bundle is deployed, `push_to_env` fans out the event
    to every queue in that environment.

    Dashboard connections subscribe per-tenant (all environments).
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._dashboard_connections: dict[uuid.UUID, set[asyncio.Queue[dict[str, Any]]]] = (
            defaultdict(set)
        )

    def subscribe(self, env: str) -> asyncio.Queue[dict[str, Any]]:
        """Register a new SSE connection for an environment.

        Returns an asyncio Queue the caller should read from.
        """
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._connections[env].add(queue)
        return queue

    def unsubscribe(self, env: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """Remove a queue when the SSE connection closes."""
        self._connections[env].discard(queue)
        if not self._connections[env]:
            del self._connections[env]

    def subscribe_dashboard(self, tenant_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]:
        """Register a dashboard SSE connection for a tenant (all envs).

        Returns an asyncio Queue the caller should read from.
        """
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._dashboard_connections[tenant_id].add(queue)
        return queue

    def unsubscribe_dashboard(
        self, tenant_id: uuid.UUID, queue: asyncio.Queue[dict[str, Any]]
    ) -> None:
        """Remove a dashboard queue when the SSE connection closes."""
        self._dashboard_connections[tenant_id].discard(queue)
        if not self._dashboard_connections[tenant_id]:
            del self._dashboard_connections[tenant_id]

    def push_to_env(self, env: str, data: dict[str, Any]) -> None:
        """Fan out an event to all connected agents in an environment."""
        for queue in self._connections.get(env, set()):
            queue.put_nowait(data)

    def push_to_dashboard(self, tenant_id: uuid.UUID, data: dict[str, Any]) -> None:
        """Fan out an event to all dashboard connections for a tenant."""
        event_type = data.get("type", "")
        if event_type not in _DASHBOARD_EVENT_TYPES:
            return
        for queue in self._dashboard_connections.get(tenant_id, set()):
            queue.put_nowait(data)

    @property
    def connection_count(self) -> int:
        """Total number of active SSE connections across all environments."""
        return sum(len(qs) for qs in self._connections.values())


def get_push_manager(request: Request) -> PushManager:
    """FastAPI dependency — returns the PushManager stored on app state."""
    return request.app.state.push_manager  # type: ignore[no-any-return]
