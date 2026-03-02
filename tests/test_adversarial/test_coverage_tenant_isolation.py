"""Adversarial tenant isolation tests for coverage endpoints.

Every test proves coverage data doesn't leak across tenants.
Risk if bypassed: Cross-tenant data leak. SHIP-BLOCKER.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment, Event
from tests.conftest import TENANT_A_ID, TENANT_B_ID

pytestmark = pytest.mark.security


async def _seed_agent_events(
    db: AsyncSession,
    tenant_id: object,
    agent_id: str,
    env: str = "production",
) -> None:
    """Seed events for a specific tenant's agent."""
    now = datetime.now(UTC)
    db.add_all([
        Event(
            tenant_id=tenant_id, call_id=f"{tenant_id}-{agent_id}-{i}",
            agent_id=agent_id, tool_name="exec", verdict="deny", mode="enforce",
            env=env, timestamp=now - timedelta(hours=i),
        )
        for i in range(3)
    ])
    await db.flush()


@pytest.mark.asyncio
async def test_coverage_scoped_to_tenant(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Agent exists in both tenants. Coverage is scoped to each tenant."""
    await _seed_agent_events(db_session, TENANT_A_ID, "shared-agent")
    await _seed_agent_events(db_session, TENANT_B_ID, "shared-agent")
    await db_session.commit()

    # Tenant A sees their agent's coverage
    resp = await client.get("/api/v1/agents/shared-agent/coverage")
    assert resp.status_code == 200
    assert resp.json()["agent_id"] == "shared-agent"
    # Only tenant A's events (just "exec" as one distinct tool)
    assert resp.json()["summary"]["total_tools"] == 1

    # Switch to tenant B — independent coverage
    set_auth_tenant_b()
    resp = await client.get("/api/v1/agents/shared-agent/coverage")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 1

    # Switch back to tenant A — still consistent
    set_auth_tenant_a()
    resp = await client.get("/api/v1/agents/shared-agent/coverage")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 1


@pytest.mark.asyncio
async def test_coverage_tenant_a_cannot_see_tenant_b_only_agent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent only in tenant B -> 404 for tenant A."""
    await _seed_agent_events(db_session, TENANT_B_ID, "b-only-agent")
    await db_session.commit()

    resp = await client.get("/api/v1/agents/b-only-agent/coverage")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_fleet_coverage_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Fleet coverage doesn't leak agents across tenants."""
    await _seed_agent_events(db_session, TENANT_A_ID, "agent-a")
    await _seed_agent_events(db_session, TENANT_B_ID, "agent-b")
    await db_session.commit()

    # Tenant A fleet
    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    agent_ids = [a["agent_id"] for a in resp.json()["agents"]]
    assert "agent-a" in agent_ids
    assert "agent-b" not in agent_ids

    # Tenant B fleet
    set_auth_tenant_b()
    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    agent_ids = [a["agent_id"] for a in resp.json()["agents"]]
    assert "agent-b" in agent_ids
    assert "agent-a" not in agent_ids


@pytest.mark.asyncio
async def test_agent_id_reuse_independent_coverage(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Same agent_id across tenants produces independent coverage results."""
    now = datetime.now(UTC)
    # Tenant A: agent "bot" uses exec + web_scrape
    db_session.add_all([
        Event(
            tenant_id=TENANT_A_ID, call_id="a-bot-1", agent_id="bot",
            tool_name="exec", verdict="deny", mode="enforce", env="production",
            timestamp=now,
        ),
        Event(
            tenant_id=TENANT_A_ID, call_id="a-bot-2", agent_id="bot",
            tool_name="web_scrape", verdict="allow", mode="enforce", env="production",
            timestamp=now,
        ),
    ])
    # Tenant B: agent "bot" uses only sql_query
    db_session.add_all([
        Event(
            tenant_id=TENANT_B_ID, call_id="b-bot-1", agent_id="bot",
            tool_name="sql_query", verdict="allow", mode="enforce", env="staging",
            timestamp=now,
        ),
    ])
    await db_session.commit()

    # Tenant A: 2 tools
    resp = await client.get("/api/v1/agents/bot/coverage")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 2

    # Tenant B: 1 tool
    set_auth_tenant_b()
    resp = await client.get("/api/v1/agents/bot/coverage")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 1
    tool_names = [t["tool_name"] for t in resp.json()["tools"]]
    assert "sql_query" in tool_names
    assert "exec" not in tool_names


@pytest.mark.asyncio
async def test_fleet_ungoverned_tools_not_mixed(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Ungoverned tools in fleet summary only show agents from the requesting tenant."""
    now = datetime.now(UTC)
    # Tenant A agent uses "exec"
    db_session.add(Event(
        tenant_id=TENANT_A_ID, call_id="a-1", agent_id="agent-a",
        tool_name="exec", verdict="deny", mode="enforce", env="production",
        timestamp=now,
    ))
    # Tenant B agent also uses "exec"
    db_session.add(Event(
        tenant_id=TENANT_B_ID, call_id="b-1", agent_id="agent-b",
        tool_name="exec", verdict="deny", mode="enforce", env="production",
        timestamp=now,
    ))
    await db_session.commit()

    # Tenant A fleet — ungoverned "exec" should only list agent-a
    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    ungoverned = resp.json()["fleet_summary"]["ungoverned_tools"]
    exec_tool = next((u for u in ungoverned if u["tool_name"] == "exec"), None)
    assert exec_tool is not None
    assert exec_tool["agent_count"] == 1
    assert "agent-a" in exec_tool["agent_ids"]
    assert "agent-b" not in exec_tool["agent_ids"]


# ---------------------------------------------------------------------------
# History endpoint tenant isolation
# ---------------------------------------------------------------------------

HASH_A = "aaaaaaaa" * 8
HASH_B = "bbbbbbbb" * 8
SHARED_AGENT = "shared-history-agent"


async def _seed_history_both_tenants(db: AsyncSession) -> None:
    """Create history data for the same agent name in both tenants."""
    now = datetime.now(UTC)

    # Tenant A: bundle + deployment + event
    ba = Bundle(
        tenant_id=TENANT_A_ID, name="team-bundle", version=1,
        revision_hash=HASH_A, yaml_bytes=b"contracts: []",
        uploaded_by="admin-a@test.com",
    )
    db.add(ba)
    await db.flush()

    da = Deployment(
        tenant_id=TENANT_A_ID, env="production", bundle_name="team-bundle",
        bundle_version=1, deployed_by="admin-a@test.com",
    )
    db.add(da)
    await db.flush()

    db.add(Event(
        tenant_id=TENANT_A_ID, call_id="call-a-hist-1", agent_id=SHARED_AGENT,
        tool_name="exec", verdict="allow", mode="enforce", env="production",
        timestamp=now - timedelta(days=2),
        payload={"policy_version": HASH_A},
    ))

    # Tenant B: different bundle + deployment + event for same agent name
    bb = Bundle(
        tenant_id=TENANT_B_ID, name="team-bundle", version=1,
        revision_hash=HASH_B, yaml_bytes=b"contracts: []",
        uploaded_by="admin-b@test.com",
    )
    db.add(bb)
    await db.flush()

    db_dep = Deployment(
        tenant_id=TENANT_B_ID, env="production", bundle_name="team-bundle",
        bundle_version=1, deployed_by="admin-b@test.com",
    )
    db.add(db_dep)
    await db.flush()

    db.add(Event(
        tenant_id=TENANT_B_ID, call_id="call-b-hist-1", agent_id=SHARED_AGENT,
        tool_name="exec", verdict="deny", mode="enforce", env="production",
        timestamp=now - timedelta(days=1),
        payload={"policy_version": HASH_B},
    ))
    await db.commit()


@pytest.mark.asyncio
async def test_history_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """History for same agent name returns only the requesting tenant's data."""
    await _seed_history_both_tenants(db_session)

    # As tenant A — should see tenant A's deployment hash only
    resp_a = await client.get(f"/api/v1/agents/{SHARED_AGENT}/history")
    assert resp_a.status_code == 200
    data_a = resp_a.json()

    for event in data_a["events"]:
        if event["type"] == "deployment":
            assert event["revision_hash"] == HASH_A
            assert event["deployed_by"] == "admin-a@test.com"
        # Must not contain tenant B's hash anywhere
        assert event.get("revision_hash") != HASH_B
        assert event.get("policy_version") != HASH_B
        assert event.get("expected_version") != HASH_B

    # Switch to tenant B
    set_auth_tenant_b()
    resp_b = await client.get(f"/api/v1/agents/{SHARED_AGENT}/history")
    assert resp_b.status_code == 200
    data_b = resp_b.json()

    for event in data_b["events"]:
        if event["type"] == "deployment":
            assert event["revision_hash"] == HASH_B
            assert event["deployed_by"] == "admin-b@test.com"
        # Must not contain tenant A's hash
        assert event.get("revision_hash") != HASH_A
        assert event.get("policy_version") != HASH_A
        assert event.get("expected_version") != HASH_A


@pytest.mark.asyncio
async def test_history_cross_tenant_agent_id(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Agent existing only in tenant A returns 404 when queried by tenant B."""
    now = datetime.now(UTC)

    db_session.add(Event(
        tenant_id=TENANT_A_ID, call_id="call-only-a", agent_id="tenant-a-only",
        tool_name="exec", verdict="allow", mode="enforce", env="production",
        timestamp=now - timedelta(hours=1),
        payload={"policy_version": "somehash"},
    ))
    await db_session.commit()

    # Tenant A can see it
    resp_a = await client.get("/api/v1/agents/tenant-a-only/history")
    assert resp_a.status_code == 200

    # Tenant B gets 404
    set_auth_tenant_b()
    resp_b = await client.get("/api/v1/agents/tenant-a-only/history")
    assert resp_b.status_code == 404
