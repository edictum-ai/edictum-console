"""Tests for enriched health endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio


async def test_health_returns_enriched_fields(client: AsyncClient) -> None:
    """Health endpoint returns database, redis, and connected_agents."""
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] in ("ok", "degraded")
    assert "database" in data
    assert data["database"]["connected"] is True
    assert isinstance(data["database"]["latency_ms"], (int, float))

    assert "redis" in data
    assert data["redis"]["connected"] is True
    assert isinstance(data["redis"]["latency_ms"], (int, float))

    assert "connected_agents" in data
    assert isinstance(data["connected_agents"], int)
    assert data["connected_agents"] == 0
