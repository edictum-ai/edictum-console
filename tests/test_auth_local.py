"""Tests for local auth login/logout/me endpoints."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User


async def _create_test_user(db: AsyncSession) -> tuple[str, str, Tenant]:
    """Create a tenant + user and return (email, password, tenant)."""
    tenant = Tenant(name="test-tenant")
    db.add(tenant)
    await db.flush()

    email = "admin@test.com"
    password = "correct-horse-battery-staple"
    password_hash = LocalAuthProvider.hash_password(password)
    user = User(
        tenant_id=tenant.id,
        email=email,
        password_hash=password_hash,
        is_admin=True,
    )
    db.add(user)
    await db.commit()
    return email, password, tenant


async def test_login_valid_credentials(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email, password, _ = await _create_test_user(db_session)
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    assert "edictum_session" in resp.cookies


async def test_login_bad_password(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email, _, _ = await _create_test_user(db_session)
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert "Invalid email or password" in resp.json()["detail"]


async def test_login_nonexistent_email(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_test_user(db_session)
    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@test.com", "password": "whatever"},
    )
    assert resp.status_code == 401
    # Same error as bad password -- no user enumeration
    assert "Invalid email or password" in resp.json()["detail"]


async def test_me_with_valid_session(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email, password, _ = await _create_test_user(db_session)
    login_resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    cookie = login_resp.cookies["edictum_session"]

    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == email
    assert data["is_admin"] is True


async def test_me_without_cookie(no_auth_client: AsyncClient) -> None:
    resp = await no_auth_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_logout_clears_session(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    email, password, _ = await _create_test_user(db_session)
    login_resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    cookie = login_resp.cookies["edictum_session"]

    logout_resp = await no_auth_client.post(
        "/api/v1/auth/logout",
        cookies={"edictum_session": cookie},
    )
    assert logout_resp.status_code == 200

    # Session should be invalidated -- /me should fail
    me_resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert me_resp.status_code == 401


async def test_session_expiry(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
    test_redis,
) -> None:
    """Create a session, manually delete it from Redis, verify 401."""
    email, password, _ = await _create_test_user(db_session)

    login_resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    cookie = login_resp.cookies["edictum_session"]

    # Simulate expiry by deleting the session key from Redis
    await test_redis.delete(f"session:{cookie}")

    me_resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert me_resp.status_code == 401
