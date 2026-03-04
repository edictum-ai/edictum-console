"""Assignment rule CRUD endpoints (dashboard auth)."""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.agent_registrations import (
    AssignmentRuleCreate,
    AssignmentRuleResponse,
    AssignmentRuleUpdate,
    ResolvedAssignment,
)
from edictum_server.services import assignment_service as svc

router = APIRouter(prefix="/api/v1/assignment-rules", tags=["assignment-rules"])

_VALID_PATTERN = re.compile(r"^[\x20-\x7E]{1,200}$")
_FORBIDDEN_CHARS = re.compile(r"[/\\]|\x00")


def _validate_pattern(pattern: str) -> None:
    """Validate a glob pattern for assignment rules."""
    if not _VALID_PATTERN.match(pattern):
        raise HTTPException(
            status_code=400,
            detail="Pattern must be 1-200 printable ASCII characters",
        )
    if _FORBIDDEN_CHARS.search(pattern):
        raise HTTPException(
            status_code=400,
            detail="Pattern must not contain path separators or null bytes",
        )


def _to_response(rule: object) -> AssignmentRuleResponse:
    from edictum_server.db.models import AssignmentRule

    assert isinstance(rule, AssignmentRule)
    return AssignmentRuleResponse(
        id=rule.id,
        priority=rule.priority,
        pattern=rule.pattern,
        tag_match=rule.tag_match,
        bundle_name=rule.bundle_name,
        env=rule.env,
        created_at=rule.created_at,
    )


@router.get("", response_model=list[AssignmentRuleResponse])
async def list_rules(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[AssignmentRuleResponse]:
    """List all assignment rules for the tenant, ordered by priority."""
    rules = await svc.list_rules(db, auth.tenant_id)
    return [_to_response(r) for r in rules]


@router.post("", response_model=AssignmentRuleResponse, status_code=201)
async def create_rule(
    body: AssignmentRuleCreate,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> AssignmentRuleResponse:
    """Create a new assignment rule."""
    _validate_pattern(body.pattern)

    try:
        rule = await svc.create_rule(
            db,
            auth.tenant_id,
            priority=body.priority,
            pattern=body.pattern,
            tag_match=body.tag_match,
            bundle_name=body.bundle_name,
            env=body.env,
        )
    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail=f"Priority {body.priority} already exists for this tenant",
        )

    push.push_to_dashboard(
        auth.tenant_id,
        {"type": "assignment_changed", "rule_id": str(rule.id), "action": "created"},
    )

    return _to_response(rule)


@router.patch("/{rule_id}", response_model=AssignmentRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    body: AssignmentRuleUpdate,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> AssignmentRuleResponse:
    """Update an existing assignment rule."""
    if body.pattern is not None:
        _validate_pattern(body.pattern)

    kwargs = body.model_dump(exclude_none=True)
    try:
        rule = await svc.update_rule(db, auth.tenant_id, rule_id, **kwargs)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Priority conflict")

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    push.push_to_dashboard(
        auth.tenant_id,
        {"type": "assignment_changed", "rule_id": str(rule.id), "action": "updated"},
    )

    return _to_response(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> None:
    """Delete an assignment rule."""
    deleted = await svc.delete_rule(db, auth.tenant_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")

    push.push_to_dashboard(
        auth.tenant_id,
        {"type": "assignment_changed", "rule_id": str(rule_id), "action": "deleted"},
    )


@router.get("/resolve/{agent_id}", response_model=ResolvedAssignment)
async def resolve_agent_bundle(
    agent_id: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ResolvedAssignment:
    """Preview which bundle an agent would receive (dry-run resolution)."""
    bundle_name, source, rule_id, rule_pattern = await svc.resolve_bundle(
        db, auth.tenant_id, agent_id
    )
    return ResolvedAssignment(
        bundle_name=bundle_name,
        source=source,
        rule_id=rule_id,
        rule_pattern=rule_pattern,
    )
