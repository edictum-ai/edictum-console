"""Integration tests for coverage endpoints using client fixture."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment, Event
from tests.conftest import TENANT_A_ID

SAMPLE_YAML = b"""\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: devops-agent

contracts:
  - name: block-dangerous-exec
    type: pre
    tools: [exec, shell_run]
    mode: enforce

  - name: observe-file-ops
    type: post
    tools: ["file_*"]
    mode: observe
"""


async def _seed_events(
    db: AsyncSession, agent_id: str = "agent-1", env: str = "production"
) -> None:
    """Seed events for tools: exec (5 events), file_read (3), web_scrape (2)."""
    now = datetime.now(UTC)
    events = [
        Event(
            tenant_id=TENANT_A_ID, call_id=f"{agent_id}-exec-{i}", agent_id=agent_id,
            tool_name="exec", verdict="deny", mode="enforce", env=env,
            timestamp=now - timedelta(hours=i),
        )
        for i in range(5)
    ] + [
        Event(
            tenant_id=TENANT_A_ID, call_id=f"{agent_id}-file_read-{i}", agent_id=agent_id,
            tool_name="file_read", verdict="allow", mode="enforce", env=env,
            timestamp=now - timedelta(hours=i),
        )
        for i in range(3)
    ] + [
        Event(
            tenant_id=TENANT_A_ID, call_id=f"{agent_id}-web_scrape-{i}", agent_id=agent_id,
            tool_name="web_scrape", verdict="allow", mode="enforce", env=env,
            timestamp=now - timedelta(hours=i),
        )
        for i in range(2)
    ]
    db.add_all(events)
    await db.flush()


async def _seed_bundle_and_deploy(
    db: AsyncSession, env: str = "production"
) -> None:
    """Create bundle + deploy to env."""
    bundle = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=1,
        yaml_bytes=SAMPLE_YAML,
        revision_hash=hashlib.sha256(SAMPLE_YAML).hexdigest(),
        uploaded_by="test",
    )
    db.add(bundle)
    await db.flush()
    db.add(Deployment(
        tenant_id=TENANT_A_ID,
        env=env,
        bundle_name="devops-agent",
        bundle_version=1,
        deployed_by="test",
    ))
    await db.flush()


@pytest.mark.asyncio
async def test_agent_coverage_happy_path(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Agent with mix of governed and ungoverned tools returns correct coverage."""
    await _seed_events(db_session)
    await _seed_bundle_and_deploy(db_session)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-1/coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_id"] == "agent-1"
    assert data["environment"] == "production"
    assert data["summary"]["total_tools"] == 3
    # exec matches block-dangerous-exec (enforce)
    assert data["summary"]["enforced"] == 1
    # file_read matches observe-file-ops (glob file_*)
    assert data["summary"]["observed"] == 1
    # web_scrape matches nothing
    assert data["summary"]["ungoverned"] == 1
    # coverage_pct = enforced_only: 1/3 = 33
    assert data["summary"]["coverage_pct"] == 33


@pytest.mark.asyncio
async def test_agent_coverage_no_events_404(client: AsyncClient) -> None:
    """Agent with no events returns 404."""
    resp = await client.get("/api/v1/agents/nonexistent/coverage")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agent_coverage_no_contracts_all_ungoverned(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Agent with events but no deployed contracts -> all tools ungoverned."""
    await _seed_events(db_session)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-1/coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["ungoverned"] == 3
    assert data["summary"]["enforced"] == 0
    assert data["summary"]["coverage_pct"] == 0


@pytest.mark.asyncio
async def test_agent_coverage_wildcard_100_percent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Wildcard contract in enforce mode -> 100% coverage."""
    wildcard_yaml = b"""\
contracts:
  - name: catch-all
    type: session
    tools: ["*"]
    mode: enforce
"""
    bundle = Bundle(
        tenant_id=TENANT_A_ID, name="wildcard-bundle", version=1,
        yaml_bytes=wildcard_yaml,
        revision_hash=hashlib.sha256(wildcard_yaml).hexdigest(),
        uploaded_by="test",
    )
    db_session.add(bundle)
    await db_session.flush()
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="wildcard-bundle", bundle_version=1, deployed_by="test",
    ))
    await _seed_events(db_session)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-1/coverage")
    assert resp.status_code == 200
    assert resp.json()["summary"]["coverage_pct"] == 100
    assert resp.json()["summary"]["enforced"] == 3


