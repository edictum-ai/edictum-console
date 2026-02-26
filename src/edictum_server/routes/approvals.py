"""Approval-queue endpoints -- ``/api/v1/approvals``."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import (
    AuthContext,
    get_current_tenant,
    require_api_key,
)
from edictum_server.db.engine import get_db
from edictum_server.db.models import Approval
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.approvals import (
    ApprovalResponse,
    ApprovalStatusType,
    CreateApprovalRequest,
    SubmitDecisionRequest,
)
from edictum_server.services import approval_service

router = APIRouter(prefix="/api/v1/approvals", tags=["approvals"])


def _to_response(approval: Approval) -> ApprovalResponse:
    return ApprovalResponse(
        id=str(approval.id),
        status=approval.status,
        agent_id=approval.agent_id,
        tool_name=approval.tool_name,
        tool_args=approval.tool_args,  # type: ignore[arg-type]
        message=approval.message,
        env=approval.env,
        timeout_seconds=approval.timeout_seconds,
        timeout_effect=approval.timeout_effect,
        decided_by=approval.decided_by,
        decided_at=approval.decided_at,
        decision_reason=approval.decision_reason,
        created_at=approval.created_at,
    )


@router.post("", status_code=201, response_model=ApprovalResponse)
async def create_approval(
    body: CreateApprovalRequest,
    request: Request,
    auth: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> ApprovalResponse:
    """Create a pending approval request (agent-facing)."""
    env = auth.env or "production"
    approval = await approval_service.create_approval(db, auth.tenant_id, body, env=env)
    await db.commit()

    push.push_to_env(env, {
        "type": "approval_created",
        "approval_id": str(approval.id),
        "agent_id": approval.agent_id,
        "tool_name": approval.tool_name,
        "message": approval.message,
    })

    # Use NotificationManager from app.state instead of direct telegram_notifier
    notification_mgr = getattr(request.app.state, "notification_manager", None)
    if notification_mgr is not None:
        asyncio.create_task(notification_mgr.notify_approval_request(
            approval_id=str(approval.id),
            agent_id=approval.agent_id,
            tool_name=approval.tool_name,
            tool_args=approval.tool_args,
            message=approval.message,
            env=approval.env,
            timeout_seconds=approval.timeout_seconds,
            timeout_effect=approval.timeout_effect,
            tenant_id=str(approval.tenant_id),
        ))

    return _to_response(approval)


@router.get("/{approval_id}", response_model=ApprovalResponse)
async def get_approval(
    approval_id: uuid.UUID,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> ApprovalResponse:
    """Get a single approval by ID."""
    approval = await approval_service.get_approval(db, auth.tenant_id, approval_id)
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found.")
    return _to_response(approval)


@router.get("", response_model=list[ApprovalResponse])
async def list_approvals(
    status: ApprovalStatusType | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[ApprovalResponse]:
    """List approvals, optionally filtered by status."""
    stmt = select(Approval).where(Approval.tenant_id == auth.tenant_id)
    if status:
        stmt = stmt.where(Approval.status == status)
    stmt = stmt.order_by(Approval.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    approvals = list(result.scalars().all())
    return [_to_response(a) for a in approvals]


@router.put("/{approval_id}", response_model=ApprovalResponse)
async def submit_decision(
    approval_id: uuid.UUID,
    body: SubmitDecisionRequest,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> ApprovalResponse:
    """Submit a human decision on a pending approval."""
    approval = await approval_service.submit_decision(
        db,
        auth.tenant_id,
        approval_id,
        approved=body.approved,
        decided_by=body.decided_by,
        reason=body.reason,
    )
    if approval is None:
        raise HTTPException(
            status_code=409, detail="Approval not found or already decided."
        )
    await db.commit()

    push.push_to_env(approval.env, {
        "type": "approval_decided",
        "approval_id": str(approval.id),
        "status": approval.status,
        "decided_by": approval.decided_by,
    })

    return _to_response(approval)
