"""Seed test data for edictum-console dashboard development.

Reads real events and approvals from a Neon source database, then clones
them into local Postgres databases with varied agent configurations.

Usage:
    python scripts/seed_test_data.py              # seed all 3 databases
    python scripts/seed_test_data.py --agents 1    # seed only 1-agent DB
    python scripts/seed_test_data.py --agents 3    # seed only 3-agent DB
    python scripts/seed_test_data.py --agents 10   # seed only 10-agent DB
    python scripts/seed_test_data.py --source-url 'postgresql://...'  # override source

Switch databases by setting EDICTUM_DATABASE_URL in .env:
    EDICTUM_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/edictum_10agents
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import asyncpg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Ensure project root is on the path so we can import edictum_server modules
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from edictum_server.auth.api_keys import generate_api_key  # noqa: E402
from edictum_server.auth.local import LocalAuthProvider  # noqa: E402
from edictum_server.db.models import (  # noqa: E402
    ApiKey,
    Approval,
    Bundle,
    Deployment,
    Event,
    Tenant,
    User,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PG_HOST = os.getenv("PGHOST", "localhost")
PG_PORT = int(os.getenv("PGPORT", "5432"))
PG_USER = os.getenv("PGUSER", "postgres")
PG_PASS = os.getenv("PGPASSWORD", "postgres")

DEFAULT_SOURCE_URL = (
    "postgresql://neondb_owner:npg_wGdaiRkrWX04"
    "@ep-late-dream-agfsw82e-pooler.c-2.eu-central-1.aws.neon.tech"
    "/neondb?ssl=require"
)

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

CONTRACT_NAMES = [
    "production-safety", "staging-sandbox", "dev-permissive",
    "compliance-strict", "cost-governance",
]


# ---------------------------------------------------------------------------
# Agent configuration
# ---------------------------------------------------------------------------

@dataclass
class AgentConfig:
    """Configuration for a seed agent."""

    agent_id: str
    env: str
    mode: str
    health: str  # "healthy", "degraded", "offline"
    denial_rate: float  # probability of flipping an allowed verdict to denied
    event_share: float  # fraction of source events assigned to this agent


def _agents_1() -> list[AgentConfig]:
    return [
        AgentConfig("edictum-agent", "production", "enforce", "healthy", 0.08, 1.0),
    ]


def _agents_3() -> list[AgentConfig]:
    return [
        AgentConfig("edictum-agent", "production", "enforce", "healthy", 0.08, 0.45),
        AgentConfig("research-bot", "staging", "observe", "healthy", 0.15, 0.30),
        AgentConfig("devops-agent", "production", "enforce", "degraded", 0.35, 0.25),
    ]


def _agents_10() -> list[AgentConfig]:
    return [
        # 3 healthy production
        AgentConfig("edictum-agent", "production", "enforce", "healthy", 0.08, 0.15),
        AgentConfig("deploy-bot", "production", "enforce", "healthy", 0.05, 0.12),
        AgentConfig("ops-agent", "production", "enforce", "healthy", 0.10, 0.10),
        # 2 healthy staging
        AgentConfig("research-bot", "staging", "observe", "healthy", 0.15, 0.10),
        AgentConfig("qa-runner", "staging", "enforce", "healthy", 0.12, 0.08),
        # 1 healthy dev
        AgentConfig("dev-assistant", "development", "observe", "healthy", 0.10, 0.07),
        # 2 degraded
        AgentConfig("devops-agent", "production", "enforce", "degraded", 0.40, 0.13),
        AgentConfig("data-pipeline", "production", "enforce", "degraded", 0.30, 0.10),
        # 2 offline
        AgentConfig("legacy-scraper", "staging", "observe", "offline", 0.10, 0.08),
        AgentConfig("migration-bot", "production", "enforce", "offline", 0.15, 0.07),
    ]


AGENT_CONFIGS: dict[int, list[AgentConfig]] = {
    1: _agents_1(),
    3: _agents_3(),
    10: _agents_10(),
}

DB_NAMES: dict[int, str] = {
    1: "edictum_1agent",
    3: "edictum_3agents",
    10: "edictum_10agents",
}

# Map source verdicts to the local schema's verdict vocabulary
VERDICT_MAP: dict[str, str] = {
    "call_denied": "denied",
    "call_allowed": "allowed",
    "allow": "allowed",
    "call_would_deny": "call_would_deny",
    "call_approval_requested": "pending_approval",
    "call_approval_granted": "allowed",
    "call_approval_denied": "denied",
    "call_approval_timeout": "denied",
    "call_executed": "allowed",
}

# Map source approval statuses to local vocabulary
APPROVAL_STATUS_MAP: dict[str, str] = {
    "approved": "approved",
    "denied": "denied",
    "timeout": "timed_out",
    "pending": "pending",
}


# ---------------------------------------------------------------------------
# Database creation via asyncpg
# ---------------------------------------------------------------------------

async def create_database(db_name: str) -> None:
    """Drop and recreate a Postgres database."""
    conn = await asyncpg.connect(
        host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASS, database="postgres",
    )
    try:
        await conn.execute(f"""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '{db_name}' AND pid <> pg_backend_pid()
        """)
        await conn.execute(f"DROP DATABASE IF EXISTS {db_name}")
        await conn.execute(f"CREATE DATABASE {db_name}")
        print(f"  [OK] Created database: {db_name}")
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# Alembic migrations via subprocess
# ---------------------------------------------------------------------------

def run_migrations(db_name: str) -> None:
    """Run alembic upgrade head for a specific database."""
    url = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{db_name}"
    env = os.environ.copy()
    env["EDICTUM_DATABASE_URL"] = url
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(PROJECT_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"  [FAIL] Alembic migration failed for {db_name}:")
        print(result.stderr)
        sys.exit(1)
    print(f"  [OK] Migrations applied: {db_name}")


# ---------------------------------------------------------------------------
# Source data fetching
# ---------------------------------------------------------------------------

async def fetch_source_data(
    source_url: str,
) -> tuple[list[dict], list[dict]]:
    """Fetch all events and approvals from the Neon source DB."""
    conn = await asyncpg.connect(source_url)
    try:
        raw_events = await conn.fetch("SELECT * FROM events ORDER BY timestamp")
        raw_approvals = await conn.fetch("SELECT * FROM approvals ORDER BY created_at")
    finally:
        await conn.close()

    events = [dict(r) for r in raw_events]
    approvals = [dict(r) for r in raw_approvals]

    print(f"  [OK] Fetched {len(events)} events, {len(approvals)} approvals from source")
    return events, approvals


def _parse_payload(raw: object) -> dict | None:
    """Parse a payload from the source DB into a dict."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
    return None


