"""Integration tests for GET /api/v1/agents/{agent_id}/history."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment, Event
from tests.conftest import TENANT_A_ID

AGENT_ID = "agent-history"
HASH_V1 = "aaaa1111" * 8  # 64-char hex
HASH_V2 = "bbbb2222" * 8
OLD_HASH = "00000000" * 8


async def _seed_full_timeline(db: AsyncSession) -> None:
    """Two deployments (v1, v2), agent syncs to both.

    Timeline (oldest first):
      -7d  first event (OLD_HASH)
      -6d  deploy v1                 ← explicit created_at
      -5d  sync to v1 (HASH_V1)
      -3d  deploy v2                 ← explicit created_at
      -2h  sync to v2 (HASH_V2)
    """
    now = datetime.now(UTC)

    b1 = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=1,
        revision_hash=HASH_V1,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    b2 = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=2,
        revision_hash=HASH_V2,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    db.add_all([b1, b2])
    await db.flush()

    d1 = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="devops-agent",
        bundle_version=1,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=6),
    )
    d2 = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="devops-agent",
        bundle_version=2,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=3),
    )
    db.add_all([d1, d2])
    await db.flush()

    events = [
        # First seen — before any deployment
        Event(
            tenant_id=TENANT_A_ID,
            call_id="call-first",
            agent_id=AGENT_ID,
            tool_name="exec",
            verdict="allow",
            mode="enforce",
            env="production",
            timestamp=now - timedelta(days=7),
            payload={"policy_version": OLD_HASH},
        ),
        # Synced to v1 (after d1, before d2)
        Event(
            tenant_id=TENANT_A_ID,
            call_id="call-sync-v1",
            agent_id=AGENT_ID,
            tool_name="exec",
            verdict="allow",
            mode="enforce",
            env="production",
            timestamp=now - timedelta(days=5),
            payload={"policy_version": HASH_V1},
        ),
        # Synced to v2 (after d2)
        Event(
            tenant_id=TENANT_A_ID,
            call_id="call-sync-v2",
            agent_id=AGENT_ID,
            tool_name="exec",
            verdict="deny",
            mode="enforce",
            env="production",
            timestamp=now - timedelta(hours=2),
            payload={"policy_version": HASH_V2},
        ),
    ]
    db.add_all(events)
    await db.commit()


@pytest.mark.asyncio
async def test_history_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent with 2 deployments, drift resolved on both."""
    await _seed_full_timeline(db_session)

    resp = await client.get(f"/api/v1/agents/{AGENT_ID}/history")
    assert resp.status_code == 200

    data = resp.json()
    assert data["agent_id"] == AGENT_ID
    assert data["environment"] == "production"

    events = data["events"]
    types = [e["type"] for e in events]

    assert "first_seen" in types
    assert types.count("deployment") == 2
    # Both deployments should produce drift_detected + drift_resolved
    assert types.count("drift_detected") == 2
    assert types.count("drift_resolved") == 2

    # Timeline sorted newest-first
    timestamps = [e["timestamp"] for e in events]
    assert timestamps == sorted(timestamps, reverse=True)

    # Every drift_resolved has positive duration
    resolved = [e for e in events if e["type"] == "drift_resolved"]
    for e in resolved:
        assert e["drift_duration_seconds"] is not None
        assert e["drift_duration_seconds"] > 0

    # drift_detected entries have expected_version and actual_version
    detected = [e for e in events if e["type"] == "drift_detected"]
    for e in detected:
        assert e["expected_version"] is not None
        assert e["actual_version"] is not None

    # Check first_seen has environment
    first_seen = [e for e in events if e["type"] == "first_seen"][0]
    assert first_seen["environment"] == "production"


