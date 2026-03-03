"""Adversarial input manipulation tests for coverage endpoints.

Tests encoding tricks, injection, type confusion, and boundary values
on the since, env, and agent_id parameters.

Risk if bypassed: DoS via overflow, SQL injection, path traversal.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from edictum_server.services.coverage_service import parse_since
from tests.conftest import TENANT_A_ID

pytestmark = pytest.mark.security


# ---------------------------------------------------------------------------
# parse_since — unit-level adversarial tests
# ---------------------------------------------------------------------------


def test_parse_since_overflow_days() -> None:
    """Absurdly large day value raises ValueError, not OverflowError."""
    with pytest.raises(ValueError, match="Duration too large"):
        parse_since("99999999999999999999d")


def test_parse_since_overflow_hours() -> None:
    """Absurdly large hour value raises ValueError, not OverflowError."""
    with pytest.raises(ValueError, match="Duration too large"):
        parse_since("99999999999999999999h")


def test_parse_since_overflow_minutes() -> None:
    """Absurdly large minute value raises ValueError, not OverflowError."""
    with pytest.raises(ValueError, match="99999999999999999999m"):
        parse_since("99999999999999999999m")


def test_parse_since_boundary_just_over_limit() -> None:
    """3651 days (just over 10-year cap) is rejected."""
    with pytest.raises(ValueError, match="Duration too large"):
        parse_since("3651d")


def test_parse_since_boundary_at_limit() -> None:
    """3650 days (exactly 10 years) is accepted."""
    result = parse_since("3650d")
    assert result < datetime.now(UTC)


def test_parse_since_zero_duration() -> None:
    """Zero duration is valid (means 'now')."""
    result = parse_since("0h")
    assert abs((result - datetime.now(UTC)).total_seconds()) < 5


def test_parse_since_negative_not_matched() -> None:
    """Negative values don't match the regex, raise ValueError."""
    with pytest.raises(ValueError, match="Invalid since value"):
        parse_since("-1h")


def test_parse_since_sql_injection_attempt() -> None:
    """SQL metacharacters in since are rejected as invalid."""
    with pytest.raises(ValueError, match="Invalid since value"):
        parse_since("1h'; DROP TABLE events; --")


def test_parse_since_null_byte() -> None:
    """Null byte injection is rejected."""
    with pytest.raises(ValueError, match="Invalid since value"):
        parse_since("1h\x00")


# ---------------------------------------------------------------------------
# since parameter — endpoint-level tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fleet_coverage_overflow_since(client: AsyncClient) -> None:
    """Overflow since returns 400, not 500."""
    resp = await client.get("/api/v1/agents/fleet-coverage?since=99999999999999999999d")
    assert resp.status_code == 400
    assert "Duration too large" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_agent_coverage_overflow_since(client: AsyncClient) -> None:
    """Overflow since on per-agent endpoint returns 400."""
    resp = await client.get("/api/v1/agents/test-agent/coverage?since=99999999999999999999d")
    assert resp.status_code == 400
    assert "Duration too large" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_fleet_coverage_sql_injection_since(client: AsyncClient) -> None:
    """SQL injection in since returns 400."""
    resp = await client.get(
        "/api/v1/agents/fleet-coverage",
        params={"since": "1h'; DROP TABLE events; --"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# agent_id — path traversal and injection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_id_path_traversal(client: AsyncClient) -> None:
    """Path traversal in agent_id doesn't escape tenant scope.

    The agent_id is used as a SQL filter value (not a file path), so
    traversal characters are harmless — but we verify it doesn't crash
    and returns 404 (no data for this nonexistent agent).
    """
    resp = await client.get("/api/v1/agents/..%2F..%2F..%2Fetc%2Fpasswd/coverage")
    assert resp.status_code in (404, 400)


@pytest.mark.asyncio
async def test_agent_id_sql_metacharacters(client: AsyncClient) -> None:
    """SQL metacharacters in agent_id don't cause injection."""
    resp = await client.get(
        "/api/v1/agents/agent'; DROP TABLE events; --/coverage"
    )
    # Should be 404 (no events for this agent_id) or 400, never 500
    assert resp.status_code in (404, 400)


@pytest.mark.asyncio
async def test_agent_id_empty_string(client: AsyncClient) -> None:
    """Empty agent_id handled gracefully (404 or route-not-found)."""
    # FastAPI won't match /{agent_id} with empty string — it would hit /fleet-coverage
    # or return 404/405. Just verify no 500.
    resp = await client.get("/api/v1/agents//coverage")
    assert resp.status_code != 500


@pytest.mark.asyncio
async def test_agent_id_very_long(client: AsyncClient) -> None:
    """Extremely long agent_id doesn't crash the server."""
    long_id = "a" * 10_000
    resp = await client.get(f"/api/v1/agents/{long_id}/coverage")
    assert resp.status_code in (404, 400, 422)


# ---------------------------------------------------------------------------
# env parameter — injection attempts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_env_sql_metacharacters(client: AsyncClient) -> None:
    """SQL metacharacters in env filter don't cause injection."""
    resp = await client.get(
        "/api/v1/agents/fleet-coverage",
        params={"env": "production'; DROP TABLE events; --"},
    )
    # Empty result (no events match this env), not a crash
    assert resp.status_code == 200
    assert resp.json()["fleet_summary"]["total_agents"] == 0


@pytest.mark.asyncio
async def test_env_null_byte(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Null byte in env doesn't bypass filtering."""
    # Seed a real event
    db_session.add(Event(
        tenant_id=TENANT_A_ID, call_id="env-null-test", agent_id="agent-env-test",
        tool_name="exec", verdict="allow", mode="enforce", env="production",
        timestamp=datetime.now(UTC),
    ))
    await db_session.commit()

    # Null byte env should not match "production"
    resp = await client.get(
        "/api/v1/agents/fleet-coverage",
        params={"env": "production\x00"},
    )
    assert resp.status_code == 200
    assert resp.json()["fleet_summary"]["total_agents"] == 0


@pytest.mark.asyncio
async def test_env_wildcard_glob(client: AsyncClient) -> None:
    """Wildcard/glob in env doesn't expand to match all envs."""
    resp = await client.get(
        "/api/v1/agents/fleet-coverage",
        params={"env": "*"},
    )
    assert resp.status_code == 200
    # "*" is treated as a literal string, not a glob
    assert resp.json()["fleet_summary"]["total_agents"] == 0
