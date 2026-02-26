"""Service for cross-agent session state backed by Redis."""

from __future__ import annotations

import uuid

import redis.asyncio as aioredis


def _key(tenant_id: uuid.UUID, key: str) -> str:
    """Build the namespaced Redis key."""
    return f"edictum:{tenant_id}:session:{key}"


async def get_session_value(
    r: aioredis.Redis,
    tenant_id: uuid.UUID,
    key: str,
) -> str | None:
    """Read a single session value. Returns ``None`` if the key does not exist."""
    value = await r.get(_key(tenant_id, key))
    return str(value) if value is not None else None


async def set_session_value(
    r: aioredis.Redis,
    tenant_id: uuid.UUID,
    key: str,
    value: str,
) -> None:
    """Set a session key to the given string value."""
    await r.set(_key(tenant_id, key), value)


async def increment_session_value(
    r: aioredis.Redis,
    tenant_id: uuid.UUID,
    key: str,
    amount: float = 1,
) -> float:
    """Atomically increment a numeric session key. Returns the new value."""
    return float(await r.incrbyfloat(_key(tenant_id, key), amount))


async def delete_session_value(
    r: aioredis.Redis,
    tenant_id: uuid.UUID,
    key: str,
) -> bool:
    """Delete a session key. Returns ``True`` if the key existed."""
    removed = await r.delete(_key(tenant_id, key))
    return int(removed) > 0
