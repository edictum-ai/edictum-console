"""Tests for API key management endpoints."""

from __future__ import annotations

from httpx import AsyncClient


async def test_create_key(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/keys",
        json={"env": "production", "label": "CI key"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"].startswith("edk_production_")
    assert data["prefix"]
    assert data["env"] == "production"
    assert data["label"] == "CI key"


async def test_list_keys(client: AsyncClient) -> None:
    await client.post("/api/v1/keys", json={"env": "production"})
    await client.post("/api/v1/keys", json={"env": "staging"})

    resp = await client.get("/api/v1/keys")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_revoke_key(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/keys", json={"env": "production"})
    key_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/keys/{key_id}")
    assert resp.status_code == 204

    # Should no longer appear in list
    list_resp = await client.get("/api/v1/keys")
    assert len(list_resp.json()) == 0


async def test_list_after_revoke_empty(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/keys", json={"env": "production"})
    key_id = create_resp.json()["id"]
    await client.delete(f"/api/v1/keys/{key_id}")

    resp = await client.get("/api/v1/keys")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_key_invalid_env(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/keys",
        json={"env": "invalid"},
    )
    assert resp.status_code == 400


async def test_revoke_nonexistent_key(client: AsyncClient) -> None:
    import uuid
    fake_id = str(uuid.uuid4())
    resp = await client.delete(f"/api/v1/keys/{fake_id}")
    assert resp.status_code == 404
