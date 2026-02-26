"""Tests for the event-ingestion endpoint."""

from __future__ import annotations

from httpx import AsyncClient


def _make_event(call_id: str = "call-1") -> dict:
    return {
        "call_id": call_id,
        "agent_id": "agent-1",
        "tool_name": "shell",
        "verdict": "deny",
        "mode": "enforce",
        "timestamp": "2026-02-18T12:00:00Z",
        "payload": {"reason": "blocked"},
    }


async def test_ingest_single_event(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/events",
        json={"events": [_make_event()]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["accepted"] == 1
    assert data["duplicates"] == 0


async def test_ingest_batch(client: AsyncClient) -> None:
    events = [_make_event(f"call-{i}") for i in range(5)]
    resp = await client.post("/api/v1/events", json={"events": events})
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 5


async def test_query_events(client: AsyncClient) -> None:
    await client.post("/api/v1/events", json={"events": [_make_event("q-1")]})
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["call_id"] == "q-1"


async def test_query_events_filter_agent(client: AsyncClient) -> None:
    e1 = _make_event("f-1")
    e1["agent_id"] = "agent-alpha"
    e2 = _make_event("f-2")
    e2["agent_id"] = "agent-beta"
    await client.post("/api/v1/events", json={"events": [e1, e2]})

    resp = await client.get("/api/v1/events", params={"agent_id": "agent-alpha"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["agent_id"] == "agent-alpha"


async def test_query_events_filter_verdict(client: AsyncClient) -> None:
    e1 = _make_event("v-1")
    e1["verdict"] = "allow"
    e2 = _make_event("v-2")
    e2["verdict"] = "deny"
    await client.post("/api/v1/events", json={"events": [e1, e2]})

    resp = await client.get("/api/v1/events", params={"verdict": "allow"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["verdict"] == "allow"


async def test_query_events_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_dedup_ignores_duplicate_events(client: AsyncClient) -> None:
    event = _make_event("dup-1")
    await client.post("/api/v1/events", json={"events": [event]})
    resp = await client.post("/api/v1/events", json={"events": [event]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["duplicates"] == 1
    assert data["accepted"] == 0
