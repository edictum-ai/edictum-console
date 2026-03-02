"""S3: Tenant isolation on settings endpoints.

Risk if bypassed: Cross-tenant data leak. SHIP-BLOCKER.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.config import Settings, get_settings
from edictum_server.db.models import Event, Tenant
from edictum_server.db.models import SigningKey as SigningKeyModel
from edictum_server.main import app
from edictum_server.services.signing_service import generate_signing_keypair
from tests.conftest import TENANT_A_ID, TENANT_B_ID

pytestmark = pytest.mark.security

CHANNELS_URL = "/api/v1/notifications/channels"
TELEGRAM_CONFIG = {"bot_token": "test-bot-token", "chat_id": "123456"}


# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------


async def test_channels_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create channel as tenant A, list as tenant B -> not visible."""
    await client.post(
        CHANNELS_URL,
        json={"name": "a-channel", "channel_type": "telegram", "config": TELEGRAM_CONFIG},
    )

    set_auth_tenant_b()
    resp = await client.get(CHANNELS_URL)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_update_channel_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant B cannot update tenant A's channel."""
    create_resp = await client.post(
        CHANNELS_URL,
        json={"name": "a-channel", "channel_type": "telegram", "config": TELEGRAM_CONFIG},
    )
    ch_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.put(f"{CHANNELS_URL}/{ch_id}", json={"name": "hijacked"})
    assert resp.status_code == 404


async def test_delete_channel_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant B cannot delete tenant A's channel."""
    create_resp = await client.post(
        CHANNELS_URL,
        json={"name": "a-channel", "channel_type": "telegram", "config": TELEGRAM_CONFIG},
    )
    ch_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.delete(f"{CHANNELS_URL}/{ch_id}")
    assert resp.status_code == 404


async def test_test_channel_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant B cannot test tenant A's channel."""
    create_resp = await client.post(
        CHANNELS_URL,
        json={"name": "a-channel", "channel_type": "telegram", "config": TELEGRAM_CONFIG},
    )
    ch_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.post(f"{CHANNELS_URL}/{ch_id}/test")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Signing key rotation
# ---------------------------------------------------------------------------


async def test_rotate_key_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Rotating tenant A's key must not affect tenant B's key."""
    # b"0" * 32 is 32 bytes of 0x30; hex representation is "30" * 32
    app.dependency_overrides[get_settings] = lambda: Settings(
        signing_key_secret="30" * 32,
    )
    try:
        tenant_a = Tenant(id=TENANT_A_ID, name="tenant-a")
        tenant_b = Tenant(id=TENANT_B_ID, name="tenant-b")
        db_session.add_all([tenant_a, tenant_b])
        await db_session.flush()

        secret = b"0" * 32
        pub_a, priv_a = generate_signing_keypair(secret)
        key_a = SigningKeyModel(
            tenant_id=TENANT_A_ID, public_key=pub_a,
            private_key_encrypted=priv_a, active=True,
        )
        pub_b, priv_b = generate_signing_keypair(secret)
        key_b = SigningKeyModel(
            tenant_id=TENANT_B_ID, public_key=pub_b,
            private_key_encrypted=priv_b, active=True,
        )
        db_session.add_all([key_a, key_b])
        await db_session.commit()

        original_pub_b = bytes(pub_b)

        # Rotate tenant A's key
        resp = await client.post("/api/v1/settings/rotate-signing-key")
        assert resp.status_code == 201

        # Tenant B's key must be unchanged
        await db_session.refresh(key_b)
        assert bytes(key_b.public_key) == original_pub_b
        assert key_b.active is True
    finally:
        app.dependency_overrides.pop(get_settings, None)


# ---------------------------------------------------------------------------
# Event purging
# ---------------------------------------------------------------------------


async def test_purge_events_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Purging as tenant A does not touch tenant B's events."""
    old_time = datetime.now(UTC) - timedelta(days=60)

    # Seed events for both tenants
    for tenant_id, call_id in [(TENANT_A_ID, "a-call"), (TENANT_B_ID, "b-call")]:
        event = Event(
            tenant_id=tenant_id,
            call_id=call_id,
            agent_id="agent-1",
            tool_name="shell",
            verdict="allow",
            mode="enforce",
            env="production",
            timestamp=old_time,
        )
        db_session.add(event)
    await db_session.flush()
    # Backdate created_at (server_default sets it to now())
    for call_id in ["a-call", "b-call"]:
        await db_session.execute(
            update(Event)
            .where(Event.call_id == call_id)
            .values(created_at=old_time)
        )
    await db_session.commit()

    # Purge as tenant A
    resp = await client.delete("/api/v1/settings/purge-events", params={"older_than_days": 30})
    assert resp.status_code == 200
    assert resp.json()["deleted_count"] == 1  # only tenant A's event

    # Switch to tenant B, their event should still be there
    set_auth_tenant_b()
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    events = resp.json()
    assert any(e["call_id"] == "b-call" for e in events)
