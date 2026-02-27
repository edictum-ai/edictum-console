"""Service for computing dashboard statistics."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Approval, Event
from edictum_server.schemas.stats import (
    ContractCoverage,
    ContractStatsResponse,
    StatsOverviewResponse,
)


async def get_overview(db: AsyncSession, tenant_id: uuid.UUID) -> StatsOverviewResponse:
    """Compute dashboard overview stats for a tenant.

    All queries are scoped to ``tenant_id``.
    """
    now = datetime.now(UTC)
    one_hour_ago = now - timedelta(hours=1)
    twenty_four_hours_ago = now - timedelta(hours=24)

    # Pending approvals count
    pending_result = await db.execute(
        select(func.count())
        .select_from(Approval)
        .where(Approval.tenant_id == tenant_id, Approval.status == "pending")
    )
    pending_approvals = pending_result.scalar() or 0

    # Active agents (distinct agent_ids in last 1 hour)
    active_result = await db.execute(
        select(func.count(func.distinct(Event.agent_id)))
        .where(Event.tenant_id == tenant_id, Event.timestamp >= one_hour_ago)
    )
    active_agents = active_result.scalar() or 0

    # Total agents (distinct agent_ids all-time)
    total_result = await db.execute(
        select(func.count(func.distinct(Event.agent_id)))
        .where(Event.tenant_id == tenant_id)
    )
    total_agents = total_result.scalar() or 0

    # Events in last 24 hours
    events_24h_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(Event.tenant_id == tenant_id, Event.timestamp >= twenty_four_hours_ago)
    )
    events_24h = events_24h_result.scalar() or 0

    # Denials in last 24 hours
    denials_24h_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.timestamp >= twenty_four_hours_ago,
            Event.verdict == "denied",
        )
    )
    denials_24h = denials_24h_result.scalar() or 0

    # Observe findings in last 24 hours (mode=observe, verdict=call_would_deny)
    observe_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.timestamp >= twenty_four_hours_ago,
            Event.mode == "observe",
            Event.verdict == "call_would_deny",
        )
    )
    observe_findings_24h = observe_result.scalar() or 0

    # Distinct contracts triggered in last 24 hours
    contracts_result = await db.execute(
        select(func.count(func.distinct(
            Event.payload["decision_name"].as_string()
        )))
        .where(
            Event.tenant_id == tenant_id,
            Event.timestamp >= twenty_four_hours_ago,
            Event.payload["decision_name"] != text("'null'"),
        )
    )
    contracts_triggered_24h = contracts_result.scalar() or 0

    return StatsOverviewResponse(
        pending_approvals=pending_approvals,
        active_agents=active_agents,
        total_agents=total_agents,
        events_24h=events_24h,
        denials_24h=denials_24h,
        observe_findings_24h=observe_findings_24h,
        contracts_triggered_24h=contracts_triggered_24h,
    )


async def get_contract_stats(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    since: datetime,
    until: datetime,
) -> ContractStatsResponse:
    """Aggregate per-contract stats for a time window.

    Uses ``case()`` instead of ``FILTER(WHERE ...)`` for SQLite compatibility.
    """
    decision_col = Event.payload["decision_name"].as_string()

    stmt = (
        select(
            decision_col.label("decision_name"),
            func.count().label("total_evaluations"),
            func.sum(case((Event.verdict == "denied", 1), else_=0)).label("total_denials"),
            func.sum(
                case((Event.verdict == "call_would_deny", 1), else_=0)
            ).label("total_warnings"),
            func.max(Event.timestamp).label("last_triggered"),
        )
        .where(
            Event.tenant_id == tenant_id,
            Event.timestamp >= since,
            Event.timestamp <= until,
            decision_col != text("'null'"),
            decision_col.isnot(None),
        )
        .group_by(decision_col)
    )
    result = await db.execute(stmt)
    rows = result.all()

    coverage = [
        ContractCoverage(
            decision_name=row.decision_name,
            total_evaluations=row.total_evaluations,
            total_denials=row.total_denials,
            total_warnings=row.total_warnings,
            last_triggered=row.last_triggered.isoformat() if row.last_triggered else None,
        )
        for row in rows
    ]

    # Total events in window (all events, not just those with decision_name)
    total_result = await db.execute(
        select(func.count())
        .select_from(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.timestamp >= since,
            Event.timestamp <= until,
        )
    )
    total_events = total_result.scalar() or 0

    return ContractStatsResponse(
        coverage=coverage,
        total_events=total_events,
        period_start=since.isoformat(),
        period_end=until.isoformat(),
    )