# ---------------------------------------------------------------------------
# Timestamp adjustment
# ---------------------------------------------------------------------------

def _shift_timestamp(
    ts: datetime,
    source_max: datetime,
    health: str,
) -> datetime:
    """Shift a source timestamp so it's relative to now.

    Preserves the relative ordering within the source data, but shifts
    the window to match the agent's health status.
    """
    now = datetime.now(UTC)
    age = (source_max - ts).total_seconds()

    if health == "healthy":
        # Compress into last 24h, with bias toward recent
        # Source data spans ~2 days, we compress to 24h
        new_age = age * 0.5  # compress
        # Add some jitter so events from different source agents don't stack
        new_age += random.uniform(-60, 60)
        new_age = max(0, new_age)
        # Cap at 24 hours
        if new_age > 24 * 3600:
            new_age = random.uniform(0, 24 * 3600)
    elif health == "degraded":
        # Shift to 2-24 hours ago range
        new_age = 7200 + age * 0.3
        new_age += random.uniform(-120, 120)
        new_age = max(7200, min(new_age, 24 * 3600))
    else:  # offline
        # Shift to 2-7 days ago
        new_age = 2 * 86400 + age * 1.5
        new_age += random.uniform(-3600, 3600)
        new_age = max(2 * 86400, min(new_age, 7 * 86400))

    return now - timedelta(seconds=new_age)


