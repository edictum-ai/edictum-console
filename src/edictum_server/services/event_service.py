"""Service for ingesting audit events with deduplication."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from edictum_server.schemas.events import EventPayload


async def ingest_events(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    events: list[EventPayload],
) -> tuple[int, int]:
    """Batch-insert events with deduplication.

    Uses ``ON CONFLICT DO NOTHING`` on PostgreSQL (via dialect-specific insert)
    or ``INSERT OR IGNORE`` on SQLite (for testing).

    Returns:
        A ``(accepted, duplicates)`` tuple.
    """
    if not events:
        return 0, 0

    total = len(events)
    rows = [
        {
            "tenant_id": tenant_id,
            "call_id": e.call_id,
            "agent_id": e.agent_id,
            "tool_name": e.tool_name,
            "verdict": e.verdict,
            "mode": e.mode,
            "timestamp": e.timestamp,
            "payload": e.payload,
        }
        for e in events
    ]

    dialect_name = db.bind.dialect.name if db.bind else "postgresql"

    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        pg_stmt = (
            pg_insert(Event)
            .values(rows)
            .on_conflict_do_nothing(constraint="uq_event_tenant_call")
        )
        result = await db.execute(pg_stmt)
    else:
        # SQLite / other — use prefix_with for INSERT OR IGNORE
        sqlite_stmt = insert(Event).values(rows).prefix_with("OR IGNORE")
        result = await db.execute(sqlite_stmt)

    await db.flush()

    accepted = result.rowcount  # type: ignore[attr-defined]
    duplicates = total - accepted
    return accepted, duplicates


async def query_events(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    agent_id: str | None = None,
    tool_name: str | None = None,
    verdict: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 100,
) -> list[Event]:
    """Query audit events with optional filters."""
    stmt = select(Event).where(Event.tenant_id == tenant_id)

    if agent_id is not None:
        stmt = stmt.where(Event.agent_id == agent_id)
    if tool_name is not None:
        stmt = stmt.where(Event.tool_name == tool_name)
    if verdict is not None:
        stmt = stmt.where(Event.verdict == verdict)
    if since is not None:
        stmt = stmt.where(Event.timestamp >= since)
    if until is not None:
        stmt = stmt.where(Event.timestamp <= until)

    stmt = stmt.order_by(Event.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
