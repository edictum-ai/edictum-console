"""Per-agent coverage analysis.

Uses DB + Redis. Calls pure functions from coverage_matching.py.
DB query helpers live in coverage_queries.py.
Fleet-level coverage lives in fleet_coverage_service.py.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Event
from edictum_server.schemas.coverage import (
    AgentCoverage,
    CoverageSummary,
    TimeWindow,
    ToolCoverage,
)
from edictum_server.services.coverage_matching import classify_tools
from edictum_server.services.coverage_queries import get_matchers_for_env, get_tool_rows

logger = logging.getLogger(__name__)

COVERAGE_CACHE_TTL = 60

_SINCE_RE = re.compile(r"^(\d+)([hdm])$")


def parse_since(since_str: str | None) -> datetime:
    """Parse a time window string into a UTC datetime.

    Accepts:
    - Duration shorthands: "1h", "6h", "24h", "7d", "30d", "15m"
    - ISO 8601 timestamps: "2026-03-01T10:30:00Z"
    - None -> defaults to 24h ago

    Raises ValueError for unrecognized formats.
    """
    if since_str is None:
        return datetime.now(UTC) - timedelta(hours=24)

    match = _SINCE_RE.match(since_str)
    if match:
        amount = int(match.group(1))
        unit = match.group(2)
        if unit == "h":
            delta = timedelta(hours=amount)
        elif unit == "d":
            delta = timedelta(days=amount)
        else:  # "m"
            delta = timedelta(minutes=amount)
        return datetime.now(UTC) - delta

    # Try ISO 8601
    try:
        return datetime.fromisoformat(since_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        pass

    msg = f"Invalid since value: {since_str}"
    raise ValueError(msg)


async def compute_coverage(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    since: datetime,
    until: datetime | None = None,
    include_verdicts: bool = False,
    redis: object | None = None,
) -> AgentCoverage | None:
    """Compute per-agent tool coverage analysis.

    Returns None if no events exist for this agent_id in tenant.
    """
    # Cache key omits `until` intentionally — it defaults to now() and the
    # 60s TTL makes stale-window collisions negligible.
    cache_key = f"coverage:{tenant_id}:{agent_id}:{since.isoformat()}:{include_verdicts}"
    if redis is not None:
        try:
            cached = await redis.get(cache_key)  # type: ignore[union-attr]
            if cached:
                return AgentCoverage.model_validate_json(cached)
        except Exception:  # noqa: BLE001
            logger.debug("Redis cache miss for %s", cache_key)

    tool_rows = await get_tool_rows(db, tenant_id, agent_id, since, until, include_verdicts)
    if not tool_rows:
        return None

    # Determine agent's environment from most recent event
    env_result = await db.execute(
        select(Event.env)
        .where(Event.tenant_id == tenant_id, Event.agent_id == agent_id)
        .order_by(Event.timestamp.desc())
        .limit(1)
    )
    agent_env = env_result.scalar_one_or_none()

    now = datetime.now(UTC)
    time_window = TimeWindow(since=since, until=until or now)

    if agent_env is None:
        # No env means we can't match against any deployed contracts.
        # Return empty tools with coverage_pct=100 (vacuously true: 0/0).
        # total_tools=0 signals to the frontend that no analysis was possible.
        return AgentCoverage(
            agent_id=agent_id,
            environment="unknown",
            time_window=time_window,
            deployed_bundle=None,
            tools=[],
            summary=CoverageSummary(
                total_tools=0, enforced=0, observed=0, ungoverned=0, coverage_pct=100
            ),
        )

    all_matchers, deployed_bundle_info = await get_matchers_for_env(db, tenant_id, agent_env)

    classified = classify_tools(tool_rows, all_matchers)
    tools = [ToolCoverage(**t) for t in classified]

    enforced = sum(1 for t in tools if t.status == "enforced")
    observed = sum(1 for t in tools if t.status == "observed")
    ungoverned = sum(1 for t in tools if t.status == "ungoverned")
    total = len(tools)

    result = AgentCoverage(
        agent_id=agent_id,
        environment=agent_env,
        time_window=time_window,
        deployed_bundle=deployed_bundle_info,
        tools=tools,
        summary=CoverageSummary(
            total_tools=total,
            enforced=enforced,
            observed=observed,
            ungoverned=ungoverned,
            coverage_pct=round(enforced / total * 100) if total > 0 else 100,
        ),
    )

    # Cache in Redis
    if redis is not None:
        try:
            await redis.set(cache_key, result.model_dump_json(), ex=COVERAGE_CACHE_TTL)  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            logger.debug("Redis cache write failed for %s", cache_key)

    return result
