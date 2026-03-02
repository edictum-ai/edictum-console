"""Tests for bundle upload, retrieval, and deployment."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.config import Settings, get_settings
from edictum_server.db.models import Deployment, SigningKey
from edictum_server.services.signing_service import generate_signing_keypair
from tests.conftest import TENANT_A_ID

# Must match EDICTUM_SIGNING_KEY_SECRET from .env (used by get_settings())
_TEST_SIGNING_SECRET = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"

SAMPLE_YAML_A = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: devops-agent

contracts:
  - id: test
    type: pre
    tool: shell
    then:
      effect: deny
"""

SAMPLE_YAML_B = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: research-agent

contracts:
  - id: test
    type: pre
    tool: search
    then:
      effect: deny
"""

_T0 = datetime(2026, 1, 1)


async def _seed_signing_key(db: AsyncSession) -> None:
    """Create an active signing key for the test tenant."""
    secret = bytes.fromhex(_TEST_SIGNING_SECRET)
    public_key, private_key_encrypted = generate_signing_keypair(secret)
    db.add(
        SigningKey(
            tenant_id=TENANT_A_ID,
            public_key=public_key,
            private_key_encrypted=private_key_encrypted,
            active=True,
        )
    )
    await db.commit()


# --- Upload ---


async def test_upload_extracts_name(client: AsyncClient) -> None:
    """POST returns name + version 1."""
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": SAMPLE_YAML_A},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "devops-agent"
    assert data["version"] == 1
    assert data["revision_hash"]
    assert data["uploaded_by"] == "user_test_123"


async def test_upload_same_name_increments_version(client: AsyncClient) -> None:
    """Same bundle name -> version increments."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    yaml_v2 = SAMPLE_YAML_A.replace("effect: deny", "effect: warn")
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": yaml_v2},
    )
    assert resp.status_code == 201
    assert resp.json()["version"] == 2
    assert resp.json()["name"] == "devops-agent"


async def test_upload_different_name_starts_at_v1(client: AsyncClient) -> None:
    """Different bundle names have independent version lineages."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": SAMPLE_YAML_B},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "research-agent"
    assert resp.json()["version"] == 1  # Independent lineage


async def test_upload_missing_metadata_name(client: AsyncClient) -> None:
    """No metadata.name -> 422."""
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": "rules:\n  - name: test\n"},
    )
    assert resp.status_code == 422
    assert "metadata.name" in resp.json()["detail"]


async def test_upload_invalid_yaml(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": "invalid: yaml: ["},
    )
    assert resp.status_code == 422


# --- GET /api/v1/bundles (summaries) ---


async def test_list_bundles_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_bundles_returns_summaries(client: AsyncClient) -> None:
    """GET /bundles returns distinct bundle names with aggregates."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2  # Two distinct bundles
    names = {b["name"] for b in data}
    assert names == {"devops-agent", "research-agent"}
    devops = next(b for b in data if b["name"] == "devops-agent")
    assert devops["latest_version"] == 2
    assert devops["version_count"] == 2


async def test_list_bundles_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json() == []


# --- GET /api/v1/bundles/{name} (versions) ---


async def test_list_versions_for_bundle(client: AsyncClient) -> None:
    """GET /bundles/{name} returns versions desc."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    yaml_v2 = SAMPLE_YAML_A.replace("effect: deny", "effect: warn")
    await client.post("/api/v1/bundles", json={"yaml_content": yaml_v2})
    # Also upload a different bundle to verify isolation
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    resp = await client.get("/api/v1/bundles/devops-agent")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["version"] == 2  # desc order
    assert data[1]["version"] == 1


async def test_list_versions_unknown_bundle(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles/nonexistent")
    assert resp.status_code == 404


# --- GET /api/v1/bundles/{name}/{version} ---


async def test_get_bundle_by_name_version(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})

    resp = await client.get("/api/v1/bundles/devops-agent/1")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    assert resp.json()["name"] == "devops-agent"


async def test_get_bundle_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles/devops-agent/999")
    assert resp.status_code == 404


# --- GET /api/v1/bundles/{name}/{version}/yaml ---


async def test_get_yaml_by_name_version(client: AsyncClient) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})

    resp = await client.get("/api/v1/bundles/devops-agent/1/yaml")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-yaml"
    assert resp.content == SAMPLE_YAML_A.encode("utf-8")


async def test_get_yaml_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bundles/devops-agent/999/yaml")
    assert resp.status_code == 404


# --- POST /api/v1/bundles/{name}/{version}/deploy ---


async def test_deploy_by_name(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from edictum_server.main import app

    app.dependency_overrides[get_settings] = lambda: Settings(
        signing_key_secret=_TEST_SIGNING_SECRET
    )
    try:
        await _seed_signing_key(db_session)
        await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
        resp = await client.post(
            "/api/v1/bundles/devops-agent/1/deploy",
            json={"env": "production"},
        )
        assert resp.status_code == 201
        assert resp.json()["bundle_name"] == "devops-agent"
        assert resp.json()["bundle_version"] == 1
    finally:
        app.dependency_overrides.pop(get_settings, None)


async def test_deploy_wrong_name_returns_error(client: AsyncClient) -> None:
    """Deploy nonexistent name -> 422."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.post(
        "/api/v1/bundles/research-agent/1/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422


