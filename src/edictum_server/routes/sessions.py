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
from fastapi.responses import JSONResponse
from starlette import status

from edictum_server.auth.dependencies import AuthContext, require_api_key
from edictum_server.rate_limit import RateLimitExceeded, check_rate_limit
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

# Session keys must match this pattern to prevent Redis key injection
_KEY_PATTERN = r"^[a-zA-Z0-9_\-\.:/]+$"

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])

# Session endpoints: 100 writes/minute per tenant (M15)
_SESSION_RATE_LIMIT = 100
_SESSION_RATE_WINDOW = 60


async def _check_session_rate_limit(
    r: aioredis.Redis, auth: AuthContext,
) -> JSONResponse | None:
    """Return a 429 JSONResponse if rate limit exceeded, else None."""
    rate_key = f"rate_limit:session:{auth.tenant_id}"
    try:
        await check_rate_limit(
            r, rate_key,
            max_attempts=_SESSION_RATE_LIMIT,
            window_seconds=_SESSION_RATE_WINDOW,
        )
    except RateLimitExceeded as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Session store rate limit exceeded."},
            headers={"Retry-After": str(exc.retry_after)},
        )
    return None


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
) -> SessionValueResponse | JSONResponse:
    """Write a string value to the session store."""
    if rate_resp := await _check_session_rate_limit(r, auth):
        return rate_resp
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
) -> IncrementResponse | JSONResponse:
    """Atomically increment a numeric session key."""
    if rate_resp := await _check_session_rate_limit(r, auth):
        return rate_resp  # type: ignore[return-value]
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
