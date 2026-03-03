"""Agent history reconstruction from deployments and events."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, func, cast, String, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment, Event
from edictum_server.schemas.coverage import AgentHistoryResponse, HistoryEvent

EventRow = tuple[datetime, dict | None]  # (timestamp, payload)


async def get_agent_history(
    db: AsyncSession, tenant_id: uuid.UUID, agent_id: str, limit: int = 50,
) -> AgentHistoryResponse | None:
    """Reconstruct a timeline for an agent from deployments and events.

    Returns None if no events exist (caller raises 404). Timeline entries
    (newest first): deployment, drift_detected, drift_resolved, first_seen.
    """
    # Latest event → agent's current environment
    row = (await db.execute(
        select(Event.env).where(Event.tenant_id == tenant_id, Event.agent_id == agent_id)
        .order_by(Event.timestamp.desc()).limit(1)
    )).first()
    if row is None:
        return None
    agent_env: str | None = row[0]

    # Earliest event → first_seen
    fs = (await db.execute(
        select(Event.timestamp, Event.env)
        .where(Event.tenant_id == tenant_id, Event.agent_id == agent_id)
        .order_by(Event.timestamp.asc()).limit(1)
    )).one()
    first_seen = HistoryEvent(
        type="first_seen", timestamp=fs[0], environment=fs[1] or agent_env or "unknown",
    )

    if not agent_env:
        return AgentHistoryResponse(agent_id=agent_id, environment=None, events=[first_seen])

    # Deployments for the agent's environment
    deployments = list((await db.execute(
        select(Deployment).where(Deployment.tenant_id == tenant_id, Deployment.env == agent_env)
        .order_by(Deployment.created_at.desc()).limit(limit)
    )).scalars().all())

    if not deployments:
        return AgentHistoryResponse(agent_id=agent_id, environment=agent_env, events=[first_seen])

    # Batch-query bundle hashes for all deployments in one query
    bundle_keys = [(dep.bundle_name, dep.bundle_version) for dep in deployments]
    hash_rows = (await db.execute(
        select(Bundle.name, Bundle.version, Bundle.revision_hash).where(
            Bundle.tenant_id == tenant_id,
            tuple_(Bundle.name, Bundle.version).in_(bundle_keys),
        )
    )).all()
    hash_map = {(r.name, r.version): r.revision_hash for r in hash_rows}
    dep_hashes: dict[uuid.UUID, str] = {}
    for dep in deployments:
        rh = hash_map.get((dep.bundle_name, dep.bundle_version))
        if rh:
            dep_hashes[dep.id] = rh

    # Batch-query agent events from oldest deployment onward
    agent_events: list[EventRow] = list((await db.execute(
        select(Event.timestamp, Event.payload).where(
            Event.tenant_id == tenant_id, Event.agent_id == agent_id,
            Event.timestamp >= deployments[-1].created_at,
        ).order_by(Event.timestamp.asc())
    )).all())

    # Only track drift if the agent participates in console-managed versioning.
    # Agents using local YAML (from_yaml) never match console bundle hashes —
    # showing perpetual "ongoing drift" for those is misleading.
    known_hashes = set(dep_hashes.values())
    track_drift = _agent_tracks_console_versions(agent_events, known_hashes)
    if not track_drift:
        track_drift = await _any_event_matches_hash(
            db, tenant_id, agent_id, known_hashes,
        )
    timeline = _build_timeline(deployments, dep_hashes, agent_events, track_drift)

    # Fill actual_version from pre-deployment events when batch didn't cover it
    for entry in timeline:
        if entry.type == "drift_detected" and entry.actual_version is None:
            entry.actual_version = await _query_version_before(
                db, tenant_id, agent_id, entry.timestamp,
            )

    timeline.append(first_seen)
    timeline.sort(key=lambda e: e.timestamp, reverse=True)
    return AgentHistoryResponse(agent_id=agent_id, environment=agent_env, events=timeline)


def _build_timeline(
    deployments: list[Deployment],
    dep_hashes: dict[uuid.UUID, str],
    agent_events: list[EventRow],
    track_drift: bool,
) -> list[HistoryEvent]:
    """Build deployment + drift entries. Skips drift when ``track_drift`` is False
    (agent uses local contracts, not console-managed)."""
    timeline: list[HistoryEvent] = []
    for dep in deployments:
        rhash = dep_hashes.get(dep.id)
        timeline.append(HistoryEvent(
            type="deployment", timestamp=dep.created_at,
            bundle_name=dep.bundle_name, bundle_version=dep.bundle_version,
            deployed_by=dep.deployed_by, revision_hash=rhash,
        ))
        if rhash is None or not track_drift:
            continue

        sync_ts = _find_sync(agent_events, dep.created_at, rhash)
        actual = _find_version_before(agent_events, dep.created_at)

        if sync_ts is not None:
            drift_secs = int((sync_ts - dep.created_at).total_seconds())
            if drift_secs > 0:
                timeline.append(HistoryEvent(
                    type="drift_detected", timestamp=dep.created_at,
                    expected_version=rhash, actual_version=actual,
                ))
                timeline.append(HistoryEvent(
                    type="drift_resolved", timestamp=sync_ts,
                    policy_version=rhash, drift_duration_seconds=drift_secs,
                ))
        else:
            timeline.append(HistoryEvent(
                type="drift_detected", timestamp=dep.created_at,
                expected_version=rhash, actual_version=actual,
            ))
    return timeline


def _agent_tracks_console_versions(
    events: list[EventRow], known_hashes: set[str],
) -> bool:
    """True if any event reports a policy_version matching a known bundle hash."""
    return any(
        payload and payload.get("policy_version") in known_hashes
        for _, payload in events
    )


async def _any_event_matches_hash(
    db: AsyncSession, tenant_id: uuid.UUID, agent_id: str, known_hashes: set[str],
) -> bool:
    """Check if any agent event has a policy_version matching known bundle hashes.

    Uses an EXISTS query per hash instead of loading all payloads into memory.
    """
    if not known_hashes:
        return False
    for h in known_hashes:
        result = await db.execute(
            select(func.count()).select_from(Event).where(
                Event.tenant_id == tenant_id,
                Event.agent_id == agent_id,
                Event.payload.is_not(None),
                cast(Event.payload["policy_version"].as_string(), String) == h,
            ).limit(1)
        )
        if result.scalar_one() > 0:
            return True
    return False


def _find_sync(
    events: list[EventRow], after: datetime, revision_hash: str,
) -> datetime | None:
    """First event at or after ``after`` with matching policy_version."""
    for ts, payload in events:
        if ts >= after and payload and payload.get("policy_version") == revision_hash:
            return ts
    return None


def _find_version_before(events: list[EventRow], before: datetime) -> str | None:
    """policy_version from the most recent event before ``before``."""
    candidate: str | None = None
    for ts, payload in events:
        if ts < before and payload and payload.get("policy_version"):
            candidate = payload["policy_version"]
        elif ts >= before:
            break
    return candidate


async def _query_version_before(
    db: AsyncSession, tenant_id: uuid.UUID, agent_id: str, before: datetime,
) -> str | None:
    """Query the agent's most recent event before a timestamp for policy_version."""
    row = (await db.execute(
        select(Event.payload).where(
            Event.tenant_id == tenant_id, Event.agent_id == agent_id,
            Event.timestamp < before,
        ).order_by(Event.timestamp.desc()).limit(1)
    )).first()
    if row and row[0]:
        return row[0].get("policy_version")
    return None
