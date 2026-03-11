"""Sliding-window rate limiter backed by Redis sorted sets.

Falls back to an in-memory limiter when Redis is unreachable (#7).
Uses a Lua script for atomic check-and-record (#24 M14).
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from threading import Lock

import redis.asyncio as aioredis

from edictum_server.config import get_settings

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when a client exceeds the allowed request rate.

    Attributes:
        retry_after: Seconds the client should wait before retrying.
    """

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s.")


# ---------------------------------------------------------------------------
# Lua script for atomic sliding-window rate limiting (M14)
#
# KEYS[1] = sorted set key
# ARGV[1] = window_start (oldest timestamp to keep)
# ARGV[2] = now (current timestamp, used as score and member)
# ARGV[3] = max_attempts
# ARGV[4] = ttl (window + buffer)
#
# Returns: [current_count, oldest_score_or_0]
# If current_count >= max_attempts, the new attempt is NOT recorded.
# ---------------------------------------------------------------------------
_RATE_LIMIT_LUA = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    if #oldest > 0 then
        return {count, oldest[2]}
    end
    return {count, 0}
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
return {count, 0}
"""


# ---------------------------------------------------------------------------
# In-memory fallback rate limiter (#7)
# ---------------------------------------------------------------------------
class _InMemoryRateLimiter:
    """Simple in-memory sliding-window rate limiter for Redis-down fallback.

    Less precise than Redis (per-process, not distributed) but ensures
    rate limiting never fails open.
    """

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(
        self, key: str, *, max_attempts: int, window_seconds: int
    ) -> None:
        """Check rate limit in-memory. Raises RateLimitExceeded if over."""
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            entries = self._windows[key]
            # Prune old entries
            entries[:] = [ts for ts in entries if ts > window_start]

            if len(entries) >= max_attempts:
                oldest = entries[0] if entries else now
                retry_after = int(oldest + window_seconds - now) + 1
                raise RateLimitExceeded(retry_after=max(retry_after, 1))

            entries.append(now)

    def cleanup(self) -> None:
        """Remove empty windows to prevent unbounded memory growth."""
        now = time.time()
        with self._lock:
            empty_keys = [
                k for k, v in self._windows.items()
                if not v or v[-1] < now - 600  # stale for 10+ minutes
            ]
            for k in empty_keys:
                del self._windows[k]


# Module-level singleton for in-memory fallback
_fallback = _InMemoryRateLimiter()


async def _check_rate_limit_pipeline(
    redis: aioredis.Redis,
    key: str,
    *,
    now: float,
    window_start: float,
    max_attempts: int,
    window_seconds: int,
    ttl: int,
) -> None:
    """Non-atomic pipeline fallback for Redis instances without Lua support."""
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, "-inf", window_start)
    pipe.zcard(key)
    results = await pipe.execute()

    current_count: int = results[1]

    if current_count >= max_attempts:
        oldest = await redis.zrange(key, 0, 0, withscores=True)
        if oldest:
            oldest_ts: float = oldest[0][1]
            retry_after = int(oldest_ts + window_seconds - now) + 1
        else:
            retry_after = window_seconds
        raise RateLimitExceeded(retry_after=max(retry_after, 1))

    await redis.zadd(key, {f"{now}": now})
    await redis.expire(key, ttl)


async def check_rate_limit(
    redis: aioredis.Redis,
    key: str,
    *,
    max_attempts: int | None = None,
    window_seconds: int | None = None,
) -> None:
    """Enforce a sliding-window rate limit using a Redis sorted set.

    Uses an atomic Lua script so that ZREMRANGEBYSCORE + ZCARD + ZADD
    execute as a single Redis operation, preventing race conditions
    between concurrent requests.

    Falls back to an in-memory rate limiter when Redis is unreachable,
    ensuring rate limiting never fails open.

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
    ttl = window_seconds + 60

    try:
        result = await redis.eval(
            _RATE_LIMIT_LUA,
            1,
            key,
            str(window_start),
            str(now),
            str(max_attempts),
            str(ttl),
        )

        current_count = int(result[0])
        if current_count >= max_attempts:
            oldest_score = float(result[1]) if result[1] else 0
            if oldest_score > 0:
                retry_after = int(oldest_score + window_seconds - now) + 1
            else:
                retry_after = window_seconds
            raise RateLimitExceeded(retry_after=max(retry_after, 1))

    except RateLimitExceeded:
        raise
    except (ConnectionError, OSError, TimeoutError):
        # Redis is truly unreachable — fall back to in-memory limiter (#7).
        logger.warning(
            "Redis unreachable for rate limiting key=%s — using in-memory fallback",
            key,
        )
        _fallback.check(key, max_attempts=max_attempts, window_seconds=window_seconds)
    except Exception:
        # Lua EVAL not supported (e.g. fakeredis in tests) — fall back to
        # pipeline-based approach (non-atomic but still Redis-backed).
        try:
            await _check_rate_limit_pipeline(
                redis, key,
                now=now, window_start=window_start,
                max_attempts=max_attempts, window_seconds=window_seconds,
                ttl=ttl,
            )
        except RateLimitExceeded:
            raise
        except (ConnectionError, OSError, TimeoutError):
            logger.warning(
                "Redis unreachable for rate limiting key=%s — using in-memory fallback",
                key,
            )
            _fallback.check(key, max_attempts=max_attempts, window_seconds=window_seconds)
