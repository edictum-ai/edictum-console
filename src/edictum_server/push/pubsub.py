"""Redis pub/sub bridge for multi-instance SSE fanout (placeholder).

When running multiple server instances behind a load balancer, SSE
connections land on different processes.  This module will bridge the
in-process PushManager to a Redis pub/sub channel so that a deploy
on one instance reaches agents connected to all instances.

Phase 1 runs a single instance — this is a no-op stub.
"""

from __future__ import annotations

from typing import Any


class RedisPubSubBridge:
    """Placeholder for Redis-backed cross-instance event fanout."""

    async def start(self) -> None:
        """Subscribe to the Redis channel and forward to PushManager."""

    async def stop(self) -> None:
        """Unsubscribe and clean up."""

    async def publish(self, env: str, data: dict[str, Any]) -> None:
        """Publish an event to Redis for cross-instance fanout."""
