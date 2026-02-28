"""Tests for the agent fleet status endpoint."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from httpx import AsyncClient

from edictum_server.push.manager import PushManager
from tests.conftest import TENANT_A_ID, TENANT_B_ID


@pytest.mark.asyncio
async def test_agent_status_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/agents/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agents"] == []


@pytest.mark.asyncio
async def test_agent_status_returns_connected_agents(
    client: AsyncClient, push_manager: PushManager
) -> None:
    push_manager.subscribe(
        "production",
        tenant_id=TENANT_A_ID,
        agent_id="agent-1",
        bundle_name="devops-agent",
        policy_version="abc123",
    )

    resp = await client.get("/api/v1/agents/status")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["agents"]) == 1
    agent = data["agents"][0]
    assert agent["agent_id"] == "agent-1"
    assert agent["env"] == "production"
    assert agent["bundle_name"] == "devops-agent"
    assert agent["policy_version"] == "abc123"
    assert agent["status"] == "unknown"  # no deployment exists
    assert "connected_at" in agent


@pytest.mark.asyncio
async def test_agent_status_tenant_isolation(
    client: AsyncClient,
    push_manager: PushManager,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    # Add agents for both tenants
    push_manager.subscribe(
        "production", tenant_id=TENANT_A_ID, agent_id="agent-a"
    )
    push_manager.subscribe(
        "production", tenant_id=TENANT_B_ID, agent_id="agent-b"
    )

    # Tenant A sees only their agent
    resp = await client.get("/api/v1/agents/status")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1
    assert agents[0]["agent_id"] == "agent-a"

    # Switch to tenant B
    set_auth_tenant_b()
    resp = await client.get("/api/v1/agents/status")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1
    assert agents[0]["agent_id"] == "agent-b"


@pytest.mark.asyncio
async def test_agent_status_bundle_filter(
    client: AsyncClient, push_manager: PushManager
) -> None:
    push_manager.subscribe(
        "production",
        tenant_id=TENANT_A_ID,
        agent_id="a1",
        bundle_name="devops-agent",
    )
    push_manager.subscribe(
        "production",
        tenant_id=TENANT_A_ID,
        agent_id="a2",
        bundle_name="research-agent",
    )

    resp = await client.get("/api/v1/agents/status?bundle_name=devops-agent")
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1
    assert agents[0]["agent_id"] == "a1"
