"""In-process push manager for SSE broadcasting to connected agents."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Request

logger = logging.getLogger(__name__)

# Event types forwarded to dashboard SSE subscribers.
_DASHBOARD_EVENT_TYPES = frozenset({
    "approval_created",
    "approval_decided",
    "approval_timeout",
    "assignment_changed",
    "bundle_uploaded",
    "composition_changed",
    "contract_created",
    "contract_update",
    "contract_updated",
})

# Cleanup interval and max connection age.
CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes
MAX_CONNECTION_AGE = timedelta(hours=1)


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
    # External code may set is_closed=True to signal a dead connection without
    # going through unsubscribe() (e.g. from an error handler).  The cleanup
    # task checks this flag in addition to the age-based cutoff.
    is_closed: bool = field(default=False)


@dataclass(eq=False)
class DashboardConnection:
    """Metadata for a connected dashboard SSE subscription."""

    queue: asyncio.Queue[dict[str, Any]]
    tenant_id: uuid.UUID
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
        self._dashboard_connections: dict[uuid.UUID, set[DashboardConnection]] = (
            defaultdict(set)
        )
        self._cleanup_task: asyncio.Task[None] | None = None

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

    def subscribe_dashboard(self, tenant_id: uuid.UUID) -> DashboardConnection:
        """Register a dashboard SSE connection for a tenant (all envs).

        Returns a DashboardConnection whose .queue the caller should read from.
        """
        conn = DashboardConnection(
            queue=asyncio.Queue(),
            tenant_id=tenant_id,
        )
        self._dashboard_connections[tenant_id].add(conn)
        return conn

    def unsubscribe_dashboard(
        self, tenant_id: uuid.UUID, conn: DashboardConnection
    ) -> None:
        """Remove a dashboard connection when the SSE stream closes."""
        self._dashboard_connections[tenant_id].discard(conn)
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
        for conn in self._dashboard_connections.get(tenant_id, set()):
            conn.queue.put_nowait(data)

    def push_to_agent(
        self, agent_id: str, data: dict[str, Any], *, tenant_id: uuid.UUID
    ) -> None:
        """Push an event to all connections for a specific agent (across all envs)."""
        for conns in self._connections.values():
            for conn in conns:
                if conn.tenant_id == tenant_id and conn.agent_id == agent_id:
                    conn.queue.put_nowait(data)

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

    # ------------------------------------------------------------------
    # Background cleanup for dead / stale connections
    # ------------------------------------------------------------------

    def cleanup_stale_connections(self) -> int:
        """Remove agent and dashboard connections that are closed or too old.

        Agent connections are removed if ``is_closed`` is True (set externally
        to signal an abnormal disconnect) or if they are older than
        ``MAX_CONNECTION_AGE``.  Dashboard connections are removed by age only
        (they have no ``is_closed`` flag).

        Returns the total number of connections removed.
        """
        now = datetime.now(UTC)
        removed = 0

        # --- agent connections ---
        empty_envs: list[str] = []
        for env, conns in self._connections.items():
            stale = {
                conn for conn in conns
                if conn.is_closed or (now - conn.connected_at) > MAX_CONNECTION_AGE
            }
            removed += len(stale)
            conns -= stale
            if not conns:
                empty_envs.append(env)
        for env in empty_envs:
            del self._connections[env]

        # --- dashboard connections ---
        empty_tenants: list[uuid.UUID] = []
        for tenant_id, conns in self._dashboard_connections.items():
            stale = {
                conn for conn in conns
                if (now - conn.connected_at) > MAX_CONNECTION_AGE
            }
            removed += len(stale)
            conns -= stale
            if not conns:
                empty_tenants.append(tenant_id)
        for tenant_id in empty_tenants:
            del self._dashboard_connections[tenant_id]

        if removed:
            logger.info("Cleaned up %d stale SSE connections", removed)
        return removed

    def start_cleanup_task(self) -> None:
        """Start the periodic background cleanup task."""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    def stop_cleanup_task(self) -> None:
        """Cancel the background cleanup task."""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            self._cleanup_task.cancel()

    async def _cleanup_loop(self) -> None:
        """Periodically clean up dead connections."""
        try:
            while True:
                await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
                self.cleanup_stale_connections()
        except asyncio.CancelledError:
            return


def get_push_manager(request: Request) -> PushManager:
    """FastAPI dependency — returns the PushManager stored on app state."""
    return request.app.state.push_manager  # type: ignore[no-any-return]
