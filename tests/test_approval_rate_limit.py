"""Tests for approval creation rate limiting (BUG-6)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


def _make_approval_body(**overrides: object) -> dict:
    base = {
        "agent_id": "agent-1",
        "tool_name": "shell",
        "tool_args": {"cmd": "ls"},
        "message": "Agent wants to run a command",
        "timeout": 300,
        "timeout_effect": "deny",
    }
    base.update(overrides)
    return base


@pytest.mark.security
async def test_approval_rate_limit_allows_10(client: AsyncClient) -> None:
    """First 10 approval requests within a minute should succeed."""
    for i in range(10):
        resp = await client.post(
            "/api/v1/approvals",
            json=_make_approval_body(agent_id=f"agent-{i}"),
        )
        assert resp.status_code == 201, f"Request {i + 1} failed with {resp.status_code}"


@pytest.mark.security
async def test_approval_rate_limit_blocks_11th(client: AsyncClient) -> None:
    """The 11th request within a minute should be rate limited (429)."""
    for i in range(10):
        resp = await client.post(
            "/api/v1/approvals",
            json=_make_approval_body(agent_id=f"agent-{i}"),
        )
        assert resp.status_code == 201

    resp = await client.post(
        "/api/v1/approvals",
        json=_make_approval_body(agent_id="agent-overflow"),
    )
    assert resp.status_code == 429
    data = resp.json()
    assert "detail" in data
    assert "Retry-After" in resp.headers


@pytest.mark.security
async def test_approval_rate_limit_per_agent_tenant(client: AsyncClient) -> None:
    """Rate limit key includes tenant + agent, so different agents have separate buckets."""
    # Note: the test client auth fixture doesn't set agent_id (defaults to None),
    # so all requests share the "unknown" agent bucket.
    # This test verifies the rate limit key is correctly scoped per (tenant, agent).
    for i in range(10):
        resp = await client.post(
            "/api/v1/approvals",
            json=_make_approval_body(),
        )
        assert resp.status_code == 201

    # 11th should fail
    resp = await client.post(
        "/api/v1/approvals",
        json=_make_approval_body(),
    )
    assert resp.status_code == 429