@pytest.mark.asyncio
async def test_agent_coverage_time_window(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Time window filters events. 1h window shows fewer tools than 24h."""
    now = datetime.now(UTC)
    db_session.add_all([
        Event(
            tenant_id=TENANT_A_ID, call_id="recent-1", agent_id="agent-1",
            tool_name="exec", verdict="deny", mode="enforce", env="production",
            timestamp=now - timedelta(minutes=30),
        ),
        Event(
            tenant_id=TENANT_A_ID, call_id="old-1", agent_id="agent-1",
            tool_name="web_scrape", verdict="allow", mode="enforce", env="production",
            timestamp=now - timedelta(hours=5),
        ),
    ])
    await db_session.commit()

    # 1h window — only exec
    resp = await client.get("/api/v1/agents/agent-1/coverage?since=1h")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 1

    # 24h window — both tools
    resp = await client.get("/api/v1/agents/agent-1/coverage?since=24h")
    assert resp.status_code == 200
    assert resp.json()["summary"]["total_tools"] == 2


@pytest.mark.asyncio
async def test_agent_coverage_include_verdicts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """include_verdicts=true adds deny_count, allow_count, observe_count."""
    await _seed_events(db_session)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-1/coverage?include_verdicts=true")
    assert resp.status_code == 200
    tools = resp.json()["tools"]
    # exec has verdict="deny" for all 5 events
    exec_tool = next(t for t in tools if t["tool_name"] == "exec")
    assert exec_tool["deny_count"] == 5
    assert exec_tool["allow_count"] == 0


@pytest.mark.asyncio
async def test_fleet_coverage_happy_path(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Fleet coverage returns all agents with summaries."""
    await _seed_events(db_session, agent_id="agent-1")
    await _seed_events(db_session, agent_id="agent-2")
    await _seed_bundle_and_deploy(db_session)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["fleet_summary"]["total_agents"] == 2
    assert len(data["agents"]) == 2


@pytest.mark.asyncio
async def test_fleet_coverage_env_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Fleet coverage with env filter returns only agents in that env."""
    await _seed_events(db_session, agent_id="prod-agent", env="production")
    await _seed_events(db_session, agent_id="staging-agent", env="staging")
    await db_session.commit()

    resp = await client.get("/api/v1/agents/fleet-coverage?env=production")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1
    assert agents[0]["agent_id"] == "prod-agent"


@pytest.mark.asyncio
async def test_fleet_coverage_ungoverned_sorted_by_agent_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Ungoverned tools list sorted by agent_count descending."""
    await _seed_events(db_session, agent_id="agent-1")
    await _seed_events(db_session, agent_id="agent-2")
    await db_session.commit()  # No contracts -> all ungoverned

    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    ungoverned = resp.json()["fleet_summary"]["ungoverned_tools"]
    # Each tool used by 2 agents, so all have agent_count=2
    for tool in ungoverned:
        assert tool["agent_count"] == 2


@pytest.mark.asyncio
async def test_fleet_coverage_empty(client: AsyncClient) -> None:
    """Fleet coverage with no events returns empty response."""
    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["fleet_summary"]["total_agents"] == 0
    assert data["agents"] == []


@pytest.mark.asyncio
async def test_fleet_coverage_route_not_captured_as_agent_id(
    client: AsyncClient,
) -> None:
    """Ensure 'fleet-coverage' isn't captured as an agent_id parameter."""
    resp = await client.get("/api/v1/agents/fleet-coverage")
    assert resp.status_code == 200
    # If it were captured as agent_id, it would 404 (no events for "fleet-coverage")
    assert "fleet_summary" in resp.json()


@pytest.mark.asyncio
async def test_agent_coverage_invalid_since(client: AsyncClient) -> None:
    """Invalid since value returns 400."""
    resp = await client.get("/api/v1/agents/agent-1/coverage?since=yesterday")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_fleet_env_filter_uses_correct_contracts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Fleet env filter matches tools against the filtered env's contracts.

    Regression: if an agent has events in both production and staging, and
    their most recent event is staging, filtering fleet by env=production
    must still match against production's deployed contracts, not staging's.
    """
    import hashlib

    now = datetime.now(UTC)
    # Agent has recent staging event and older production events
    db_session.add_all([
        Event(
            tenant_id=TENANT_A_ID, call_id="multi-env-staging",
            agent_id="multi-env-agent", tool_name="exec", verdict="deny",
            mode="enforce", env="staging",
            timestamp=now - timedelta(minutes=5),  # most recent
        ),
        Event(
            tenant_id=TENANT_A_ID, call_id="multi-env-prod",
            agent_id="multi-env-agent", tool_name="exec", verdict="deny",
            mode="enforce", env="production",
            timestamp=now - timedelta(hours=1),  # older
        ),
    ])

    # Deploy contract to production that covers "exec"
    prod_yaml = b"""\
contracts:
  - name: block-exec
    type: pre
    tools: [exec]
    mode: enforce
"""
    bundle = Bundle(
        tenant_id=TENANT_A_ID, name="prod-bundle", version=1,
        yaml_bytes=prod_yaml,
        revision_hash=hashlib.sha256(prod_yaml).hexdigest(),
        uploaded_by="test",
    )
    db_session.add(bundle)
    await db_session.flush()
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="prod-bundle", bundle_version=1, deployed_by="test",
    ))
    # No deployment to staging — so staging has no contracts
    await db_session.commit()

    # Filter by production — should match against production's contracts
    resp = await client.get("/api/v1/agents/fleet-coverage?env=production")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1
    agent = agents[0]
    assert agent["agent_id"] == "multi-env-agent"
    assert agent["environment"] == "production"
    # exec IS covered in production (block-exec contract deployed there)
    assert agent["enforced"] == 1
    assert agent["ungoverned"] == 0
