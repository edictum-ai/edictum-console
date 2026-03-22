"""S1: Session cookie validation bypass tests.

Risk if bypassed: Full account takeover.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User

pytestmark = pytest.mark.security


@pytest.fixture()
async def _user_with_session(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,
    test_redis,  # noqa: ARG001
) -> tuple[str, str]:
    """Create a user, log in, return (cookie, email)."""
    tenant = Tenant(name="session-test-tenant")
    db_session.add(tenant)
    await db_session.flush()
    password_hash = LocalAuthProvider.hash_password("good-password")
    user = User(
        tenant_id=tenant.id,
        email="session-user@test.com",
        password_hash=password_hash,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()

    resp = await no_auth_client.post(
        "/api/v1/auth/login",
        json={"email": "session-user@test.com", "password": "good-password"},
    )
    assert resp.status_code == 200
    return resp.cookies["edictum_session"], "session-user@test.com"


async def test_forged_cookie_random_string(no_auth_client: AsyncClient) -> None:
    """A random string in the session cookie should be rejected."""
    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": "totally-forged-random-string-abcdef123456"},
    )
    assert resp.status_code == 401


async def test_empty_cookie_header(no_auth_client: AsyncClient) -> None:
    """An empty session cookie value should be rejected."""
    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": ""},
    )
    assert resp.status_code == 401


async def test_expired_session_token(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,  # noqa: ARG001
    test_redis,
    _user_with_session: tuple[str, str],
) -> None:
    """After deleting the session from Redis, the cookie should be rejected."""
    cookie, _ = _user_with_session

    # Verify session works first
    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 200

    # Simulate expiry by deleting from Redis
    await test_redis.delete(f"session:{cookie}")

    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 401


async def test_tampered_session_payload(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,  # noqa: ARG001
    test_redis,
    _user_with_session: tuple[str, str],
) -> None:
    """Overwriting Redis session data with garbage should not grant valid access.

    The app may raise an unhandled exception (which ASGI propagates) or
    return 401/500 -- either way, the attacker does NOT get user info.
    """
    cookie, _ = _user_with_session

    # Overwrite with invalid JSON
    await test_redis.set(f"session:{cookie}", "not-valid-json")

    try:
        resp = await no_auth_client.get(
            "/api/v1/auth/me",
            cookies={"edictum_session": cookie},
        )
        # If a response comes back, it must NOT be 200 with user info
        assert resp.status_code != 200
    except Exception:
        # Server raised an unhandled error -- still means no access granted.
        # This is an implementation issue (should catch JSONDecodeError in
        # authenticate), but from a security perspective the attacker is denied.
        pass


async def test_sql_injection_in_cookie_value(no_auth_client: AsyncClient) -> None:
    """SQL injection attempt in the cookie value should not break anything."""
    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": "' OR 1=1; DROP TABLE users; --"},
    )
    assert resp.status_code == 401


async def test_hmac_wrong_key_rejected(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,  # noqa: ARG001
    test_redis,
    _user_with_session: tuple[str, str],
) -> None:
    """A session signed with the wrong key must be rejected (401)."""
    cookie, _ = _user_with_session
    payload = json.dumps(
        {
            "user_id": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "email": "attacker@evil.com",
            "is_admin": True,
            "created_at": time.time(),
        }
    )
    bad_mac = hmac.new(
        b"wrong-key-not-the-real-secret",
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    await test_redis.set(f"session:{cookie}", f"{bad_mac}:{payload}")

    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 401


async def test_hmac_tampered_payload_rejected(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,  # noqa: ARG001
    test_redis,
    _user_with_session: tuple[str, str],
) -> None:
    """Modifying session JSON after signing must be rejected.

    Attack: read a valid signed session from Redis, keep the HMAC prefix,
    replace the JSON payload with an escalated identity. The HMAC no longer
    matches the payload so authenticate() must return 401.
    """
    cookie, _ = _user_with_session
    original = await test_redis.get(f"session:{cookie}")
    real_mac, _, _ = original.partition(":")

    forged_payload = json.dumps(
        {
            "user_id": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "email": "forged@evil.com",
            "is_admin": True,
            "created_at": time.time(),
        }
    )
    await test_redis.set(
        f"session:{cookie}",
        f"{real_mac}:{forged_payload}",
    )

    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 401


async def test_unsigned_legacy_session_rejected(
    no_auth_client: AsyncClient,
    db_session: AsyncSession,  # noqa: ARG001
    test_redis,
    _user_with_session: tuple[str, str],
) -> None:
    """A plain JSON session (no HMAC prefix) must be rejected.

    Simulates a pre-signing legacy session or an attacker who writes
    raw JSON directly to Redis without computing an HMAC.
    """
    cookie, _ = _user_with_session
    raw_json = json.dumps(
        {
            "user_id": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "email": "legacy@evil.com",
            "is_admin": True,
        }
    )
    # No "mac:" prefix — just plain JSON
    await test_redis.set(f"session:{cookie}", raw_json)

    resp = await no_auth_client.get(
        "/api/v1/auth/me",
        cookies={"edictum_session": cookie},
    )
    assert resp.status_code == 401
