"""Approval-queue endpoints -- ``/api/v1/approvals``."""

from __future__ import annotations

import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)


def _fire(coro: object) -> None:
    """Schedule a coroutine as a background task, logging any unhandled exception."""
    async def _run() -> None:
        try:
            await coro  # type: ignore[misc]
        except Exception:
            logger.exception("Unhandled error in background notification task")

    asyncio.create_task(_run())

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
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
from edictum_server.rate_limit import RateLimitExceeded, check_rate_limit
from edictum_server.redis.client import get_redis
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
        tool_args=approval.tool_args,
        message=approval.message,
        env=approval.env,
        timeout_seconds=approval.timeout_seconds,
        timeout_effect=approval.timeout_effect,
        decision_source=approval.decision_source,
        contract_name=approval.contract_name,
        decided_by=approval.decided_by,
        decided_at=approval.decided_at,
        decision_reason=approval.decision_reason,
        decided_via=approval.decided_via,
        created_at=approval.created_at,
    )


@router.post("", status_code=201, response_model=ApprovalResponse | dict)
async def create_approval(
    body: CreateApprovalRequest,
    request: Request,
    auth: AuthContext = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
    redis: aioredis.Redis = Depends(get_redis),
) -> ApprovalResponse | JSONResponse:
    """Create a pending approval request (agent-facing)."""
    agent_id = auth.agent_id or "unknown"
    rate_key = f"rate_limit:approval:{auth.tenant_id}:{agent_id}"
    try:
        await check_rate_limit(redis, rate_key, max_attempts=10, window_seconds=60)
    except RateLimitExceeded as exc:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many approval requests. Please slow down."},
            headers={"Retry-After": str(exc.retry_after)},
        )

    env = auth.env or "production"
    approval = await approval_service.create_approval(db, auth.tenant_id, body, env=env)
    await db.commit()

    event_data = {
        "type": "approval_created",
        "approval_id": str(approval.id),
        "agent_id": approval.agent_id,
        "tool_name": approval.tool_name,
        "message": approval.message,
    }
    push.push_to_env(env, event_data, tenant_id=auth.tenant_id)
    push.push_to_dashboard(auth.tenant_id, event_data)

    # Use NotificationManager from app.state instead of direct telegram_notifier
    notification_mgr = getattr(request.app.state, "notification_manager", None)
    if notification_mgr is not None:
        _fire(notification_mgr.notify_approval_request(
            approval_id=str(approval.id),
            agent_id=approval.agent_id,
            tool_name=approval.tool_name,
            tool_args=approval.tool_args,
            message=approval.message,
            env=approval.env,
            timeout_seconds=approval.timeout_seconds,
            timeout_effect=approval.timeout_effect,
            tenant_id=str(approval.tenant_id),
            contract_name=approval.contract_name,
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
    request: Request,
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
        decided_via=body.decided_via or "console",
    )
    if approval is None:
        raise HTTPException(status_code=409, detail="Approval not found or already decided.")
    await db.commit()

    decided_data = {
        "type": "approval_decided",
        "approval_id": str(approval.id),
        "status": approval.status,
        "decided_by": approval.decided_by,
    }
    push.push_to_env(approval.env, decided_data, tenant_id=auth.tenant_id)
    push.push_to_dashboard(auth.tenant_id, decided_data)

    notification_mgr = getattr(request.app.state, "notification_manager", None)
    if notification_mgr is not None:
        _fire(notification_mgr.notify_approval_decided(
            approval_id=str(approval.id),
            status=approval.status,
            decided_by=approval.decided_by,
            reason=approval.decision_reason,
            tenant_id=str(auth.tenant_id),
        ))

    return _to_response(approval)
