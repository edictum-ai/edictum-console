"""Service for assignment rule CRUD and bundle resolution."""
from __future__ import annotations

import fnmatch
import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import AgentRegistration, AssignmentRule


async def resolve_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    agent_tags: dict | None = None,
    agent_provided_bundle: str | None = None,
) -> tuple[str | None, str, uuid.UUID | None, str | None]:
    """Resolve which bundle an agent should receive.

    Resolution order (highest priority first):
    1. Explicit bundle_name on AgentRegistration
    2. First matching AssignmentRule by priority (lower = first)
    3. Agent-provided bundle_name from SSE query param

    Returns: (bundle_name, source, rule_id, rule_pattern)
    - source: "explicit" | "rule" | "agent_provided" | "none"
    """
    # (1) Check explicit assignment
    reg_result = await db.execute(
        select(AgentRegistration).where(
            AgentRegistration.tenant_id == tenant_id,
            AgentRegistration.agent_id == agent_id,
        )
    )
    agent_reg = reg_result.scalar_one_or_none()
    if agent_reg and agent_reg.bundle_name:
        return (agent_reg.bundle_name, "explicit", None, None)

    # (2) Check assignment rules (ordered by priority ASC)
    rules_result = await db.execute(
        select(AssignmentRule)
        .where(AssignmentRule.tenant_id == tenant_id)
        .order_by(AssignmentRule.priority.asc())
    )
    rules = rules_result.scalars().all()

    effective_tags: dict = {}
    if agent_reg and agent_reg.tags:
        effective_tags = agent_reg.tags
    if agent_tags:
        effective_tags = {**effective_tags, **agent_tags}

    for rule in rules:
        # Check agent_id glob pattern
        if not fnmatch.fnmatch(agent_id, rule.pattern):
            continue
        # Check tag matching (AND logic — all tags in rule must match)
        if rule.tag_match:
            if not all(
                effective_tags.get(k) == v
                for k, v in rule.tag_match.items()
            ):
                continue
        return (rule.bundle_name, "rule", rule.id, rule.pattern)

    # (3) Fall back to agent-provided bundle_name
    if agent_provided_bundle:
        return (agent_provided_bundle, "agent_provided", None, None)

    return (None, "none", None, None)


# --- Assignment Rule CRUD ---

async def list_rules(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[AssignmentRule]:
    """List all assignment rules for a tenant, ordered by priority."""
    result = await db.execute(
        select(AssignmentRule)
        .where(AssignmentRule.tenant_id == tenant_id)
        .order_by(AssignmentRule.priority.asc())
    )
    return list(result.scalars().all())


async def create_rule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    priority: int,
    pattern: str,
    tag_match: dict | None,
    bundle_name: str,
    env: str,
) -> AssignmentRule:
    """Create a new assignment rule.

    Raises IntegrityError if priority conflicts with existing rule for this tenant.
    """
    rule = AssignmentRule(
        tenant_id=tenant_id,
        priority=priority,
        pattern=pattern,
        tag_match=tag_match,
        bundle_name=bundle_name,
        env=env,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    rule_id: uuid.UUID,
    **kwargs: object,
) -> AssignmentRule | None:
    """Update an existing assignment rule. Only non-None kwargs are applied."""
    values = {k: v for k, v in kwargs.items() if v is not None}
    if not values:
        result = await db.execute(
            select(AssignmentRule).where(
                AssignmentRule.id == rule_id,
                AssignmentRule.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    await db.execute(
        update(AssignmentRule)
        .where(
            AssignmentRule.id == rule_id,
            AssignmentRule.tenant_id == tenant_id,
        )
        .values(**values)
    )
    await db.commit()
    result = await db.execute(
        select(AssignmentRule).where(
            AssignmentRule.id == rule_id,
            AssignmentRule.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_rule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    rule_id: uuid.UUID,
) -> bool:
    """Delete an assignment rule. Returns True if deleted, False if not found."""
    result = await db.execute(
        delete(AssignmentRule).where(
            AssignmentRule.id == rule_id,
            AssignmentRule.tenant_id == tenant_id,
        )
    )
    await db.commit()
    return result.rowcount > 0  # type: ignore[return-value]
