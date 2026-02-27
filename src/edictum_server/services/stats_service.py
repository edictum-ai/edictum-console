"""Service for computing dashboard overview statistics."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Approval, Event
from edictum_server.schemas.stats import StatsOverviewResponse


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
