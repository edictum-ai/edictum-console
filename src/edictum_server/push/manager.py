"""In-process push manager for SSE broadcasting to connected agents."""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fastapi import Request

# Event types forwarded to dashboard SSE subscribers.
_DASHBOARD_EVENT_TYPES = frozenset({
    "approval_created",
    "approval_decided",
    "approval_timeout",
    "bundle_uploaded",
    "contract_update",
})


@dataclass(eq=False)
class AgentConnection:
    """Metadata for a connected agent's SSE subscription."""

    queue: asyncio.Queue[dict[str, Any]]
    env: str
    tenant_id: uuid.UUID
    bundle_name: str | None
    policy_version: str | None
    agent_id: str
    connected_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class PushManager:
    """Manages per-environment SSE connections using asyncio Queues.

    Each connected agent subscribes to a queue for its environment.
    When a bundle is deployed, `push_to_env` fans out the event
    to every queue in that environment, filtered by tenant and bundle.

    Dashboard connections subscribe per-tenant (all environments).
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[AgentConnection]] = defaultdict(set)
        self._dashboard_connections: dict[uuid.UUID, set[asyncio.Queue[dict[str, Any]]]] = (
            defaultdict(set)
        )

    def subscribe(
        self,
        env: str,
        *,
        tenant_id: uuid.UUID,
        agent_id: str = "unknown",
        bundle_name: str | None = None,
        policy_version: str | None = None,
    ) -> AgentConnection:
        """Register a new SSE connection for an environment.

        Returns an AgentConnection the caller should read from via `.queue`.
        """
        conn = AgentConnection(
            queue=asyncio.Queue(),
            env=env,
            tenant_id=tenant_id,
            bundle_name=bundle_name,
            policy_version=policy_version,
            agent_id=agent_id,
        )
        self._connections[env].add(conn)
        return conn

    def unsubscribe(self, env: str, conn: AgentConnection) -> None:
        """Remove an agent connection when the SSE stream closes."""
        self._connections[env].discard(conn)
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

    def push_to_env(
        self, env: str, data: dict[str, Any], *, tenant_id: uuid.UUID
    ) -> None:
        """Fan out an event to connected agents in an environment.

        Filters by tenant_id (required). For ``contract_update`` events,
        also filters by bundle_name — connections that specified a bundle_name
        only receive updates for that bundle.
        """
        event_type = data.get("type", "")
        event_bundle = data.get("bundle_name")

        for conn in self._connections.get(env, set()):
            if conn.tenant_id != tenant_id:
                continue
            # For contract_update, respect bundle_name filter
            if (
                event_type == "contract_update"
                and conn.bundle_name is not None
                and event_bundle is not None
                and conn.bundle_name != event_bundle
            ):
                continue
            conn.queue.put_nowait(data)

    def push_to_dashboard(self, tenant_id: uuid.UUID, data: dict[str, Any]) -> None:
        """Fan out an event to all dashboard connections for a tenant."""
        event_type = data.get("type", "")
        if event_type not in _DASHBOARD_EVENT_TYPES:
            return
        for queue in self._dashboard_connections.get(tenant_id, set()):
            queue.put_nowait(data)

    def get_agent_connections(
        self,
        tenant_id: uuid.UUID,
        bundle_name: str | None = None,
    ) -> list[AgentConnection]:
        """Return all agent connections for a tenant, optionally filtered by bundle."""
        result: list[AgentConnection] = []
        for conns in self._connections.values():
            for conn in conns:
                if conn.tenant_id != tenant_id:
                    continue
                if bundle_name is not None and conn.bundle_name != bundle_name:
                    continue
                result.append(conn)
        return result

    @property
    def connection_count(self) -> int:
        """Total number of active SSE connections across all environments."""
        return sum(len(qs) for qs in self._connections.values())


def get_push_manager(request: Request) -> PushManager:
    """FastAPI dependency — returns the PushManager stored on app state."""
    return request.app.state.push_manager  # type: ignore[no-any-return]
