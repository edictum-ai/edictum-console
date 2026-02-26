"""Tests for session-state endpoints backed by Redis.

SDK contract: /api/v1/sessions/{key} — flat key, no session_id nesting.
"""

from __future__ import annotations

from httpx import AsyncClient


async def test_set_and_get_value(client: AsyncClient) -> None:
    await client.put(
        "/api/v1/sessions/counter",
        json={"value": "42"},
    )
    resp = await client.get("/api/v1/sessions/counter")
    assert resp.status_code == 200
    assert resp.json()["value"] == "42"


async def test_get_nonexistent_key(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/sessions/missing")
    assert resp.status_code == 404


async def test_increment(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/sessions/hits/increment",
        json={"amount": 5},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == 5.0

    resp = await client.post(
        "/api/v1/sessions/hits/increment",
        json={"amount": 3},
    )
    assert resp.json()["value"] == 8.0


async def test_delete_key(client: AsyncClient) -> None:
    await client.put(
        "/api/v1/sessions/temp",
        json={"value": "delete-me"},
    )
    resp = await client.delete("/api/v1/sessions/temp")
    assert resp.status_code == 200

    resp = await client.get("/api/v1/sessions/temp")
    assert resp.status_code == 404


async def test_increment_default_amount(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/sessions/counter/increment",
        json={},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == 1.0
