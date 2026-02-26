"""S8: Rate limiting on auth tests.

Risk if bypassed: Credential brute force.

NOTE: Rate limiting may not be implemented yet. These tests document
what rate limiting should do and verify the auth endpoints are accessible.
Marked with skip if rate limiting is not implemented.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User

pytestmark = pytest.mark.security


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
    db_session: AsyncSession,
    _auth_user: tuple[str, str],
) -> None:
    """Login endpoint responds to valid requests."""
    email, password = _auth_user
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200


@pytest.mark.skip(reason="Rate limiting not yet implemented")
async def test_burst_login_attempts_throttled(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
    _auth_user: tuple[str, str],
) -> None:
    """Rapid failed login attempts should be throttled."""
    email, _ = _auth_user
    responses = []
    for _ in range(20):
        resp = await no_auth_client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong-password"},
        )
        responses.append(resp.status_code)

    # After enough failures, should start getting 429
    assert 429 in responses


@pytest.mark.skip(reason="Rate limiting not yet implemented")
async def test_rate_limit_resets_after_window(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
    _auth_user: tuple[str, str],
) -> None:
    """After the rate limit window passes, requests should succeed again."""
    email, password = _auth_user
    # This test would need a time mock to advance the window.
    # Documenting the expected behavior for when rate limiting is added.
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