def _inject_recent_events(
    events: list[dict],
    health: str,
) -> list[dict]:
    """Inject a handful of very recent events for healthy agents.

    This ensures active_agents (1h window) shows these agents as online.
    """
    if health != "healthy" or not events:
        return events

    now = datetime.now(UTC)
    recent_count = max(3, len(events) // 10)  # ~10% of events in last 5 min

    # Pick random events and clone them with very recent timestamps
    for _ in range(recent_count):
        source = random.choice(events).copy()
        source["id"] = uuid.uuid4()
        source["call_id"] = str(uuid.uuid4())
        source["timestamp"] = now - timedelta(seconds=random.uniform(5, 300))
        source["created_at"] = source["timestamp"]
        events.append(source)

    return events


# ---------------------------------------------------------------------------
# Event cloning
# ---------------------------------------------------------------------------

def _clone_events_for_agent(
    source_events: list[dict],
    tenant_id: uuid.UUID,
    agent: AgentConfig,
    source_max_ts: datetime,
) -> list[dict]:
    """Clone a slice of source events, re-keyed for this agent."""
    # Take a proportional slice of source events
    count = max(1, int(len(source_events) * agent.event_share))
    sampled = random.sample(source_events, min(count, len(source_events)))

    cloned: list[dict] = []
    for src in sampled:
        new_ts = _shift_timestamp(src["timestamp"], source_max_ts, agent.health)

        # Determine verdict fresh based on agent config, ignoring source
        # verdict (source has skewed observe-mode distribution).
        # Use denial_rate as the probability of a non-allowed outcome.
        roll = random.random()
        if agent.mode == "observe":
            if roll < agent.denial_rate:
                verdict = "call_would_deny"
            else:
                verdict = "allowed"
        else:
            # Enforce mode
            if roll < agent.denial_rate:
                verdict = "denied"
            elif roll < agent.denial_rate + 0.05:
                verdict = "pending_approval"
            else:
                verdict = "allowed"

        # Parse and adapt payload
        payload = _parse_payload(src.get("payload"))
        if payload:
            payload = {**payload}  # shallow copy
            payload["env"] = agent.env
            payload["mode"] = agent.mode
            payload["agent_id"] = agent.agent_id
        else:
            payload = {
                "decision_name": random.choice([
                    "data-access-policy", "deployment-gate", "cost-threshold",
                    "pii-filter", "rate-limiter", "approval-required",
                ]),
                "policy_version": random.choice(["v1.0", "v1.1", "v2.0"]),
                "env": agent.env,
                "mode": agent.mode,
                "agent_id": agent.agent_id,
            }

        cloned.append({
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "call_id": str(uuid.uuid4()),
            "agent_id": agent.agent_id,
            "tool_name": src["tool_name"],
            "verdict": verdict,
            "mode": agent.mode,
            "timestamp": new_ts,
            "created_at": new_ts,
            "payload": payload,
        })

    # Inject recent events for healthy agents
    cloned = _inject_recent_events(cloned, agent.health)

    return cloned


# ---------------------------------------------------------------------------
# Approval cloning
# ---------------------------------------------------------------------------

def _clone_approvals_for_agents(
    source_approvals: list[dict],
    tenant_id: uuid.UUID,
    agents: list[AgentConfig],
    source_max_ts: datetime,
) -> list[dict]:
    """Clone source approvals, distributing across agents."""
    now = datetime.now(UTC)
    cloned: list[dict] = []

    # Divide source approvals among agents (proportional to event_share)
    shuffled = list(source_approvals)
    random.shuffle(shuffled)
    idx = 0

    for agent in agents:
        count = max(2, int(len(source_approvals) * agent.event_share))
        agent_slice = shuffled[idx:idx + count]
        idx += count
        if idx >= len(shuffled):
            idx = 0

        for src in agent_slice:
            new_ts = _shift_timestamp(src["created_at"], source_max_ts, agent.health)
            status = APPROVAL_STATUS_MAP.get(src["status"], src["status"])

            # Parse tool_args
            tool_args = src.get("tool_args")
            if isinstance(tool_args, str):
                try:
                    tool_args = json.loads(tool_args)
                except (json.JSONDecodeError, TypeError):
                    tool_args = None

            decided_at = None
            decided_by = None
            decided_via = None
            decision_reason = None

            if status != "pending":
                decided_at = new_ts + timedelta(seconds=random.randint(10, 600))
                if status == "timed_out":
                    decided_at = new_ts + timedelta(seconds=src.get("timeout_seconds", 300))
                else:
                    decided_by = src.get("decided_by") or ADMIN_EMAIL
                    decided_via = random.choice(["dashboard", "telegram"])
                    decision_reason = (
                        "Approved by admin" if status == "approved"
                        else "Denied: policy violation"
                    )

            cloned.append({
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "agent_id": agent.agent_id,
                "tool_name": src["tool_name"],
                "tool_args": tool_args,
                "message": src.get("message", "Approval required"),
                "status": status,
                "env": agent.env,
                "timeout_seconds": src.get("timeout_seconds", 300),
                "timeout_effect": src.get("timeout_effect", "deny"),
                "decision_source": random.choice([
                    "yaml_precondition", "data-access-policy", "deployment-gate",
                    "cost-threshold", "approval-required",
                ]),
                "contract_name": random.choice(CONTRACT_NAMES),
                "decided_by": decided_by,
                "decided_at": decided_at,
                "decision_reason": decision_reason,
                "decided_via": decided_via,
                "created_at": new_ts,
            })

    # Add fresh pending approvals (live countdown timers in UI)
    active_agents = [a for a in agents if a.health != "offline"]
    pending_count = random.randint(
        max(2, len(active_agents)),
        min(8, len(active_agents) * 3),
    )

    for _ in range(pending_count):
        agent = random.choice(active_agents)
        # Pick a random source approval for realistic tool_name/message
        src = random.choice(source_approvals)

        tool_args = src.get("tool_args")
        if isinstance(tool_args, str):
            try:
                tool_args = json.loads(tool_args)
            except (json.JSONDecodeError, TypeError):
                tool_args = None

        # Created 10 seconds to 3 minutes ago (so timers tick)
        created = now - timedelta(seconds=random.randint(10, 180))
        timeout_secs = random.choice([60, 120, 180, 300, 600])

        cloned.append({
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "agent_id": agent.agent_id,
            "tool_name": src["tool_name"],
            "tool_args": tool_args,
            "message": src.get("message", "Approval required"),
            "status": "pending",
            "env": agent.env,
            "timeout_seconds": timeout_secs,
            "timeout_effect": random.choice(["deny", "allow"]),
            "decision_source": random.choice([
                "yaml_precondition", "data-access-policy", "deployment-gate",
            ]),
            "contract_name": random.choice(CONTRACT_NAMES),
            "decided_by": None,
            "decided_at": None,
            "decision_reason": None,
            "decided_via": None,
            "created_at": created,
        })

    return cloned


# ---------------------------------------------------------------------------
# Bundle + deployment generation (synthetic, source has none)
# ---------------------------------------------------------------------------

def _generate_bundles_and_deployments(
    tenant_id: uuid.UUID,
    agents: list[AgentConfig],
) -> tuple[list[dict], list[dict]]:
    """Generate contract bundle history and deployments."""
    now = datetime.now(UTC)
    bundles: list[dict] = []
    deployments: list[dict] = []
    envs_seen = sorted({a.env for a in agents})

    for version in range(1, 4):
        created = now - timedelta(days=7 - version * 2, hours=random.randint(0, 12))
        bundles.append({
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "version": version,
            "revision_hash": uuid.uuid4().hex,
            "yaml_bytes": f"# Contract bundle v{version}\nversion: {version}\n".encode(),
            "signature": None,
            "source_hub_slug": None,
            "source_hub_revision": None,
            "uploaded_by": ADMIN_EMAIL,
            "created_at": created,
        })

        for env in envs_seen:
            deployments.append({
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "env": env,
                "bundle_version": version,
                "deployed_by": ADMIN_EMAIL,
                "created_at": created + timedelta(minutes=5),
            })

    return bundles, deployments


# ---------------------------------------------------------------------------
# Seed one database
# ---------------------------------------------------------------------------

async def seed_database(
    agent_count: int,
    source_events: list[dict],
    source_approvals: list[dict],
) -> None:
    """Create, migrate, and seed one database."""
    db_name = DB_NAMES[agent_count]
    agents = AGENT_CONFIGS[agent_count]

    print(f"\n{'='*60}")
    print(f"Seeding {db_name} ({agent_count} agent(s))")
    print(f"{'='*60}")

    # 1. Create database
    await create_database(db_name)

    # 2. Run migrations
    run_migrations(db_name)

    # 3. Connect with SQLAlchemy
    url = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{db_name}"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # Compute source timestamp range
    event_timestamps = [e["timestamp"] for e in source_events if e.get("timestamp")]
    approval_timestamps = [a["created_at"] for a in source_approvals if a.get("created_at")]
    all_source_ts = event_timestamps + approval_timestamps
    source_max_ts = max(all_source_ts) if all_source_ts else datetime.now(UTC)

    async with session_factory() as session:
        # Ensure partitions exist
        await session.execute(text("SELECT ensure_event_partitions(6)"))
        await session.commit()

        # 4. Create tenant
        tenant_id = uuid.uuid4()
        tenant = Tenant(id=tenant_id, name="Edictum Demo")
        session.add(tenant)
        await session.flush()
        print(f"  [OK] Tenant: {tenant_id}")

        # 5. Create admin user
        password_hash = LocalAuthProvider.hash_password(ADMIN_PASSWORD)
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            email=ADMIN_EMAIL,
            password_hash=password_hash,
            is_admin=True,
        )
        session.add(user)
        await session.flush()
        print(f"  [OK] Admin user: {ADMIN_EMAIL}")

        # 6. Create API keys
        envs_needed = sorted({a.env for a in agents})
        api_keys_created: list[str] = []
        for env in envs_needed:
            full_key, prefix, key_hash = generate_api_key(env)
            api_key = ApiKey(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                key_prefix=prefix,
                key_hash=key_hash,
                env=env,
                label=f"seed-{env}",
            )
            session.add(api_key)
            api_keys_created.append(f"{env}: {full_key}")
        await session.flush()
        for key_info in api_keys_created:
            print(f"  [OK] API key ({key_info})")

        # 7. Create bundles and deployments
        bundles, deployments = _generate_bundles_and_deployments(tenant_id, agents)
        for b in bundles:
            session.add(Bundle(**b))
        for d in deployments:
            session.add(Deployment(**d))
        await session.flush()
        print(f"  [OK] Bundles: {len(bundles)}, Deployments: {len(deployments)}")

        # 8. Clone events from source
        all_events: list[dict] = []
        for agent in agents:
            cloned = _clone_events_for_agent(
                source_events, tenant_id, agent, source_max_ts,
            )
            all_events.extend(cloned)
            print(f"  [..] {agent.agent_id}: {len(cloned)} events")

        if all_events:
            await session.execute(
                Event.__table__.insert(),  # type: ignore[attr-defined]
                all_events,
            )
        print(f"  [OK] Events total: {len(all_events)}")

        # 9. Clone approvals from source
        all_approvals = _clone_approvals_for_agents(
            source_approvals, tenant_id, agents, source_max_ts,
        )
        if all_approvals:
            await session.execute(
                Approval.__table__.insert(),  # type: ignore[attr-defined]
                all_approvals,
            )
        pending = sum(1 for a in all_approvals if a["status"] == "pending")
        decided = len(all_approvals) - pending
        print(f"  [OK] Approvals: {len(all_approvals)} ({decided} decided, {pending} pending)")

        await session.commit()

    await engine.dispose()

    # 10. Print stats summary
    await _print_stats(url, tenant_id)


