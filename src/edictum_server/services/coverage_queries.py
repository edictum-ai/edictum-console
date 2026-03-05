"""Shared DB query helpers for coverage analysis.

Used by both coverage_service.py and fleet_coverage_service.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment, Event
from edictum_server.schemas.coverage import DeployedBundleInfo
from edictum_server.services.coverage_matching import parse_contract_matchers


async def get_tool_rows(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    since: datetime,
    until: datetime | None,
    include_verdicts: bool,
) -> list[dict[str, Any]]:
    """Query distinct tools used by an agent within the time window."""
    if include_verdicts:
        return await _get_tool_rows_with_verdicts(db, tenant_id, agent_id, since, until)

    stmt = (
        select(
            Event.tool_name,
            func.count().label("event_count"),
            func.max(Event.timestamp).label("last_used"),
        )
        .where(
            Event.tenant_id == tenant_id,
            Event.agent_id == agent_id,
            Event.timestamp >= since,
        )
        .group_by(Event.tool_name)
    )
    if until:
        stmt = stmt.where(Event.timestamp <= until)
    rows = (await db.execute(stmt)).all()
    return [
        {"tool_name": r.tool_name, "event_count": r.event_count, "last_used": r.last_used}
        for r in rows
    ]


async def _get_tool_rows_with_verdicts(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    since: datetime,
    until: datetime | None,
) -> list[dict[str, Any]]:
    """Query tools with verdict breakdown, then pivot per tool_name."""
    stmt = (
        select(
            Event.tool_name,
            Event.verdict,
            func.count().label("event_count"),
            func.max(Event.timestamp).label("last_used"),
        )
        .where(
            Event.tenant_id == tenant_id,
            Event.agent_id == agent_id,
            Event.timestamp >= since,
        )
        .group_by(Event.tool_name, Event.verdict)
    )
    if until:
        stmt = stmt.where(Event.timestamp <= until)
    rows = (await db.execute(stmt)).all()

    tool_map: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = tool_map.setdefault(
            row.tool_name,
            {
                "tool_name": row.tool_name,
                "event_count": 0,
                "last_used": row.last_used,
                "deny_count": 0,
                "allow_count": 0,
                "observe_count": 0,
            },
        )
        entry["event_count"] += row.event_count
        if row.last_used > entry["last_used"]:
            entry["last_used"] = row.last_used
        if row.verdict == "call_denied":
            entry["deny_count"] += row.event_count
        elif row.verdict in ("call_allowed", "call_executed"):
            entry["allow_count"] += row.event_count
        elif row.verdict == "call_would_deny":
            entry["observe_count"] += row.event_count
    return list(tool_map.values())


async def get_matchers_for_env(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    env: str,
) -> tuple[list[Any], DeployedBundleInfo | None]:
    """Load deployed bundle matchers for an environment."""
    dep_stmt = (
        select(Deployment.bundle_name, Deployment.bundle_version)
        .where(Deployment.tenant_id == tenant_id, Deployment.env == env)
        .order_by(Deployment.created_at.desc())
    )
    dep_rows = (await db.execute(dep_stmt)).all()

    seen_bundles: set[str] = set()
    all_matchers: list[Any] = []
    deployed_bundle_info: DeployedBundleInfo | None = None

    for row in dep_rows:
        if row.bundle_name in seen_bundles:
            continue
        seen_bundles.add(row.bundle_name)

        bundle_result = await db.execute(
            select(Bundle).where(
                Bundle.tenant_id == tenant_id,
                Bundle.name == row.bundle_name,
                Bundle.version == row.bundle_version,
            )
        )
        b = bundle_result.scalar_one_or_none()
        if b is None:
            continue

        all_matchers.extend(parse_contract_matchers(b.yaml_bytes, b.name, b.version))
        if deployed_bundle_info is None:
            deployed_bundle_info = DeployedBundleInfo(
                name=b.name, version=b.version, revision_hash=b.revision_hash
            )

    return all_matchers, deployed_bundle_info
