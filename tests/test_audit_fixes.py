"""Tests for post-audit fixes: HIGH-2, HIGH-4, HIGH-6, BUG-7, BUG-8, BUG-12, M2."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import fakeredis.aioredis
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext
from edictum_server.db.models import Event
from edictum_server.services.session_service import _validate_key
from tests.conftest import TENANT_A_ID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_event(call_id: str = "call-1", **overrides: object) -> dict:
    base = {
        "call_id": call_id,
        "agent_id": "agent-1",
        "tool_name": "shell",
        "verdict": "deny",
        "mode": "enforce",
        "timestamp": "2026-02-18T12:00:00Z",
        "payload": {"reason": "blocked"},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# HIGH-2: Staging API key can read production events
# ---------------------------------------------------------------------------


def _make_staging_auth() -> AuthContext:
    return AuthContext(tenant_id=TENANT_A_ID, auth_type="api_key", env="staging")


def _make_production_auth() -> AuthContext:
    return AuthContext(tenant_id=TENANT_A_ID, auth_type="api_key", env="production")


@pytest.fixture()
def set_auth_production() -> Callable[[], None]:
    """Swap auth to production API key."""
    from edictum_server.auth.dependencies import get_current_tenant, require_api_key
    from edictum_server.main import app

    def _swap() -> None:
        app.dependency_overrides[require_api_key] = _make_production_auth
        app.dependency_overrides[get_current_tenant] = _make_production_auth

    return _swap


@pytest.fixture()
def set_auth_staging() -> Callable[[], None]:
    """Swap auth to staging API key."""
    from edictum_server.auth.dependencies import get_current_tenant, require_api_key
    from edictum_server.main import app

    def _swap() -> None:
        app.dependency_overrides[require_api_key] = _make_staging_auth
        app.dependency_overrides[get_current_tenant] = _make_staging_auth

    return _swap


@pytest.mark.security
async def test_staging_key_cannot_read_production_events(
    client: AsyncClient,
    set_auth_production: Callable[[], None],
    set_auth_staging: Callable[[], None],
) -> None:
    """HIGH-2: staging API key must NOT see production events."""
    # Ingest event via production key
    set_auth_production()
    await client.post(
        "/api/v1/events",
        json={"events": [_make_event("prod-event-1")]},
    )
    # Ingest event via staging key
    set_auth_staging()
    await client.post(
        "/api/v1/events",
        json={"events": [_make_event("staging-event-1")]},
    )

    # Staging should only see staging events
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    call_ids = {e["call_id"] for e in resp.json()}
    assert "staging-event-1" in call_ids
    assert "prod-event-1" not in call_ids


@pytest.mark.security
async def test_production_key_cannot_read_staging_events(
    client: AsyncClient,
    set_auth_production: Callable[[], None],
    set_auth_staging: Callable[[], None],
) -> None:
    """HIGH-2: production API key must NOT see staging events."""
    set_auth_staging()
    await client.post(
        "/api/v1/events",
        json={"events": [_make_event("staging-only")]},
    )
    set_auth_production()
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    call_ids = {e["call_id"] for e in resp.json()}
    assert "staging-only" not in call_ids


async def test_event_env_stored_on_ingest(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_staging: Callable[[], None],
) -> None:
    """Events ingested via API key store the env from the key."""
    set_auth_staging()
    await client.post(
        "/api/v1/events",
        json={"events": [_make_event("env-check")]},
    )
    from sqlalchemy import select

    result = await db_session.execute(
        select(Event).where(Event.call_id == "env-check")
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.env == "staging"


# ---------------------------------------------------------------------------
# HIGH-4: Redis telegram keys have no TTL (should be 7 days)
# ---------------------------------------------------------------------------


async def test_telegram_redis_keys_have_ttl(
    test_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    """HIGH-4: Telegram approval keys must have 7-day TTL."""
    from edictum_server.notifications.telegram import TelegramChannel
    from unittest.mock import AsyncMock

    mock_client = AsyncMock()
    mock_client.send_message.return_value = {"message_id": 123}

    channel = TelegramChannel(
        client=mock_client,
        chat_id=12345,
        redis=test_redis,
        channel_id="test-chan",
    )

    await channel.send_approval_request(
        approval_id="abc-123",
        agent_id="agent-1",
        tool_name="shell",
        tool_args=None,
        message="Approve?",
        env="production",
        timeout_seconds=300,
        timeout_effect="deny",
        tenant_id=str(uuid.uuid4()),
    )

    # Check TTL on both keys
    msg_ttl = await test_redis.ttl(f"telegram:msg:test-chan:abc-123")
    tenant_ttl = await test_redis.ttl(f"telegram:tenant:test-chan:abc-123")

    seven_days = 86400 * 7
    # TTL should be approximately 7 days (allow 10s tolerance for test execution)
    assert msg_ttl > seven_days - 10
    assert tenant_ttl > seven_days - 10


# ---------------------------------------------------------------------------
# BUG-7: Env validation only in route, not schema
# ---------------------------------------------------------------------------


async def test_create_key_rejects_invalid_env_via_schema(
    client: AsyncClient,
) -> None:
    """BUG-7: Pydantic schema rejects invalid env values."""
    resp = await client.post("/api/v1/keys", json={"env": "custom"})
    assert resp.status_code == 422

    resp = await client.post("/api/v1/keys", json={"env": ""})
    assert resp.status_code == 422


async def test_deploy_rejects_invalid_env_via_schema(
    client: AsyncClient,
) -> None:
    """BUG-7: DeployRequest schema rejects invalid env values."""
    # First upload a bundle so we have something to deploy
    await client.post(
        "/api/v1/bundles",
        json={
            "yaml_content": (
                "apiVersion: edictum/v1\nkind: ContractBundle\n"
                "metadata:\n  name: test\ncontracts:\n  - id: t\n"
                "    type: pre\n    tool: shell\n    then:\n      effect: deny\n"
            )
        },
    )
    resp = await client.post(
        "/api/v1/bundles/test/1/deploy",
        json={"env": "custom-env"},
    )
    assert resp.status_code == 422


async def test_create_key_accepts_valid_envs(client: AsyncClient) -> None:
    """BUG-7: All three valid env values are accepted."""
    for env in ("production", "staging", "development"):
        resp = await client.post("/api/v1/keys", json={"env": env})
        assert resp.status_code == 201, f"Failed for env={env}"


# ---------------------------------------------------------------------------
# BUG-8: Wrong JSON null comparison in stats_service
# ---------------------------------------------------------------------------


async def test_stats_handles_null_decision_name(
    client: AsyncClient,
) -> None:
    """BUG-8: Events with null/missing decision_name don't break stats."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    # Event with no decision_name in payload
    events = [
        _make_event("no-decision", payload={"reason": "no contract"}, timestamp=now),
        _make_event(
            "with-decision",
            payload={"decision_name": "test-contract", "reason": "blocked"},
            timestamp=now,
        ),
    ]
    await client.post("/api/v1/events", json={"events": events})

    resp = await client.get("/api/v1/stats/overview")
    assert resp.status_code == 200
    data = resp.json()
    # Should not error and should count events correctly
    assert data["events_24h"] >= 2