@pytest.mark.asyncio
async def test_history_no_deployments(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent has events but no deployments to its environment."""
    now = datetime.now(UTC)
    event = Event(
        tenant_id=TENANT_A_ID,
        call_id="call-nodep",
        agent_id="agent-nodep",
        tool_name="read_file",
        verdict="allow",
        mode="enforce",
        env="staging",
        timestamp=now - timedelta(days=1),
        payload={"policy_version": "some-hash"},
    )
    db_session.add(event)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-nodep/history")
    assert resp.status_code == 200

    data = resp.json()
    assert data["agent_id"] == "agent-nodep"
    assert data["environment"] == "staging"
    assert len(data["events"]) == 1
    assert data["events"][0]["type"] == "first_seen"
    assert data["events"][0]["environment"] == "staging"


@pytest.mark.asyncio
async def test_history_ongoing_drift(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent was on v0 (console-managed), v1 deployed, never synced.

    Timeline:
      -5d  deploy v0 (OLD_HASH)    ← establishes agent as console-managed
      -2d  event (OLD_HASH)         ← agent running v0
      -1d  deploy v1 (HASH_V1)     ← new version, drift begins
      -1h  event (OLD_HASH)         ← still running v0
    """
    now = datetime.now(UTC)

    # v0 bundle — the agent was previously synced to this
    bundle_v0 = Bundle(
        tenant_id=TENANT_A_ID,
        name="stale-bundle",
        version=0,
        revision_hash=OLD_HASH,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    bundle_v1 = Bundle(
        tenant_id=TENANT_A_ID,
        name="stale-bundle",
        version=1,
        revision_hash=HASH_V1,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    db_session.add_all([bundle_v0, bundle_v1])
    await db_session.flush()

    dep_v0 = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="stale-bundle",
        bundle_version=0,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=5),
    )
    dep_v1 = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="stale-bundle",
        bundle_version=1,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=1),
    )
    db_session.add_all([dep_v0, dep_v1])
    await db_session.flush()

    pre_event = Event(
        tenant_id=TENANT_A_ID,
        call_id="call-pre",
        agent_id="agent-stale",
        tool_name="exec",
        verdict="allow",
        mode="enforce",
        env="production",
        timestamp=now - timedelta(days=2),
        payload={"policy_version": OLD_HASH},
    )
    # After v1 deployment but still running v0 — drift is ongoing
    post_event = Event(
        tenant_id=TENANT_A_ID,
        call_id="call-post",
        agent_id="agent-stale",
        tool_name="exec",
        verdict="allow",
        mode="enforce",
        env="production",
        timestamp=now - timedelta(hours=1),
        payload={"policy_version": OLD_HASH},
    )
    db_session.add_all([pre_event, post_event])
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-stale/history")
    assert resp.status_code == 200

    data = resp.json()

    # v1 should have drift_detected (ongoing) but no drift_resolved
    v1_drift = [
        e for e in data["events"]
        if e["type"] == "drift_detected" and e["expected_version"] == HASH_V1
    ]
    assert len(v1_drift) == 1
    assert v1_drift[0]["actual_version"] == OLD_HASH

    v1_resolved = [
        e for e in data["events"]
        if e["type"] == "drift_resolved" and e.get("policy_version") == HASH_V1
    ]
    assert len(v1_resolved) == 0

    # v0 should have drift_resolved (agent synced to it)
    v0_resolved = [
        e for e in data["events"]
        if e["type"] == "drift_resolved" and e.get("policy_version") == OLD_HASH
    ]
    assert len(v0_resolved) == 1


