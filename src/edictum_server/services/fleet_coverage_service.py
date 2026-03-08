"""Fleet-level coverage analysis.

Separated from coverage_service.py to keep files under 200 lines.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from edictum_server.schemas.coverage import (
    AgentCoverageSummary,
    FleetCoverage,
    FleetSummary,
    TimeWindow,
    UngovernedToolSummary,
)
from edictum_server.services.coverage_matching import classify_tools, manifest_to_matchers
from edictum_server.services.coverage_queries import get_matchers_for_env
from edictum_server.services.manifest_service import get_agent_manifest

logger = logging.getLogger(__name__)


async def compute_fleet_coverage(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    since: datetime,
    env: str | None = None,
) -> FleetCoverage:
    """Compute fleet-level coverage. Single batch query, YAML parsed once per env.

    No Redis caching here — fleet queries aggregate across all agents and the
    result changes with every new event. Add caching if this becomes a
    bottleneck on large fleets (profile first).
    """
    now = datetime.now(UTC)
    time_window = TimeWindow(since=since, until=now)

    # Single batch query — all agent x tool pairs
    stmt = (
        select(
            Event.agent_id,
            Event.tool_name,
            func.count().label("event_count"),
            func.max(Event.timestamp).label("last_used"),
        )
        .where(Event.tenant_id == tenant_id, Event.timestamp >= since)
        .group_by(Event.agent_id, Event.tool_name)
    )
    if env:
        stmt = stmt.where(Event.env == env)
    rows = (await db.execute(stmt)).all()

    # Group by agent
    agent_tools: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        agent_tools.setdefault(row.agent_id, []).append({
            "tool_name": row.tool_name,
            "event_count": row.event_count,
            "last_used": row.last_used,
        })

    if not agent_tools:
        return _empty_fleet(time_window)

    agent_envs = await _resolve_agent_envs(db, tenant_id, agent_tools, env)

    # Load deployed matchers per environment (deduplicated)
    env_matchers: dict[str, list[Any]] = {}
    for agent_env in set(agent_envs.values()):
        if agent_env is None or agent_env in env_matchers:
            continue
        matchers, _ = await get_matchers_for_env(db, tenant_id, agent_env)
        env_matchers[agent_env] = matchers

    # Match all tools per agent
    agent_coverages: list[AgentCoverageSummary] = []
    all_ungoverned: dict[str, set[str]] = {}

    for agent_id, tool_rows in agent_tools.items():
        agent_env = agent_envs.get(agent_id)
        if agent_env is None:
            agent_coverages.append(AgentCoverageSummary(
                agent_id=agent_id, environment="unknown",
                total_tools=len(tool_rows), enforced=0, observed=0,
                ungoverned=len(tool_rows), coverage_pct=0,
            ))
            for row in tool_rows:
                all_ungoverned.setdefault(row["tool_name"], set()).add(agent_id)
            continue

        matchers = env_matchers.get(agent_env, [])
        source = "console"
        if not matchers:
            manifest = await get_agent_manifest(db, tenant_id, agent_id)
            if manifest:
                matchers = manifest_to_matchers(manifest)
                source = "local"
        classified = classify_tools(tool_rows, matchers, source=source)
        enforced = sum(1 for t in classified if t["status"] == "enforced")
        observed = sum(1 for t in classified if t["status"] == "observed")
        ungoverned = sum(1 for t in classified if t["status"] == "ungoverned")
        total = len(classified)

        agent_coverages.append(AgentCoverageSummary(
            agent_id=agent_id, environment=agent_env,
            total_tools=total, enforced=enforced, observed=observed,
            ungoverned=ungoverned,
            coverage_pct=round(enforced / total * 100) if total > 0 else 100,
        ))
        for t in classified:
            if t["status"] == "ungoverned":
                all_ungoverned.setdefault(t["tool_name"], set()).add(agent_id)

    return FleetCoverage(
        time_window=time_window,
        agents=agent_coverages,
        fleet_summary=FleetSummary(
            total_agents=len(agent_coverages),
            fully_enforced=sum(
                1 for c in agent_coverages if c.ungoverned == 0 and c.observed == 0
            ),
            with_ungoverned=sum(1 for c in agent_coverages if c.ungoverned > 0),
            with_drift=sum(
                1 for c in agent_coverages if c.drift_status == "drift"
            ),
            total_ungoverned_tools=len(all_ungoverned),
            ungoverned_tools=sorted(
                [
                    UngovernedToolSummary(
                        tool_name=name,
                        agent_count=len(aids),
                        agent_ids=sorted(aids),
                    )
                    for name, aids in all_ungoverned.items()
                ],
                key=lambda x: -x.agent_count,
            ),
        ),
    )


def _empty_fleet(time_window: TimeWindow) -> FleetCoverage:
    return FleetCoverage(
        time_window=time_window,
        agents=[],
        fleet_summary=FleetSummary(
            total_agents=0, fully_enforced=0, with_ungoverned=0,
            with_drift=0, total_ungoverned_tools=0, ungoverned_tools=[],
        ),
    )


async def _resolve_agent_envs(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_tools: dict[str, list[Any]],
    env: str | None,
) -> dict[str, str | None]:
    """Determine environment per agent.

    When env filter is active, use it directly — don't re-derive from
    unfiltered events, which could return a different env and cause us
    to match tools against the wrong environment's contracts.
    """
    agent_ids = list(agent_tools.keys())
    if env:
        return {aid: env for aid in agent_ids}

    # Get most recent env per agent. ORDER BY timestamp DESC + Python dedup
    # gives us the latest env. LIMIT caps the scan for large event volumes.
    env_stmt = (
        select(Event.agent_id, Event.env)
        .where(Event.tenant_id == tenant_id, Event.agent_id.in_(agent_ids))
        .order_by(Event.timestamp.desc())
        .limit(len(agent_ids) * 50)
    )
    env_rows = (await db.execute(env_stmt)).all()
    agent_envs: dict[str, str | None] = {}
    for row in env_rows:
        if row.agent_id not in agent_envs:
            agent_envs[row.agent_id] = row.env
    return agent_envs
