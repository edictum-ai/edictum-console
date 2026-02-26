"""S8: Rate limiting on auth tests.

Risk if bypassed: Credential brute force.

Tests verify that the login endpoint enforces per-IP sliding-window
rate limiting backed by Redis sorted sets.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User

pytestmark = pytest.mark.security

# Use a low limit so tests stay fast
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 60


@pytest.fixture()
async def _auth_user(db_session: AsyncSession) -> tuple[str, str]:
    """Create a user for rate limit testing."""
    tenant = Tenant(name="rate-limit-tenant")
    db_session.add(tenant)
    await db_session.flush()
    email = "ratelimit@test.com"
    password = "valid-password"
    user = User(
        tenant_id=tenant.id,
        email=email,
        password_hash=LocalAuthProvider.hash_password(password),
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    return email, password


async def test_login_endpoint_accessible(
    no_auth_client: AsyncClient,
    _auth_user: tuple[str, str],
) -> None:
    """Login endpoint responds to valid requests."""
    email, password = _auth_user
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200


async def test_burst_login_attempts_throttled(
    no_auth_client: AsyncClient,
    _auth_user: tuple[str, str],
) -> None:
    """Rapid failed login attempts should be throttled after max_attempts."""
    email, _ = _auth_user

    with patch(
        "edictum_server.rate_limit.get_settings",
    ) as mock_settings:
        mock_settings.return_value.rate_limit_max_attempts = _MAX_ATTEMPTS
        mock_settings.return_value.rate_limit_window_seconds = _WINDOW_SECONDS

        responses = []
        for _ in range(_MAX_ATTEMPTS + 5):
            resp = await no_auth_client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "wrong-password"},
            )
            responses.append(resp.status_code)

        # First _MAX_ATTEMPTS should be 401 (bad password), rest should be 429
        assert all(code == 401 for code in responses[:_MAX_ATTEMPTS])
        assert all(code == 429 for code in responses[_MAX_ATTEMPTS:])

        # 429 responses must include Retry-After header
        last_resp = await no_auth_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong-password"},
        )
        assert last_resp.status_code == 429
        assert "retry-after" in last_resp.headers
        retry_after = int(last_resp.headers["retry-after"])
        assert retry_after > 0


async def test_rate_limit_resets_after_window(
    no_auth_client: AsyncClient,
    _auth_user: tuple[str, str],
    test_redis: object,
) -> None:
    """After the rate limit window passes, requests should succeed again."""
    email, password = _auth_user

    with patch(
        "edictum_server.rate_limit.get_settings",
    ) as mock_settings:
        mock_settings.return_value.rate_limit_max_attempts = _MAX_ATTEMPTS
        mock_settings.return_value.rate_limit_window_seconds = _WINDOW_SECONDS

        # Exhaust the rate limit
        for _ in range(_MAX_ATTEMPTS):
            await no_auth_client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "wrong-password"},
            )

        # Confirm we are rate limited
        resp = await no_auth_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 429

        # Simulate window expiry by flushing the rate limit key from Redis
        # This mimics the sorted set entries aging out of the window.
        import redis.asyncio as aioredis

        r: aioredis.Redis = test_redis  # type: ignore[assignment]
        keys = await r.keys("rate_limit:login:*")
        for key in keys:
            await r.delete(key)

        # Now login should succeed again
        resp = await no_auth_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 200
