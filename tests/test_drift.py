"""Tests for drift detection service."""

from __future__ import annotations

import hashlib

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment
from edictum_server.services.drift_service import check_drift
from tests.conftest import TENANT_A_ID

_YAML_A = b"apiVersion: edictum/v1\nkind: ContractBundle\nmetadata:\n  name: devops-agent\n"
_HASH_A = hashlib.sha256(_YAML_A).hexdigest()[:16]


async def _seed_bundle_and_deploy(
    db: AsyncSession,
    *,
    env: str = "production",
    deploy: bool = True,
) -> str:
    """Create a bundle and optionally deploy it. Returns revision_hash."""
    bundle = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=1,
        yaml_bytes=_YAML_A,
        revision_hash=_HASH_A,
        uploaded_by="test",
    )
    db.add(bundle)
    await db.flush()

    if deploy:
        dep = Deployment(
            tenant_id=TENANT_A_ID,
            env=env,
            bundle_name="devops-agent",
            bundle_version=1,
            deployed_by="test",
        )
        db.add(dep)
        await db.flush()

    return _HASH_A


@pytest.mark.asyncio
async def test_drift_current(db_session: AsyncSession) -> None:
    rev_hash = await _seed_bundle_and_deploy(db_session)
    status = await check_drift(db_session, TENANT_A_ID, rev_hash, "production")
    assert status == "current"


@pytest.mark.asyncio
async def test_drift_stale(db_session: AsyncSession) -> None:
    await _seed_bundle_and_deploy(db_session)
    status = await check_drift(db_session, TENANT_A_ID, "old_hash_value", "production")
    assert status == "drift"


@pytest.mark.asyncio
async def test_drift_unknown_hash(db_session: AsyncSession) -> None:
    """No deployment for the env → unknown."""
    status = await check_drift(db_session, TENANT_A_ID, "anything", "production")
    assert status == "unknown"


@pytest.mark.asyncio
async def test_drift_not_deployed(db_session: AsyncSession) -> None:
    """Bundle exists but not deployed to env → unknown."""
    await _seed_bundle_and_deploy(db_session, deploy=False)
    status = await check_drift(db_session, TENANT_A_ID, _HASH_A, "production")
    assert status == "unknown"
