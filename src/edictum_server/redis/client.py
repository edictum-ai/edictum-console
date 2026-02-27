"""Redis client factory and FastAPI dependency for Upstash / local Redis."""

from __future__ import annotations

import redis.asyncio as aioredis
from fastapi import Request


def create_redis_client(url: str) -> aioredis.Redis:
    """Create an async Redis client from a URL.

    Supports both ``redis://`` (local) and ``rediss://`` (Upstash TLS) URLs.
    """
    return aioredis.from_url(
        url,
        decode_responses=True,
    )


async def get_redis(request: Request) -> aioredis.Redis:
    """FastAPI dependency — returns the Redis client stored on app state."""
    return request.app.state.redis  # type: ignore[no-any-return]
