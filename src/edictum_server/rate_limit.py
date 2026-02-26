"""Sliding-window rate limiter backed by Redis sorted sets."""

from __future__ import annotations

import time

import redis.asyncio as aioredis

from edictum_server.config import get_settings


class RateLimitExceeded(Exception):
    """Raised when a client exceeds the allowed request rate.

    Attributes:
        retry_after: Seconds the client should wait before retrying.
    """

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s.")


async def check_rate_limit(
    redis: aioredis.Redis,
    key: str,
    *,
    max_attempts: int | None = None,
    window_seconds: int | None = None,
) -> None:
    """Enforce a sliding-window rate limit using a Redis sorted set.

    Each call adds the current timestamp as both score and member. Entries
    older than ``window_seconds`` are pruned. If the remaining count meets
    or exceeds ``max_attempts``, :class:`RateLimitExceeded` is raised
    *before* recording the new attempt so that the counter does not inflate
    from rejected requests.

    Args:
        redis: Async Redis client.
        key: Redis key for the sorted set (e.g. ``rate_limit:login:1.2.3.4``).
        max_attempts: Maximum allowed attempts in the window. Falls back to
            ``settings.rate_limit_max_attempts``.
        window_seconds: Window size in seconds. Falls back to
            ``settings.rate_limit_window_seconds``.

    Raises:
        RateLimitExceeded: If the caller has exceeded the rate limit.
    """
    settings = get_settings()
    max_attempts = max_attempts if max_attempts is not None else settings.rate_limit_max_attempts
    window_seconds = (
        window_seconds if window_seconds is not None else settings.rate_limit_window_seconds
    )

    now = time.time()
    window_start = now - window_seconds

    pipe = redis.pipeline()
    # Remove entries outside the sliding window
    pipe.zremrangebyscore(key, "-inf", window_start)
    # Count remaining entries
    pipe.zcard(key)
    results = await pipe.execute()

    current_count: int = results[1]

    if current_count >= max_attempts:
        # Find the oldest entry to calculate retry_after
        oldest = await redis.zrange(key, 0, 0, withscores=True)
        if oldest:
            oldest_ts: float = oldest[0][1]
            retry_after = int(oldest_ts + window_seconds - now) + 1
        else:
            retry_after = window_seconds
        raise RateLimitExceeded(retry_after=max(retry_after, 1))

    # Record this attempt (use now as both score and a unique member)
    await redis.zadd(key, {f"{now}": now})
    await redis.expire(key, window_seconds + 60)
