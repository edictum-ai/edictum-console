"""Tests for GET /api/v1/deployments."""

from __future__ import annotations

from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Deployment
from tests.conftest import TENANT_A_ID

_T0 = datetime(2026, 1, 1)


async def _seed_deployment(
    db: AsyncSession,
    *,
    env: str = "production",
    version: int = 1,
    at: datetime = _T0,
) -> None:
    db.add(
        Deployment(
            tenant_id=TENANT_A_ID,
            env=env,
            bundle_version=version,
            deployed_by="test",
            created_at=at,
        )
    )
    await db.commit()


async def test_list_deployments_empty(client: AsyncClient) -> None:
    """No deployments → empty list."""
    resp = await client.get("/api/v1/deployments")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_deployments_filtered(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Filter by env returns only matching deployments."""
    await _seed_deployment(db_session, env="production", version=1, at=_T0)
    await _seed_deployment(
        db_session, env="staging", version=2, at=_T0 + timedelta(seconds=1)
    )

    resp = await client.get("/api/v1/deployments", params={"env": "staging"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["env"] == "staging"


async def test_list_deployments_limit(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Limit caps the number of results."""
    for i in range(5):
        await _seed_deployment(
            db_session, env="production", version=i + 1, at=_T0 + timedelta(seconds=i)
        )

    resp = await client.get("/api/v1/deployments", params={"limit": 2})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # Newest first
    assert data[0]["bundle_version"] == 5
    assert data[1]["bundle_version"] == 4


async def test_list_deployments_ordered_desc(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Deployments are returned newest-first."""
    await _seed_deployment(db_session, env="production", version=1, at=_T0)
    await _seed_deployment(
        db_session, env="production", version=2, at=_T0 + timedelta(seconds=10)
    )

    resp = await client.get("/api/v1/deployments")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["bundle_version"] == 2
    assert data[1]["bundle_version"] == 1
