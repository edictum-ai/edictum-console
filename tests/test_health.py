"""Tests for the health endpoint."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_returns_metadata(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["auth_provider"] == "local"
    assert "bootstrap_complete" in data


async def test_health_bootstrap_false_when_no_users(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/health")
    data = resp.json()
    assert data["bootstrap_complete"] is False


async def test_health_returns_version_string(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/health")
    data = resp.json()
    assert isinstance(data["version"], str)
    assert data["version"] == "0.1.0"
