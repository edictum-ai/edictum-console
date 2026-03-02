"""Session-state endpoints — cross-agent key/value store backed by Redis.

SDK contract (from SDK_COMPAT.md):
  GET    /api/v1/sessions/{key}            → {"value": "string|null"}
  PUT    /api/v1/sessions/{key}            → any 2xx
  DELETE /api/v1/sessions/{key}            → any 2xx
  POST   /api/v1/sessions/{key}/increment  → {"value": float}
"""

from __future__ import annotations

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Path

from edictum_server.auth.dependencies import AuthContext, require_api_key

# Session keys must match this pattern to prevent Redis key injection
_KEY_PATTERN = r"^[a-zA-Z0-9_\-\.:/]+$"
from edictum_server.redis.client import get_redis
from edictum_server.schemas.sessions import (
    IncrementRequest,
    IncrementResponse,
    SessionValueResponse,
    SetValueRequest,
)
from edictum_server.services.session_service import (
    delete_session_value,
    get_session_value,
    increment_session_value,
    set_session_value,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.get(
    "/{key}",
    response_model=SessionValueResponse,
    summary="Get a session value",
)
async def get_value(
    key: str = Path(pattern=_KEY_PATTERN),
    auth: AuthContext = Depends(require_api_key),
    r: aioredis.Redis = Depends(get_redis),
) -> SessionValueResponse:
    """Read a single key from the session store."""
    value = await get_session_value(r, auth.tenant_id, key)
    if value is None:
        raise HTTPException(status_code=404, detail="Key not found")
    return SessionValueResponse(value=value)


@router.put(
    "/{key}",
    response_model=SessionValueResponse,
    summary="Set a session value",
)
async def put_value(
    body: SetValueRequest,
    key: str = Path(pattern=_KEY_PATTERN),
    auth: AuthContext = Depends(require_api_key),
    r: aioredis.Redis = Depends(get_redis),
) -> SessionValueResponse:
    """Write a string value to the session store."""
    await set_session_value(r, auth.tenant_id, key, body.value)
    return SessionValueResponse(value=body.value)


@router.post(
    "/{key}/increment",
    response_model=IncrementResponse,
    summary="Increment a numeric session value",
)
async def post_increment(
    body: IncrementRequest,
    key: str = Path(pattern=_KEY_PATTERN),
    auth: AuthContext = Depends(require_api_key),
    r: aioredis.Redis = Depends(get_redis),
) -> IncrementResponse:
    """Atomically increment a numeric session key."""
    new_value = await increment_session_value(r, auth.tenant_id, key, body.amount)
    return IncrementResponse(value=new_value)


@router.delete(
    "/{key}",
    response_model=SessionValueResponse,
    summary="Delete a session value",
)
async def delete_value(
    key: str = Path(pattern=_KEY_PATTERN),
    auth: AuthContext = Depends(require_api_key),
    r: aioredis.Redis = Depends(get_redis),
) -> SessionValueResponse:
    """Remove a key from the session store."""
    await delete_session_value(r, auth.tenant_id, key)
    return SessionValueResponse(value=None)
