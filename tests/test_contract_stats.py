"""Tests for GET /api/v1/stats/contracts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from tests.conftest import TENANT_A_ID


def _make_event(
    *,
    decision_name: str = "no_shell",
    verdict: str = "allowed",
    ts: datetime | None = None,
) -> Event:
    """Helper to create an Event with a decision_name in the payload."""
    return Event(
        tenant_id=TENANT_A_ID,
        call_id=str(uuid.uuid4()),
        agent_id="agent-1",
        tool_name="shell",
        verdict=verdict,
        mode="enforce",
        timestamp=ts or datetime.now(UTC),
        payload={"decision_name": decision_name},
    )


async def test_contract_stats_empty(client: AsyncClient) -> None:
    """No events → empty coverage, total_events=0."""
    resp = await client.get("/api/v1/stats/contracts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["coverage"] == []
    assert data["total_events"] == 0


async def test_contract_stats_with_events(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Seed events and verify aggregation counts."""
    now = datetime.now(UTC)
    events = [
        _make_event(decision_name="no_shell", verdict="allowed", ts=now - timedelta(hours=1)),
        _make_event(decision_name="no_shell", verdict="denied", ts=now - timedelta(hours=2)),
        _make_event(decision_name="no_shell", verdict="call_would_deny", ts=now - timedelta(hours=3)),
        _make_event(decision_name="rate_limit", verdict="allowed", ts=now - timedelta(hours=1)),
        _make_event(decision_name="rate_limit", verdict="denied", ts=now - timedelta(hours=2)),
    ]
    db_session.add_all(events)
    await db_session.commit()

    resp = await client.get("/api/v1/stats/contracts")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_events"] == 5
    coverage_map = {c["decision_name"]: c for c in data["coverage"]}

    assert "no_shell" in coverage_map
    ns = coverage_map["no_shell"]
    assert ns["total_evaluations"] == 3
    assert ns["total_denials"] == 1
    assert ns["total_warnings"] == 1

    assert "rate_limit" in coverage_map
    rl = coverage_map["rate_limit"]
    assert rl["total_evaluations"] == 2
    assert rl["total_denials"] == 1
    assert rl["total_warnings"] == 0


async def test_contract_stats_time_filter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Events outside the time window are excluded."""
    now = datetime.now(UTC)
    inside = _make_event(decision_name="no_shell", verdict="allowed", ts=now - timedelta(hours=1))
    outside = _make_event(decision_name="no_shell", verdict="denied", ts=now - timedelta(hours=48))
    db_session.add_all([inside, outside])
    await db_session.commit()

    # Default window is 24h, so the 48h-old event should be excluded
    resp = await client.get("/api/v1/stats/contracts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_events"] == 1
    assert len(data["coverage"]) == 1
    assert data["coverage"][0]["total_evaluations"] == 1
    assert data["coverage"][0]["total_denials"] == 0
