"""Service for agent registration operations."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import AgentRegistration

# Sentinel for "field not provided" vs "field explicitly set to None".
_UNSET: Any = object()


async def upsert_agent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
) -> AgentRegistration:
    """Upsert agent registration on SSE connect (auto-register).

    Creates the registration if it doesn't exist, updates last_seen_at if it does.
    Uses Postgres INSERT ... ON CONFLICT for atomicity.
    """
    now = datetime.now(UTC)
    stmt = (
        pg_insert(AgentRegistration)
        .values(
            tenant_id=tenant_id,
            agent_id=agent_id,
            last_seen_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_agent_reg_tenant_agent",
            set_={"last_seen_at": now},
        )
        .returning(AgentRegistration)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.scalar_one()


async def list_agents(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[AgentRegistration]:
    """List all registered agents for a tenant."""
    result = await db.execute(
        select(AgentRegistration)
        .where(AgentRegistration.tenant_id == tenant_id)
        .order_by(AgentRegistration.agent_id)
    )
    return list(result.scalars().all())


async def get_agent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
) -> AgentRegistration | None:
    """Get a single agent registration by agent_id (not UUID)."""
    result = await db.execute(
        select(AgentRegistration).where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id == agent_id,
        )
    )
    return result.scalar_one_or_none()


async def update_agent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    *,
    display_name: str | None = _UNSET,
    tags: dict | None = _UNSET,
    bundle_name: str | None = _UNSET,
) -> AgentRegistration | None:
    """Update agent registration fields. Use sentinel (_UNSET) to skip fields."""
    values: dict[str, Any] = {}
    if display_name is not _UNSET:
        values["display_name"] = display_name
    if tags is not _UNSET:
        values["tags"] = tags
    if bundle_name is not _UNSET:
        values["bundle_name"] = bundle_name

    if not values:
        return await get_agent(db, tenant_id, agent_id)

    await db.execute(
        update(AgentRegistration)
        .where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id == agent_id,
        )
        .values(**values)
    )
    await db.commit()
    return await get_agent(db, tenant_id, agent_id)


async def bulk_assign(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_ids: list[str],
    bundle_name: str,
) -> int:
    """Assign a bundle to multiple agents at once. Returns count of updated rows."""
    result = await db.execute(
        update(AgentRegistration)
        .where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id.in_(agent_ids),
        )
        .values(bundle_name=bundle_name)
    )
    await db.commit()
    return result.rowcount  # type: ignore[return-value]
