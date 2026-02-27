"""Insert fresh pending approvals into edictum_10agents.

Usage:
    python scripts/refresh_approvals.py
"""

from __future__ import annotations

import asyncio
import json
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from edictum_server.db.models import Approval  # noqa: E402

DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/edictum_10agents"

# Realistic tool calls that would need approval
APPROVAL_SCENARIOS = [
    {
        "tool_name": "exec",
        "tool_args": {"command": "kubectl rollout restart deployment/api-gateway -n production"},
        "message": "Agent wants to restart the api-gateway deployment in production after detecting elevated error rates.",
        "contract_name": "production-safety",
        "decision_source": "deployment-gate",
    },
    {
        "tool_name": "write_file",
        "tool_args": {"path": "/etc/nginx/conf.d/rate-limit.conf", "content": "limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;"},
        "message": "Requesting permission to update nginx rate limiting configuration to mitigate ongoing traffic spike.",
        "contract_name": "compliance-strict",
        "decision_source": "yaml_precondition",
    },
    {
        "tool_name": "cron",
        "tool_args": {"schedule": "*/5 * * * *", "job": "python /opt/scripts/cleanup_stale_sessions.py"},
        "message": "Schedule a recurring job to clean up stale user sessions older than 24 hours.",
        "contract_name": "cost-governance",
        "decision_source": "data-access-policy",
    },
    {
        "tool_name": "exec",
        "tool_args": {"command": "psql -c 'ALTER TABLE users ADD COLUMN mfa_enabled boolean DEFAULT false'"},
        "message": "Database schema migration to add MFA column. Requires approval before modifying production database.",
        "contract_name": "production-safety",
        "decision_source": "approval-required",
    },
    {
        "tool_name": "http_request",
        "tool_args": {"method": "POST", "url": "https://api.stripe.com/v1/subscriptions/sub_abc123/cancel"},
        "message": "Cancel subscription for customer flagged by fraud detection pipeline. Irreversible action requires human confirmation.",
        "contract_name": "cost-governance",
        "decision_source": "cost-threshold",
    },
    {
        "tool_name": "exec",
        "tool_args": {"command": "aws s3 rm s3://prod-backups/archive-2025/ --recursive"},
        "message": "Requesting cleanup of old backup archives to reduce storage costs. Will delete 847 objects (2.3 TB).",
        "contract_name": "compliance-strict",
        "decision_source": "data-access-policy",
    },
]


async def main() -> None:
    engine = create_async_engine(DB_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        # Get tenant_id
        result = await session.execute(text("SELECT id FROM tenants LIMIT 1"))
        row = result.fetchone()
        if not row:
            print("ERROR: No tenant found in edictum_10agents")
            await engine.dispose()
            return
        tenant_id = row[0]
        print(f"Tenant: {tenant_id}")

        # Get existing agent_ids
        result = await session.execute(
            text("SELECT DISTINCT agent_id FROM events WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        agents = [r[0] for r in result.fetchall()]
        if not agents:
            agents = [
                "edictum-agent", "deploy-bot", "ops-agent",
                "devops-agent", "data-pipeline", "research-bot",
            ]
        print(f"Agents ({len(agents)}): {agents}")

        # Delete old pending approvals so we start fresh
        deleted = await session.execute(
            text("DELETE FROM approvals WHERE tenant_id = :tid AND status = 'pending'"),
            {"tid": tenant_id},
        )
        print(f"Deleted {deleted.rowcount} old pending approvals")

        # Insert 6 fresh pending approvals using ORM
        now = datetime.now(UTC)
        envs = ["production", "production", "staging", "production", "production", "staging"]
        timeout_choices = [300, 420, 480, 600]

        for i, scenario in enumerate(APPROVAL_SCENARIOS):
            agent_id = agents[i % len(agents)]
            created_at = now - timedelta(seconds=random.randint(5, 90))
            timeout_secs = random.choice(timeout_choices)

            approval = Approval(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                agent_id=agent_id,
                tool_name=scenario["tool_name"],
                tool_args=scenario["tool_args"],
                message=scenario["message"],
                status="pending",
                env=envs[i],
                timeout_seconds=timeout_secs,
                timeout_effect="deny" if i % 3 != 0 else "allow",
                decision_source=scenario["decision_source"],
                contract_name=scenario["contract_name"],
                created_at=created_at,
            )
            session.add(approval)

        await session.commit()
        print(f"Inserted {len(APPROVAL_SCENARIOS)} fresh pending approvals")

        # Verify
        result = await session.execute(
            text("SELECT count(*) FROM approvals WHERE tenant_id = :tid AND status = 'pending'"),
            {"tid": tenant_id},
        )
        count = result.scalar()
        print(f"\nVerification: {count} pending approvals in database")

        # Show what we inserted
        result = await session.execute(
            text("""
                SELECT agent_id, tool_name, timeout_seconds, timeout_effect,
                       created_at, contract_name
                FROM approvals
                WHERE tenant_id = :tid AND status = 'pending'
                ORDER BY created_at DESC
            """),
            {"tid": tenant_id},
        )
        print("\nFresh pending approvals:")
        for row in result.fetchall():
            ts = row[4]
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            age = (now - ts).total_seconds()
            print(
                f"  {row[0]:20s} | {row[1]:15s} | {row[2]:4d}s timeout "
                f"({row[3]:5s}) | {row[5]:20s} | {age:.0f}s ago"
            )

    await engine.dispose()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
