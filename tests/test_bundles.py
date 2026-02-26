"""Tests for bundle upload, retrieval, and deployment."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Deployment
from tests.conftest import TENANT_A_ID

SAMPLE_YAML = "rules:\n  - name: test\n    tool: shell\n    verdict: deny\n"

_T0 = datetime(2026, 1, 1)


async def test_upload_bundle(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": SAMPLE_YAML},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["version"] == 1
    assert data["revision_hash"]
    assert data["uploaded_by"] == "user_test_123"


async def test_get_bundle_by_version(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    resp = await client.get("/api/v1/bundles/1")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1


async def test_get_bundle_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles/999")
    assert resp.status_code == 404


async def test_upload_increments_version(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": "rules:\n  - name: v2\n"},
    )
    assert resp.status_code == 201
    assert resp.json()["version"] == 2


async def test_upload_invalid_yaml(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": "invalid: yaml: ["},
    )
    assert resp.status_code == 422


# --- GET /api/v1/bundles/{version}/yaml ---


async def test_get_yaml_content(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    resp = await client.get("/api/v1/bundles/1/yaml")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-yaml"
    assert resp.content == SAMPLE_YAML.encode("utf-8")


async def test_get_yaml_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles/999/yaml")
    assert resp.status_code == 404


# --- List bundles ---


async def test_list_bundles_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_bundles_ordered_desc(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})
    await client.post(
        "/api/v1/bundles",
        json={"yaml_content": "rules:\n  - name: v2\n"},
    )

    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["version"] == 2
    assert data[1]["version"] == 1


async def test_list_bundles_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json() == []


# --- deployed_envs enrichment ---


async def _upload_and_get_version(client: AsyncClient, yaml: str) -> int:
    resp = await client.post("/api/v1/bundles", json={"yaml_content": yaml})
    assert resp.status_code == 201
    return resp.json()["version"]


async def _deploy_via_db(
    db: AsyncSession, version: int, env: str, at: datetime,
) -> None:
    db.add(Deployment(
        tenant_id=TENANT_A_ID,
        env=env,
        bundle_version=version,
        deployed_by="test",
        created_at=at,
    ))
    await db.commit()


async def test_list_bundles_deployed_envs(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    v1 = await _upload_and_get_version(client, SAMPLE_YAML)
    v2 = await _upload_and_get_version(
        client, "rules:\n  - name: v2\n",
    )

    t = _T0
    await _deploy_via_db(db_session, v1, "production", at=t)
    await _deploy_via_db(db_session, v2, "staging", at=t + timedelta(seconds=1))

    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    data = {b["version"]: b for b in resp.json()}

    assert data[v1]["deployed_envs"] == ["production"]
    assert data[v2]["deployed_envs"] == ["staging"]


async def test_list_bundles_redeploy_moves_env(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    v1 = await _upload_and_get_version(client, SAMPLE_YAML)
    v2 = await _upload_and_get_version(
        client, "rules:\n  - name: v2\n",
    )

    t = _T0
    await _deploy_via_db(db_session, v1, "production", at=t)
    await _deploy_via_db(db_session, v2, "staging", at=t + timedelta(seconds=1))
    await _deploy_via_db(
        db_session, v2, "production", at=t + timedelta(seconds=2),
    )

    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    data = {b["version"]: b for b in resp.json()}

    assert data[v1]["deployed_envs"] == []
    assert sorted(data[v2]["deployed_envs"]) == ["production", "staging"]


async def test_list_bundles_undeployed_has_empty_envs(
    client: AsyncClient,
) -> None:
    await _upload_and_get_version(client, SAMPLE_YAML)

    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json()[0]["deployed_envs"] == []
