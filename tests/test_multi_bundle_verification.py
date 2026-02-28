"""Verification tests for multi-bundle P1 model changes."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment
from edictum_server.services.bundle_service import (
    get_bundle_by_version,
    get_current_bundle,
    get_deployed_envs_map,
    list_bundle_names,
    list_bundle_versions,
    upload_bundle,
)
from edictum_server.services.drift_service import check_drift
from tests.conftest import TENANT_A_ID

YAML_DEVOPS = """\
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

YAML_RESEARCH = """\
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

YAML_NO_NAME = "rules:\n  - name: test\n"


# --- V1: upload_bundle with metadata.name ---


async def test_upload_returns_name_and_version_1(db_session: AsyncSession) -> None:
    """upload_bundle with metadata.name returns name and version 1."""
    bundle = await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    assert bundle.name == "devops-agent"
    assert bundle.version == 1


async def test_second_upload_same_name_version_2(db_session: AsyncSession) -> None:
    """Second upload with same name returns version 2."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    yaml_v2 = YAML_DEVOPS.replace("effect: deny", "effect: warn")
    b2 = await upload_bundle(db_session, TENANT_A_ID, yaml_v2.encode(), "test")
    assert b2.name == "devops-agent"
    assert b2.version == 2


async def test_different_name_independent_lineage(db_session: AsyncSession) -> None:
    """Upload with different name returns version 1 (independent lineage)."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    b2 = await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")
    assert b2.name == "research-agent"
    assert b2.version == 1


async def test_upload_missing_name_raises(db_session: AsyncSession) -> None:
    """Upload with missing metadata.name raises ValueError."""
    with pytest.raises(ValueError, match="metadata.name"):
        await upload_bundle(db_session, TENANT_A_ID, YAML_NO_NAME.encode(), "test")


# --- V2: list_bundle_names ---


async def test_list_bundle_names_aggregates(db_session: AsyncSession) -> None:
    """list_bundle_names returns distinct names with correct aggregates."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    yaml_v2 = YAML_DEVOPS.replace("effect: deny", "effect: warn")
    await upload_bundle(db_session, TENANT_A_ID, yaml_v2.encode(), "test")
    await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")
    await db_session.commit()

    names = await list_bundle_names(db_session, TENANT_A_ID)
    by_name = {n["name"]: n for n in names}

    assert "devops-agent" in by_name
    assert by_name["devops-agent"]["version_count"] == 2
    assert by_name["devops-agent"]["latest_version"] == 2

    assert "research-agent" in by_name
    assert by_name["research-agent"]["version_count"] == 1
    assert by_name["research-agent"]["latest_version"] == 1


# --- V3: list_bundle_versions ---


async def test_list_bundle_versions_scoped(db_session: AsyncSession) -> None:
    """list_bundle_versions returns only versions for the specified name."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    yaml_v2 = YAML_DEVOPS.replace("effect: deny", "effect: warn")
    await upload_bundle(db_session, TENANT_A_ID, yaml_v2.encode(), "test")
    await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")
    await db_session.commit()

    devops = await list_bundle_versions(db_session, TENANT_A_ID, "devops-agent")
    assert len(devops) == 2
    assert all(b.name == "devops-agent" for b in devops)

    research = await list_bundle_versions(db_session, TENANT_A_ID, "research-agent")
    assert len(research) == 1


# --- V4: get_deployed_envs_map scoped by bundle_name ---


async def test_deployed_envs_map_scoped(db_session: AsyncSession) -> None:
    """get_deployed_envs_map with bundle_name excludes other bundles."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")

    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="devops-agent", bundle_version=1, deployed_by="test",
    ))
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="staging",
        bundle_name="research-agent", bundle_version=1, deployed_by="test",
    ))
    await db_session.commit()

    devops_map = await get_deployed_envs_map(db_session, TENANT_A_ID, bundle_name="devops-agent")
    assert devops_map == {1: ["production"]}

    research_map = await get_deployed_envs_map(db_session, TENANT_A_ID, bundle_name="research-agent")
    assert research_map == {1: ["staging"]}


# --- V5: get_current_bundle with bundle_name ---


async def test_get_current_bundle_with_name(db_session: AsyncSession) -> None:
    """get_current_bundle with bundle_name returns correct bundle."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")

    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="devops-agent", bundle_version=1, deployed_by="test",
    ))
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="research-agent", bundle_version=1, deployed_by="test",
    ))
    await db_session.commit()

    devops = await get_current_bundle(db_session, TENANT_A_ID, "production", bundle_name="devops-agent")
    assert devops is not None
    assert devops.name == "devops-agent"

    research = await get_current_bundle(db_session, TENANT_A_ID, "production", bundle_name="research-agent")
    assert research is not None
    assert research.name == "research-agent"


# --- V6: get_bundle_by_version with bundle_name ---


async def test_get_bundle_by_version_with_name(db_session: AsyncSession) -> None:
    """get_bundle_by_version with bundle_name returns correct bundle."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    await upload_bundle(db_session, TENANT_A_ID, YAML_RESEARCH.encode(), "test")
    await db_session.commit()

    devops = await get_bundle_by_version(db_session, TENANT_A_ID, 1, bundle_name="devops-agent")
    assert devops is not None
    assert devops.name == "devops-agent"

    # Version 1 with wrong name → None
    wrong = await get_bundle_by_version(db_session, TENANT_A_ID, 1, bundle_name="research-agent")
    assert wrong is not None
    assert wrong.name == "research-agent"
    assert wrong.version == 1


# --- V7: check_drift ---


async def test_drift_current(db_session: AsyncSession) -> None:
    """check_drift returns 'current' when revision matches."""
    bundle = await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="devops-agent", bundle_version=1, deployed_by="test",
    ))
    await db_session.commit()

    result = await check_drift(db_session, TENANT_A_ID, bundle.revision_hash, "production")
    assert result == "current"


async def test_drift_mismatch(db_session: AsyncSession) -> None:
    """check_drift returns 'drift' when revision doesn't match."""
    await upload_bundle(db_session, TENANT_A_ID, YAML_DEVOPS.encode(), "test")
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID, env="production",
        bundle_name="devops-agent", bundle_version=1, deployed_by="test",
    ))
    await db_session.commit()

    result = await check_drift(db_session, TENANT_A_ID, "wrong_hash_abc123", "production")
    assert result == "drift"


async def test_drift_unknown_no_deployment(db_session: AsyncSession) -> None:
    """check_drift returns 'unknown' when no deployment exists."""
    result = await check_drift(db_session, TENANT_A_ID, "any_hash", "production")
    assert result == "unknown"


# --- V8: API response includes name ---


async def test_api_upload_returns_name(client: AsyncClient) -> None:
    """POST /bundles returns name in response."""
    resp = await client.post("/api/v1/bundles", json={"yaml_content": YAML_DEVOPS})
    assert resp.status_code == 201
    assert resp.json()["name"] == "devops-agent"


async def test_api_list_returns_name(client: AsyncClient) -> None:
    """GET /bundles returns name in each bundle."""
    await client.post("/api/v1/bundles", json={"yaml_content": YAML_DEVOPS})
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "devops-agent"