@pytest.mark.asyncio
async def test_history_limit_parameter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Request with limit=1 returns fewer deployment entries."""
    await _seed_full_timeline(db_session)

    resp = await client.get(f"/api/v1/agents/{AGENT_ID}/history?limit=1")
    assert resp.status_code == 200

    data = resp.json()
    dep_count = sum(1 for e in data["events"] if e["type"] == "deployment")
    # Only 1 deployment (limit applies to deployment query)
    assert dep_count == 1


@pytest.mark.asyncio
async def test_history_agent_not_found(client: AsyncClient) -> None:
    """Request history for agent with no events returns 404."""
    resp = await client.get("/api/v1/agents/nonexistent-agent/history")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_history_first_seen_correct_env(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """First_seen entry shows the correct environment from earliest event."""
    now = datetime.now(UTC)
    events = [
        Event(
            tenant_id=TENANT_A_ID,
            call_id="call-env-1",
            agent_id="agent-env",
            tool_name="exec",
            verdict="allow",
            mode="enforce",
            env="staging",
            timestamp=now - timedelta(days=3),
            payload={"policy_version": "hash-1"},
        ),
        Event(
            tenant_id=TENANT_A_ID,
            call_id="call-env-2",
            agent_id="agent-env",
            tool_name="exec",
            verdict="allow",
            mode="enforce",
            env="production",
            timestamp=now - timedelta(hours=1),
            payload={"policy_version": "hash-2"},
        ),
    ]
    db_session.add_all(events)
    await db_session.commit()

    resp = await client.get("/api/v1/agents/agent-env/history")
    assert resp.status_code == 200

    data = resp.json()
    # Response-level environment is from latest event
    assert data["environment"] == "production"

    first_seen = [e for e in data["events"] if e["type"] == "first_seen"][0]
    assert first_seen["environment"] == "staging"


@pytest.mark.asyncio
async def test_history_local_yaml_agent_no_false_drift(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent using local YAML (from_yaml) — policy_version never matches
    any console bundle hash. Should NOT show false drift entries.

    This covers agents that use the edictum library with local contracts
    but send events via ServerAuditSink.
    """
    now = datetime.now(UTC)
    local_hash = "cccccccc" * 8  # hash of local YAML, not in any bundle

    # Console-managed bundle + deployment exist for production
    bundle = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=1,
        revision_hash=HASH_V1,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    db_session.add(bundle)
    await db_session.flush()

    dep = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="devops-agent",
        bundle_version=1,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=3),
    )
    db_session.add(dep)
    await db_session.flush()

    # Agent events all report a local hash that doesn't match any bundle
    for i in range(3):
        db_session.add(Event(
            tenant_id=TENANT_A_ID,
            call_id=f"call-local-{i}",
            agent_id="local-yaml-agent",
            tool_name="exec",
            verdict="allow",
            mode="enforce",
            env="production",
            timestamp=now - timedelta(days=5 - i),
            payload={"policy_version": local_hash, "bundle_name": "my-local-bundle"},
        ))
    await db_session.commit()

    resp = await client.get("/api/v1/agents/local-yaml-agent/history")
    assert resp.status_code == 200

    data = resp.json()
    types = [e["type"] for e in data["events"]]

    # Should have deployment (it exists in the env) and first_seen
    assert "deployment" in types
    assert "first_seen" in types
    # Must NOT have false drift — agent was never console-managed
    assert "drift_detected" not in types
    assert "drift_resolved" not in types


@pytest.mark.asyncio
async def test_history_no_payload_agent_no_false_drift(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent events with no payload at all — no false drift."""
    now = datetime.now(UTC)

    bundle = Bundle(
        tenant_id=TENANT_A_ID,
        name="devops-agent",
        version=1,
        revision_hash=HASH_V1,
        yaml_bytes=b"contracts: []",
        uploaded_by="admin@test.com",
    )
    db_session.add(bundle)
    await db_session.flush()

    dep = Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_name="devops-agent",
        bundle_version=1,
        deployed_by="admin@test.com",
        created_at=now - timedelta(days=3),
    )
    db_session.add(dep)
    await db_session.flush()

    # Events with no payload (e.g. minimal audit integration)
    db_session.add(Event(
        tenant_id=TENANT_A_ID,
        call_id="call-nopayload",
        agent_id="bare-agent",
        tool_name="exec",
        verdict="allow",
        mode="enforce",
        env="production",
        timestamp=now - timedelta(days=1),
        payload=None,
    ))
    await db_session.commit()

    resp = await client.get("/api/v1/agents/bare-agent/history")
    assert resp.status_code == 200

    data = resp.json()
    types = [e["type"] for e in data["events"]]

    assert "deployment" in types
    assert "first_seen" in types
    assert "drift_detected" not in types
    assert "drift_resolved" not in types