# --- GET /api/v1/bundles/{name}/current ---


async def test_get_current_bundle_by_name(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await _deploy_via_db(db_session, 1, "production", at=_T0, bundle_name="devops-agent")

    resp = await client.get(
        "/api/v1/bundles/devops-agent/current",
        params={"env": "production"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "devops-agent"
    assert resp.json()["version"] == 1


# --- Route ordering: /{name}/current doesn't conflict with /{name}/{version} ---


async def test_current_route_does_not_conflict_with_version_route(
    client: AsyncClient,
) -> None:
    """GET /bundles/devops-agent/current should not match the version route."""
    # No bundles uploaded, so current should 404 (not a validation error from int parsing)
    resp = await client.get(
        "/api/v1/bundles/devops-agent/current",
        params={"env": "production"},
    )
    assert resp.status_code == 404


# --- deployed_envs enrichment ---


async def _upload_and_get_version(client: AsyncClient, yaml: str) -> int:
    resp = await client.post("/api/v1/bundles", json={"yaml_content": yaml})
    assert resp.status_code == 201
    return resp.json()["version"]


async def _deploy_via_db(
    db: AsyncSession,
    version: int,
    env: str,
    at: datetime,
    bundle_name: str = "devops-agent",
) -> None:
    db.add(
        Deployment(
            tenant_id=TENANT_A_ID,
            env=env,
            bundle_name=bundle_name,
            bundle_version=version,
            deployed_by="test",
            created_at=at,
        )
    )
    await db.commit()


async def test_deployed_envs_scoped_by_bundle(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Deployed envs don't leak across bundle names."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    await _deploy_via_db(db_session, 1, "production", at=_T0, bundle_name="devops-agent")
    await _deploy_via_db(db_session, 1, "staging", at=_T0, bundle_name="research-agent")

    resp = await client.get("/api/v1/bundles/devops-agent")
    devops = {b["version"]: b for b in resp.json()}
    assert devops[1]["deployed_envs"] == ["production"]

    resp = await client.get("/api/v1/bundles/research-agent")
    research = {b["version"]: b for b in resp.json()}
    assert research[1]["deployed_envs"] == ["staging"]


async def test_list_versions_deployed_envs(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    v1 = await _upload_and_get_version(client, SAMPLE_YAML_A)
    yaml_v2 = SAMPLE_YAML_A.replace("effect: deny", "effect: warn")
    v2 = await _upload_and_get_version(client, yaml_v2)

    t = _T0
    await _deploy_via_db(db_session, v1, "production", at=t)
    await _deploy_via_db(db_session, v2, "staging", at=t + timedelta(seconds=1))

    resp = await client.get("/api/v1/bundles/devops-agent")
    assert resp.status_code == 200
    data = {b["version"]: b for b in resp.json()}

    assert data[v1]["deployed_envs"] == ["production"]
    assert data[v2]["deployed_envs"] == ["staging"]


async def test_list_versions_redeploy_moves_env(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    v1 = await _upload_and_get_version(client, SAMPLE_YAML_A)
    yaml_v2 = SAMPLE_YAML_A.replace("effect: deny", "effect: warn")
    v2 = await _upload_and_get_version(client, yaml_v2)

    t = _T0
    await _deploy_via_db(db_session, v1, "production", at=t)
    await _deploy_via_db(db_session, v2, "staging", at=t + timedelta(seconds=1))
    await _deploy_via_db(
        db_session,
        v2,
        "production",
        at=t + timedelta(seconds=2),
    )

    resp = await client.get("/api/v1/bundles/devops-agent")
    assert resp.status_code == 200
    data = {b["version"]: b for b in resp.json()}

    assert data[v1]["deployed_envs"] == []
    assert sorted(data[v2]["deployed_envs"]) == ["production", "staging"]


async def test_list_versions_undeployed_has_empty_envs(
    client: AsyncClient,
) -> None:
    await _upload_and_get_version(client, SAMPLE_YAML_A)

    resp = await client.get("/api/v1/bundles/devops-agent")
    assert resp.status_code == 200
    assert resp.json()[0]["deployed_envs"] == []
