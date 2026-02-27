"""Adversarial tests: tenant isolation for stats/contracts and deployments."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Deployment, Event
from tests.conftest import TENANT_A_ID, TENANT_B_ID


@pytest.mark.security
async def test_contract_stats_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Events from tenant A must not appear in tenant B's contract stats."""
    now = datetime.now(UTC)
    db_session.add(
        Event(
            tenant_id=TENANT_A_ID,
            call_id=str(uuid.uuid4()),
            agent_id="agent-1",
            tool_name="shell",
            verdict="denied",
            mode="enforce",
            timestamp=now - timedelta(hours=1),
            payload={"decision_name": "no_shell"},
        )
    )
    await db_session.commit()

    # Verify tenant A sees the event
    resp_a = await client.get("/api/v1/stats/contracts")
    assert resp_a.status_code == 200
    assert resp_a.json()["total_events"] == 1
    assert len(resp_a.json()["coverage"]) == 1

    # Switch to tenant B — must see nothing
    set_auth_tenant_b()
    resp_b = await client.get("/api/v1/stats/contracts")
    assert resp_b.status_code == 200
    assert resp_b.json()["total_events"] == 0
    assert resp_b.json()["coverage"] == []


@pytest.mark.security
async def test_deployments_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Deployments from tenant A must not appear in tenant B's listing."""
    db_session.add(
        Deployment(
            tenant_id=TENANT_A_ID,
            env="production",
            bundle_version=1,
            deployed_by="test",
            created_at=datetime(2026, 1, 1),
        )
    )
    await db_session.commit()

    # Verify tenant A sees the deployment
    resp_a = await client.get("/api/v1/deployments")
    assert resp_a.status_code == 200
    assert len(resp_a.json()) == 1

    # Switch to tenant B — must see nothing
    set_auth_tenant_b()
    resp_b = await client.get("/api/v1/deployments")
    assert resp_b.status_code == 200
    assert resp_b.json() == []
