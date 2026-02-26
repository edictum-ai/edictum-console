"""Local authentication provider -- bcrypt passwords + Redis sessions."""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid

import bcrypt
import redis.asyncio as aioredis
from fastapi import HTTPException, Request, status

from edictum_server.auth.provider import AuthProvider, DashboardAuthContext

_COOKIE_NAME = "edictum_session"
_SESSION_PREFIX = "session:"


class LocalAuthProvider(AuthProvider):
    """Bcrypt password auth with Redis-backed sessions."""

    def __init__(self, redis: aioredis.Redis, session_ttl_hours: int = 24) -> None:
        self._redis = redis
        self._session_ttl = session_ttl_hours * 3600

    async def authenticate(self, request: Request) -> DashboardAuthContext:
        token = request.cookies.get(_COOKIE_NAME)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated.",
            )
        raw = await self._redis.get(f"{_SESSION_PREFIX}{token}")
        if raw is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalid.",
            )
        data = json.loads(raw)
        # Slide the expiration on each successful auth
        await self._redis.expire(f"{_SESSION_PREFIX}{token}", self._session_ttl)
        return DashboardAuthContext(
            user_id=uuid.UUID(data["user_id"]),
            tenant_id=uuid.UUID(data["tenant_id"]),
            email=data["email"],
            is_admin=data["is_admin"],
        )

    async def create_session(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        email: str,
        is_admin: bool,
    ) -> tuple[str, dict[str, str | bool | int]]:
        token = secrets.token_urlsafe(32)
        session_data = json.dumps({
            "user_id": str(user_id),
            "tenant_id": str(tenant_id),
            "email": email,
            "is_admin": is_admin,
        })
        await self._redis.set(
            f"{_SESSION_PREFIX}{token}",
            session_data,
            ex=self._session_ttl,
        )
        cookie_params: dict[str, str | bool | int] = {
            "key": _COOKIE_NAME,
            "value": token,
            "httponly": True,
            "samesite": "lax",
            "path": "/",
            "max_age": self._session_ttl,
        }
        return token, cookie_params

    async def destroy_session(self, request: Request) -> None:
        token = request.cookies.get(_COOKIE_NAME)
        if token:
            await self._redis.delete(f"{_SESSION_PREFIX}{token}")

    @property
    def provider_name(self) -> str:
        return "local"

    @staticmethod
    def _prehash(password: str) -> bytes:
        """SHA256 pre-hash to fit within bcrypt's 72-byte limit."""
        return hashlib.sha256(password.encode()).hexdigest().encode()

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password with bcrypt (SHA256 pre-hash)."""
        prehashed = LocalAuthProvider._prehash(password)
        return bcrypt.hashpw(prehashed, bcrypt.gensalt(rounds=12)).decode()

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Verify a password against a bcrypt hash."""
        prehashed = LocalAuthProvider._prehash(password)
        return bcrypt.checkpw(prehashed, hashed.encode())