async def _print_stats(url: str, tenant_id: uuid.UUID) -> None:
    """Query and print stats to verify seeded data is meaningful."""
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        now = datetime.now(UTC)
        one_hour_ago = now - timedelta(hours=1)
        twenty_four_hours_ago = now - timedelta(hours=24)

        r = await session.execute(
            text("SELECT count(*) FROM approvals WHERE tenant_id = :tid AND status = 'pending'"),
            {"tid": tenant_id},
        )
        pending = r.scalar() or 0

        r = await session.execute(
            text(
                "SELECT count(DISTINCT agent_id) FROM events "
                "WHERE tenant_id = :tid AND timestamp >= :since"
            ),
            {"tid": tenant_id, "since": one_hour_ago},
        )
        active = r.scalar() or 0

        r = await session.execute(
            text("SELECT count(DISTINCT agent_id) FROM events WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        total = r.scalar() or 0

        r = await session.execute(
            text(
                "SELECT count(*) FROM events "
                "WHERE tenant_id = :tid AND timestamp >= :since"
            ),
            {"tid": tenant_id, "since": twenty_four_hours_ago},
        )
        events_24h = r.scalar() or 0

        r = await session.execute(
            text(
                "SELECT count(*) FROM events "
                "WHERE tenant_id = :tid AND timestamp >= :since AND verdict = 'denied'"
            ),
            {"tid": tenant_id, "since": twenty_four_hours_ago},
        )
        denials = r.scalar() or 0

        r = await session.execute(
            text(
                "SELECT count(*) FROM events "
                "WHERE tenant_id = :tid AND timestamp >= :since "
                "AND mode = 'observe' AND verdict = 'call_would_deny'"
            ),
            {"tid": tenant_id, "since": twenty_four_hours_ago},
        )
        observe = r.scalar() or 0

        r = await session.execute(
            text(
                "SELECT count(DISTINCT payload->>'decision_name') FROM events "
                "WHERE tenant_id = :tid AND timestamp >= :since "
                "AND payload->>'decision_name' IS NOT NULL"
            ),
            {"tid": tenant_id, "since": twenty_four_hours_ago},
        )
        contracts = r.scalar() or 0

    await engine.dispose()

    print(f"\n  --- Stats verification ---")
    print(f"  pending_approvals:       {pending}")
    print(f"  active_agents (1h):      {active}")
    print(f"  total_agents:            {total}")
    print(f"  events_24h:              {events_24h}")
    print(f"  denials_24h:             {denials}")
    print(f"  observe_findings_24h:    {observe}")
    print(f"  contracts_triggered_24h: {contracts}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed test databases for edictum-console dashboard development.",
    )
    parser.add_argument(
        "--agents",
        type=int,
        choices=[1, 3, 10],
        default=None,
        help="Seed only the database for this agent count (default: all).",
    )
    parser.add_argument(
        "--source-url",
        type=str,
        default=DEFAULT_SOURCE_URL,
        help="Source Postgres URL to read events/approvals from.",
    )
    args = parser.parse_args()

    targets = [args.agents] if args.agents else [1, 3, 10]

    print("Edictum Console — Seed Test Data")
    print(f"Postgres: {PG_USER}@{PG_HOST}:{PG_PORT}")
    print(f"Targets: {', '.join(DB_NAMES[t] for t in targets)}")

    # Fetch source data once
    print("\nFetching source data from Neon...")
    source_events, source_approvals = asyncio.run(
        fetch_source_data(args.source_url)
    )

    for target in targets:
        asyncio.run(seed_database(target, source_events, source_approvals))

    print(f"\n{'='*60}")
    print("Done! Switch databases in .env:")
    for t in targets:
        url = f"postgresql+asyncpg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{DB_NAMES[t]}"
        print(f"  EDICTUM_DATABASE_URL={url}")
    print(f"Login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    main()
