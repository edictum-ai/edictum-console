"""Local authentication provider -- bcrypt passwords + Redis sessions."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid

import bcrypt
import redis.asyncio as aioredis
from fastapi import HTTPException, Request, status

from edictum_server.auth.provider import AuthProvider, DashboardAuthContext

_COOKIE_NAME = "edictum_session"
_SESSION_PREFIX = "session:"
_MAX_ABSOLUTE_LIFETIME = 7 * 24 * 3600  # 7 days — no session lives beyond this


class LocalAuthProvider(AuthProvider):
    """Bcrypt password auth with HMAC-signed Redis-backed sessions."""

    def __init__(
        self,
        redis: aioredis.Redis,
        session_ttl_hours: int = 24,
        *,
        secure_cookies: bool = False,
        secret_key: str,
    ) -> None:
        if not secret_key:
            raise ValueError("secret_key must not be empty")
        self._redis = redis
        self._session_ttl = session_ttl_hours * 3600
        self._secure_cookies = secure_cookies
        self._secret_key = secret_key

    def _sign(self, data: str) -> str:
        """HMAC-SHA256 sign session data, return 'hmac_hex:json' string."""
        mac = hmac.new(self._secret_key.encode(), data.encode(), hashlib.sha256).hexdigest()
        return f"{mac}:{data}"

    def _verify_and_parse(self, raw: str) -> dict[str, object] | None:
        """Verify HMAC signature and return parsed session data, or None."""
        if ":" not in raw:
            return None
        stored_mac, _, payload = raw.partition(":")
        expected_mac = hmac.new(
            self._secret_key.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(stored_mac, expected_mac):
            return None
        try:
            return json.loads(payload)  # type: ignore[no-any-return]
        except (json.JSONDecodeError, ValueError):
            return None

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

        # Verify HMAC signature — reject tampered sessions
        raw_str = raw if isinstance(raw, str) else raw.decode()
        data = self._verify_and_parse(raw_str)
        if data is None:
            # Tampered or legacy unsigned session — destroy it
            await self._redis.delete(f"{_SESSION_PREFIX}{token}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalid.",
            )

        # Enforce absolute session lifetime (7 days max)
        created_at = data.get("created_at")
        expired = (
            isinstance(created_at, int | float)
            and time.time() - created_at > _MAX_ABSOLUTE_LIFETIME
        )
        if expired:
            await self._redis.delete(f"{_SESSION_PREFIX}{token}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please log in again.",
            )

        # Slide the expiration on each successful auth
        await self._redis.expire(f"{_SESSION_PREFIX}{token}", self._session_ttl)
        return DashboardAuthContext(
            user_id=uuid.UUID(str(data["user_id"])),
            tenant_id=uuid.UUID(str(data["tenant_id"])),
            email=str(data["email"]),
            is_admin=bool(data["is_admin"]),
        )

    async def create_session(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        email: str,
        is_admin: bool,
    ) -> tuple[str, dict[str, str | bool | int]]:
        token = secrets.token_urlsafe(32)
        session_data = json.dumps(
            {
                "user_id": str(user_id),
                "tenant_id": str(tenant_id),
                "email": email,
                "is_admin": is_admin,
                "created_at": time.time(),
            }
        )
        # HMAC-sign session data to prevent forgery via Redis access
        signed = self._sign(session_data)
        await self._redis.set(
            f"{_SESSION_PREFIX}{token}",
            signed,
            ex=self._session_ttl,
        )
        cookie_params: dict[str, str | bool | int] = {
            "key": _COOKIE_NAME,
            "value": token,
            "httponly": True,
            "samesite": "lax",
            "path": "/",
            "max_age": self._session_ttl,
            "secure": self._secure_cookies,
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
        """SHA256 pre-hash to fit within bcrypt's 72-byte limit.

        Standard pattern (Dropbox, etc.) to handle passwords > 72 bytes.
        Security comes from bcrypt — the prehash only ensures the full password
        contributes to the hash (bcrypt silently truncates at 72 bytes).
        """
        # lgtm[py/weak-sensitive-data-hashing] — prehash feeds into bcrypt
        digest = hashlib.sha256(password.encode()).hexdigest()
        return digest.encode()

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
