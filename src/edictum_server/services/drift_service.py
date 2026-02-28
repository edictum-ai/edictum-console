"""Drift detection between deployed bundles and agent-reported versions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment


async def check_drift(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    policy_version: str,
    env: str,
) -> str:
    """Check if an agent's reported policy_version matches the current deployment.

    Args:
        db: Active async database session.
        tenant_id: Owning tenant UUID.
        policy_version: The revision_hash reported by the agent.
        env: The environment to check against.

    Returns:
        ``"current"`` if the hash matches the latest deployment,
        ``"drift"`` if it doesn't match, or
        ``"unknown"`` if there's no deployment for the environment.
    """
    # Find the latest deployment for this env
    dep_result = await db.execute(
        select(Deployment)
        .where(Deployment.tenant_id == tenant_id, Deployment.env == env)
        .order_by(Deployment.created_at.desc())
        .limit(1)
    )
    deployment = dep_result.scalar_one_or_none()
    if deployment is None:
        return "unknown"

    # Look up the bundle to get its revision_hash
    bundle_result = await db.execute(
        select(Bundle.revision_hash).where(
            Bundle.tenant_id == tenant_id,
            Bundle.name == deployment.bundle_name,
            Bundle.version == deployment.bundle_version,
        )
    )
    deployed_hash = bundle_result.scalar_one_or_none()
    if deployed_hash is None:
        return "unknown"

    return "current" if deployed_hash == policy_version else "drift"
