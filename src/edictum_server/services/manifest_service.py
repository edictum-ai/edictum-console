"""Service for storing and retrieving agent contract manifests.

Gate agents push a manifest (list of locally-evaluated contracts) alongside
their audit events. The manifest enables coverage analysis for agents that
use local contracts rather than console-deployed bundles.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import AgentRegistration
from edictum_server.schemas.events import AgentManifest


async def store_agent_manifest(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    manifest: AgentManifest,
) -> None:
    """Upsert agent registration with the contract manifest.

    Creates the registration if it doesn't exist (Gate agents may not
    connect via SSE, only via event sync).
    """
    result = await db.execute(
        select(AgentRegistration).where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id == manifest.agent_id,
        )
    )
    reg = result.scalar_one_or_none()

    manifest_data = {
        "policy_version": manifest.policy_version,
        "contracts": [c.model_dump() for c in manifest.contracts],
        "updated_at": datetime.now(UTC).isoformat(),
    }

    if reg is None:
        reg = AgentRegistration(
            tenant_id=tenant_id,
            agent_id=manifest.agent_id,
            manifest=manifest_data,
            last_seen_at=datetime.now(UTC),
        )
        db.add(reg)
    else:
        reg.manifest = manifest_data
        reg.last_seen_at = datetime.now(UTC)


async def get_agent_manifest(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
) -> dict | None:
    """Load the stored manifest for an agent, or None if not available."""
    result = await db.execute(
        select(AgentRegistration.manifest).where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id == agent_id,
        )
    )
    return result.scalar_one_or_none()
