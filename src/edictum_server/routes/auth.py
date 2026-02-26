"""Authentication routes -- login, logout, current user."""

from __future__ import annotations

import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.auth.provider import DashboardAuthContext
from edictum_server.db.engine import get_db
from edictum_server.db.models import User
from edictum_server.rate_limit import RateLimitExceeded, check_rate_limit
from edictum_server.redis.client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserInfoResponse(BaseModel):
    user_id: str
    tenant_id: str
    email: str
    is_admin: bool


def _get_auth_provider(request: Request) -> LocalAuthProvider:
    return request.app.state.auth_provider  # type: ignore[no-any-return]


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> JSONResponse:
    """Authenticate with email/password, receive session cookie."""
    provider = _get_auth_provider(request)

    # Rate limit by IP -- keyed before any credential check to prevent brute force
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"rate_limit:login:{client_ip}"
    try:
        await check_rate_limit(redis, rate_key)
    except RateLimitExceeded as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many login attempts. Please try again later."},
            headers={"Retry-After": str(exc.retry_after)},
        )

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Same error for bad email and bad password -- no user enumeration
    if user is None or not provider.verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token, cookie_params = await provider.create_session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        is_admin=user.is_admin,
    )

    response = JSONResponse(
        content={"message": "Logged in."},
        status_code=200,
    )
    response.set_cookie(**cookie_params)  # type: ignore[arg-type]
    return response


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    """Destroy session and clear cookie."""
    provider = _get_auth_provider(request)
    await provider.destroy_session(request)

    response = JSONResponse(content={"message": "Logged out."}, status_code=200)
    response.delete_cookie("edictum_session", path="/")
    return response


@router.get("/me", response_model=UserInfoResponse)
async def me(request: Request) -> UserInfoResponse:
    """Return current user info from session."""
    provider = _get_auth_provider(request)
    ctx: DashboardAuthContext = await provider.authenticate(request)
    return UserInfoResponse(
        user_id=str(ctx.user_id),
        tenant_id=str(ctx.tenant_id),
        email=ctx.email,
        is_admin=ctx.is_admin,
    )
