"""In-process push manager for SSE broadcasting to connected agents."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import Request


class PushManager:
    """Manages per-environment SSE connections using asyncio Queues.

    Each connected agent subscribes to a queue for its environment.
    When a bundle is deployed, `push_to_env` fans out the event
    to every queue in that environment.
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)

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

    def push_to_env(self, env: str, data: dict[str, Any]) -> None:
        """Fan out an event to all connected agents in an environment."""
        for queue in self._connections.get(env, set()):
            queue.put_nowait(data)

    @property
    def connection_count(self) -> int:
        """Total number of active SSE connections across all environments."""
        return sum(len(qs) for qs in self._connections.values())


def get_push_manager(request: Request) -> PushManager:
    """FastAPI dependency — returns the PushManager stored on app state."""
    return request.app.state.push_manager  # type: ignore[no-any-return]
