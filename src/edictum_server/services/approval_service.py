"""Service for managing HITL approval requests."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.expression import ColumnElement

from edictum_server.db.models import Approval
from edictum_server.schemas.approvals import CreateApprovalRequest


class _ApprovalExpired(ColumnElement[bool]):
    """DB-portable expression: created_at + timeout_seconds <= now()."""

    inherit_cache = True
    type = sa.Boolean()


@compiles(_ApprovalExpired)
def _compile_pg(element: Any, compiler: Any, **kw: Any) -> str:  # noqa: ARG001
    return "approvals.created_at + (approvals.timeout_seconds * interval '1 second') <= now()"


@compiles(_ApprovalExpired, "sqlite")
def _compile_sqlite(element: Any, compiler: Any, **kw: Any) -> str:  # noqa: ARG001
    return (
        "(cast(strftime('%s', 'now') as integer)"
        " - cast(strftime('%s', approvals.created_at) as integer))"
        " >= approvals.timeout_seconds"
    )


async def create_approval(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    request: CreateApprovalRequest,
    *,
    env: str = "production",
) -> Approval:
    """Create a pending approval request."""
    approval = Approval(
        tenant_id=tenant_id,
        agent_id=request.agent_id,
        tool_name=request.tool_name,
        tool_args=request.tool_args,
        message=request.message,
        status="pending",
        env=env,
        timeout_seconds=request.timeout,
        timeout_effect=request.timeout_effect,
    )
    db.add(approval)
    await db.flush()
    return approval


async def get_approval(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    approval_id: uuid.UUID,
) -> Approval | None:
    """Get a single approval by ID, scoped to tenant."""
    result = await db.execute(
        select(Approval).where(
            Approval.id == approval_id,
            Approval.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def list_pending_approvals(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[Approval]:
    """List all pending approvals for a tenant."""
    result = await db.execute(
        select(Approval)
        .where(Approval.tenant_id == tenant_id, Approval.status == "pending")
        .order_by(Approval.created_at.desc())
    )
    return list(result.scalars().all())


async def submit_decision(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    approval_id: uuid.UUID,
    approved: bool,
    decided_by: str | None = None,
    reason: str | None = None,
) -> Approval | None:
    """Submit a human decision on a pending approval.

    Returns None if not found or already decided.
    """
    approval = await get_approval(db, tenant_id, approval_id)
    if approval is None or approval.status != "pending":
        return None

    approval.status = "approved" if approved else "denied"
    approval.decided_by = decided_by
    approval.decided_at = datetime.now(UTC)
    approval.decision_reason = reason
    await db.flush()
    return approval


async def expire_approvals(db: AsyncSession) -> list[dict[str, Any]]:
    """Expire all pending approvals past their deadline.

    Computes expiration in SQL: created_at + timeout_seconds <= now().
    Sets status to 'timeout'. Returns list of expired approval info for SSE push.
    """
    # SELECT first to capture info needed for SSE notifications
    result = await db.execute(
        select(Approval.id, Approval.env, Approval.agent_id, Approval.tool_name)
        .where(Approval.status == "pending")
        .where(_ApprovalExpired())
    )
    rows = result.all()

    if not rows:
        return []

    expired_ids = [row.id for row in rows]
    await db.execute(update(Approval).where(Approval.id.in_(expired_ids)).values(status="timeout"))

    return [
        {
            "id": str(row.id),
            "env": row.env,
            "agent_id": row.agent_id,
            "tool_name": row.tool_name,
        }
        for row in rows
    ]