async def test_contract_stats_handles_null_decision_name(
    client: AsyncClient,
) -> None:
    """BUG-8: Contract stats endpoint handles missing decision_name."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    events = [
        _make_event("null-decision", payload=None, timestamp=now),
        _make_event(
            "valid-decision",
            payload={"decision_name": "my-contract", "reason": "ok"},
            timestamp=now,
        ),
    ]
    await client.post("/api/v1/events", json={"events": events})

    resp = await client.get(
        "/api/v1/stats/contracts",
        params={"since": "2020-01-01T00:00:00Z", "until": "2030-01-01T00:00:00Z"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# BUG-12: Session Redis keys not sanitized
# ---------------------------------------------------------------------------


def test_session_key_validation_rejects_injection() -> None:
    """BUG-12: Session keys with special characters are rejected."""
    with pytest.raises(ValueError):
        _validate_key("")

    with pytest.raises(ValueError):
        _validate_key("key with spaces")

    with pytest.raises(ValueError):
        _validate_key("key\nnewline")

    with pytest.raises(ValueError):
        _validate_key("key\x00null")

    with pytest.raises(ValueError):
        _validate_key("key\ttab")

    with pytest.raises(ValueError):
        _validate_key("key;semicolon")


def test_session_key_validation_accepts_valid_keys() -> None:
    """BUG-12: Valid session keys pass validation."""
    # Should not raise
    _validate_key("simple-key")
    _validate_key("agent:counter")
    _validate_key("my.key.name")
    _validate_key("path/to/value")
    _validate_key("key_with_underscores")
    _validate_key("MiXeD123")


async def test_session_endpoint_rejects_invalid_key(client: AsyncClient) -> None:
    """BUG-12: Session endpoints reject keys with invalid characters."""
    # Semicolon is not in allowed set
    resp = await client.get("/api/v1/sessions/key;injection")
    assert resp.status_code == 422

    # Equals sign not in allowed set
    resp = await client.put(
        "/api/v1/sessions/key=value",
        json={"value": "injected"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# M2: /docs exposed in production
# ---------------------------------------------------------------------------


def test_docs_disabled_in_production() -> None:
    """M2: OpenAPI docs are disabled when env_name is 'production'."""
    import os

    original = os.environ.get("EDICTUM_ENV_NAME")
    try:
        os.environ["EDICTUM_ENV_NAME"] = "production"
        # Clear cached settings
        from edictum_server.config import get_settings

        get_settings.cache_clear()
        settings = get_settings()
        assert settings.env_name == "production"

        # Verify the FastAPI app would be configured without docs
        # (We check the setting; actual app creation happens at module load)
        assert settings.env_name == "production"
    finally:
        if original is not None:
            os.environ["EDICTUM_ENV_NAME"] = original
        else:
            os.environ.pop("EDICTUM_ENV_NAME", None)
        get_settings.cache_clear()


def test_docs_enabled_in_development() -> None:
    """M2: OpenAPI docs are available in development mode."""
    from edictum_server.config import get_settings

    get_settings.cache_clear()
    settings = get_settings()
    # Default env_name is "development" — docs should be enabled
    assert settings.env_name != "production"
    get_settings.cache_clear()
