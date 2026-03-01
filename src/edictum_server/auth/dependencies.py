"""FastAPI authentication dependencies."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.api_keys import verify_api_key
from edictum_server.auth.provider import DashboardAuthContext
from edictum_server.db.engine import get_db
from edictum_server.db.models import ApiKey

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AuthContext:
    """Resolved authentication context for the current request."""

    tenant_id: uuid.UUID
    auth_type: Literal["api_key", "dashboard"]
    env: str | None = None
    user_id: str | None = None
    agent_id: str | None = None


def _extract_bearer(authorization: str) -> str:
    """Extract the token from a Bearer authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use Bearer scheme.",
        )
    return authorization.removeprefix("Bearer ").strip()


async def require_api_key(
    authorization: str = Header(alias="Authorization"),
    x_edictum_agent_id: str | None = Header(default=None, alias="X-Edictum-Agent-Id"),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    """Authenticate an agent request via API key.

    Looks up the key by its 12-char prefix, then verifies with bcrypt.
    """
    raw_key = _extract_bearer(authorization)
    # Key format: edk_{env}_{random} — extract env and first 8 random chars.
    # This must match how generate_api_key() computes the prefix.
    parts = raw_key.split("_", 2)
    if len(parts) == 3:
        prefix = f"edk_{parts[1]}_{parts[2][:8]}"
    else:
        prefix = raw_key[:12]  # fallback for malformed keys (will fail verification)

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_prefix == prefix,
            ApiKey.revoked_at.is_(None),
        )
    )
    api_key = result.scalar_one_or_none()

    if api_key is None or not verify_api_key(raw_key, api_key.key_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key.",
        )

    return AuthContext(
        tenant_id=api_key.tenant_id,
        auth_type="api_key",
        env=api_key.env,
        agent_id=x_edictum_agent_id,
    )


async def require_dashboard_auth(
    request: Request,
) -> AuthContext:
    """Authenticate a dashboard (human) request via session cookie."""
    auth_provider = request.app.state.auth_provider
    ctx: DashboardAuthContext = await auth_provider.authenticate(request)
    return AuthContext(
        tenant_id=ctx.tenant_id,
        auth_type="dashboard",
        user_id=str(ctx.user_id),
    )


async def get_current_tenant(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    """Union dependency: try API key first, then fall back to dashboard cookie."""
    # API keys always start with "edk_"
    if authorization and authorization.startswith("Bearer ") and "edk_" in authorization:
        return await require_api_key(authorization=authorization, db=db)

    # Try dashboard cookie auth
    try:
        return await require_dashboard_auth(request=request)
    except HTTPException:
        pass

    # If we had an authorization header that wasn't an API key, try it
    if authorization:
        return await require_api_key(authorization=authorization, db=db)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )
