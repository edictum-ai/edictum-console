"""Tests for event purge endpoint."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from tests.conftest import TENANT_A_ID

pytestmark = pytest.mark.anyio

PURGE_URL = "/api/v1/settings/purge-events"


async def _seed_events(db: AsyncSession, tenant_id, days_ago: list[int]) -> None:
    """Insert events at various ages, then backdate created_at."""
    for d in days_ago:
        event = Event(
            tenant_id=tenant_id,
            call_id=f"call-{d}",
            agent_id="agent-1",
            tool_name="shell",
            verdict="allow",
            mode="enforce",
            timestamp=datetime.now(UTC) - timedelta(days=d),
        )
        db.add(event)
    await db.flush()
    # Backdate created_at (server_default sets it to now())
    for d in days_ago:
        await db.execute(
            update(Event)
            .where(Event.call_id == f"call-{d}", Event.tenant_id == tenant_id)
            .values(created_at=datetime.now(UTC) - timedelta(days=d))
        )
    await db.commit()


async def test_purge_old_events(client: AsyncClient, db_session: AsyncSession) -> None:
    await _seed_events(db_session, TENANT_A_ID, [1, 10, 60, 90])

    resp = await client.delete(PURGE_URL, params={"older_than_days": 30})
    assert resp.status_code == 200
    data = resp.json()
    assert data["deleted_count"] == 2  # 60 and 90 days old


async def test_purge_invalid_days(client: AsyncClient) -> None:
    resp = await client.delete(PURGE_URL, params={"older_than_days": 0})
    assert resp.status_code == 422
