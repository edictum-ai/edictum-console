"""Protocol compliance tests for LocalAuthProvider."""

from __future__ import annotations

import uuid

import pytest
import redis.asyncio as aioredis
from fastapi import HTTPException

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.auth.provider import AuthProvider, DashboardAuthContext

TEST_REDIS_URL = "redis://localhost:6379/15"


@pytest.fixture()
async def redis() -> aioredis.Redis:
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=True)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


@pytest.fixture()
def provider(redis: aioredis.Redis) -> LocalAuthProvider:
    return LocalAuthProvider(redis=redis, session_ttl_hours=24)


class _FakeRequest:
    """Minimal request-like object for testing."""

    def __init__(self, cookies: dict[str, str] | None = None) -> None:
        self.cookies = cookies or {}


async def test_provider_name(provider: LocalAuthProvider) -> None:
    assert provider.provider_name == "local"


async def test_is_subclass_of_auth_provider() -> None:
    assert issubclass(LocalAuthProvider, AuthProvider)


async def test_create_session_returns_token_and_cookie_params(
    provider: LocalAuthProvider,
) -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token, cookie_params = await provider.create_session(
        user_id=user_id,
        tenant_id=tenant_id,
        email="test@example.com",
        is_admin=True,
    )

    assert isinstance(token, str)
    assert len(token) > 0
    assert cookie_params["key"] == "edictum_session"
    assert cookie_params["value"] == token
    assert cookie_params["httponly"] is True
    assert cookie_params["samesite"] == "lax"
    assert cookie_params["path"] == "/"


async def test_authenticate_with_valid_token(
    provider: LocalAuthProvider,
) -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token, _ = await provider.create_session(
        user_id=user_id,
        tenant_id=tenant_id,
        email="test@example.com",
        is_admin=False,
    )

    request = _FakeRequest(cookies={"edictum_session": token})
    ctx = await provider.authenticate(request)

    assert isinstance(ctx, DashboardAuthContext)
    assert ctx.user_id == user_id
    assert ctx.tenant_id == tenant_id
    assert ctx.email == "test@example.com"
    assert ctx.is_admin is False


async def test_authenticate_missing_cookie(
    provider: LocalAuthProvider,
) -> None:
    request = _FakeRequest(cookies={})
    with pytest.raises(HTTPException) as exc_info:
        await provider.authenticate(request)
    assert exc_info.value.status_code == 401


async def test_authenticate_expired_token(
    provider: LocalAuthProvider, redis: aioredis.Redis,
) -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token, _ = await provider.create_session(
        user_id=user_id,
        tenant_id=tenant_id,
        email="test@example.com",
        is_admin=True,
    )
    # Delete from Redis to simulate expiry
    await redis.delete(f"session:{token}")

    request = _FakeRequest(cookies={"edictum_session": token})
    with pytest.raises(HTTPException) as exc_info:
        await provider.authenticate(request)
    assert exc_info.value.status_code == 401


async def test_destroy_session_removes_token(
    provider: LocalAuthProvider, redis: aioredis.Redis,
) -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token, _ = await provider.create_session(
        user_id=user_id,
        tenant_id=tenant_id,
        email="test@example.com",
        is_admin=True,
    )

    # Token exists before destroy
    assert await redis.get(f"session:{token}") is not None

    request = _FakeRequest(cookies={"edictum_session": token})
    await provider.destroy_session(request)

    # Token gone after destroy
    assert await redis.get(f"session:{token}") is None


async def test_verify_password_round_trip() -> None:
    password = "my-secret-password-123"
    hashed = LocalAuthProvider.hash_password(password)
    assert LocalAuthProvider.verify_password(password, hashed)
    assert not LocalAuthProvider.verify_password("wrong-password", hashed)


async def test_hash_password_produces_unique_hashes() -> None:
    h1 = LocalAuthProvider.hash_password("same-password")
    h2 = LocalAuthProvider.hash_password("same-password")
    # bcrypt with different salts produces different hashes
    assert h1 != h2
    # Both verify against the same password
    assert LocalAuthProvider.verify_password("same-password", h1)
    assert LocalAuthProvider.verify_password("same-password", h2)
