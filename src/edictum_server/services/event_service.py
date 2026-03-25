"""Service for ingesting audit events with deduplication."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Integer, delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from edictum_server.schemas.events import EventPayload, HistogramBucketResponse


async def ingest_events(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    events: list[EventPayload],
    env: str | None = None,
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
            "env": env,
            "timestamp": e.timestamp,
            "payload": e.payload,
        }
        for e in events
    ]

    dialect_name = db.bind.dialect.name if db.bind else "postgresql"

    if dialect_name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        pg_stmt = (
            pg_insert(Event).values(rows).on_conflict_do_nothing(constraint="uq_event_tenant_call")
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
    env: str | None = None,
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
    if env is not None:
        stmt = stmt.where(Event.env == env)
    if since is not None:
        stmt = stmt.where(Event.timestamp >= since)
    if until is not None:
        stmt = stmt.where(Event.timestamp <= until)

    stmt = stmt.order_by(Event.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def query_event_histogram(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    since: datetime,
    until: datetime,
    bucket_seconds: int,
    agent_id: str | None = None,
    tool_name: str | None = None,
    verdict: str | None = None,
    env: str | None = None,
) -> list[HistogramBucketResponse]:
    """Aggregate event counts into epoch-aligned time buckets.

    Returns pre-classified buckets with allowed/denied/pending/observed counts.
    Observe-mode denials are categorized as 'observed'.
    """
    dialect_name = db.bind.dialect.name if db.bind else "postgresql"

    epoch: object  # sqlalchemy column expression — varies by dialect
    if dialect_name == "postgresql":
        epoch = func.extract("epoch", Event.timestamp)
    else:
        epoch = func.cast(func.strftime("%s", Event.timestamp), Integer)

    bucket_col = (func.cast(epoch / bucket_seconds, Integer) * bucket_seconds).label(
        "bucket_epoch"
    )

    stmt = (
        select(
            bucket_col,
            Event.verdict,
            Event.mode,
            func.count().label("cnt"),
        )
        .where(Event.tenant_id == tenant_id)
        .where(Event.timestamp >= since)
        .where(Event.timestamp < until)
    )

    if agent_id is not None:
        stmt = stmt.where(Event.agent_id == agent_id)
    if tool_name is not None:
        stmt = stmt.where(Event.tool_name == tool_name)
    if verdict is not None:
        stmt = stmt.where(Event.verdict == verdict)
    if env is not None:
        stmt = stmt.where(Event.env == env)

    stmt = stmt.group_by(bucket_col, Event.verdict, Event.mode).order_by(bucket_col)
    result = await db.execute(stmt)
    rows = result.all()

    # Classify verdict/mode into categories and aggregate per bucket
    buckets: dict[int, dict[str, int]] = {}
    for row in rows:
        epoch_val = int(row.bucket_epoch)
        cnt = int(row.cnt)

        if epoch_val not in buckets:
            buckets[epoch_val] = {"allowed": 0, "denied": 0, "pending": 0, "observed": 0}

        b = buckets[epoch_val]

        # Observe-mode denials → observed category
        if row.mode == "observe" and row.verdict in ("call_would_deny", "call_denied"):
            b["observed"] += cnt
        elif row.verdict in ("allowed", "call_allowed"):
            b["allowed"] += cnt
        elif row.verdict in ("denied", "call_denied", "would_deny", "call_would_deny"):
            b["denied"] += cnt
        elif row.verdict in ("pending", "pending_approval"):
            b["pending"] += cnt
        else:
            b["allowed"] += cnt  # fallback for unknown verdicts

    return [
        HistogramBucketResponse(
            bucket_start=datetime.fromtimestamp(epoch_val, UTC),
            allowed=counts["allowed"],
            denied=counts["denied"],
            pending=counts["pending"],
            observed=counts["observed"],
        )
        for epoch_val, counts in sorted(buckets.items())
    ]


async def purge_events(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    older_than_days: int,
) -> tuple[int, datetime]:
    """Delete events older than the specified number of days.

    Returns (deleted_count, cutoff_datetime). Caller commits.
    """
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    stmt = delete(Event).where(
        Event.tenant_id == tenant_id,
        Event.created_at < cutoff,
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount, cutoff  # type: ignore[attr-defined]
