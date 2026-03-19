"""Adversarial tests for assignment rule environment filtering (issue #35).

Verifies that ``resolve_bundle()`` filters rules by the ``env`` parameter
so that a rule intended for ``production`` cannot silently match a
``staging`` or ``development`` agent.

Risk if bypassed: an agent in a non-production environment receives a
production-only contract bundle, or vice-versa -- violating environment
isolation guarantees.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import AgentRegistration, AssignmentRule
from edictum_server.services.assignment_service import resolve_bundle
from tests.conftest import TENANT_A_ID

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _insert_rule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    priority: int,
    pattern: str,
    bundle_name: str,
    env: str,
    tag_match: dict[str, str] | None = None,
) -> AssignmentRule:
    rule = AssignmentRule(
        tenant_id=tenant_id,
        priority=priority,
        pattern=pattern,
        bundle_name=bundle_name,
        env=env,
        tag_match=tag_match,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def _insert_agent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    bundle_name: str | None = None,
) -> AgentRegistration:
    reg = AgentRegistration(
        tenant_id=tenant_id,
        agent_id=agent_id,
        bundle_name=bundle_name,
        tags={},
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return reg


# ===========================================================================
# 1. Core bypass: production rule must NOT match staging agent
# ===========================================================================


async def test_production_rule_does_not_match_staging_agent(
    db_session: AsyncSession,
) -> None:
    """A rule created for ``production`` must be invisible when resolving
    with ``env='staging'``."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "finance-*",
        "prod-bundle",
        "production",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "finance-bot-1",
        env="staging",
    )
    assert bundle is None
    assert source == "none"


async def test_staging_rule_does_not_match_production_agent(
    db_session: AsyncSession,
) -> None:
    """A rule created for ``staging`` must be invisible when resolving
    with ``env='production'``."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "ops-*",
        "staging-bundle",
        "staging",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "ops-agent-1",
        env="production",
    )
    assert bundle is None
    assert source == "none"


async def test_development_rule_does_not_match_production_agent(
    db_session: AsyncSession,
) -> None:
    """``development`` rule must not bleed into ``production`` resolution."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "*",
        "dev-catch-all",
        "development",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "any-agent",
        env="production",
    )
    assert bundle is None
    assert source == "none"


# ===========================================================================
# 2. Positive: correct env DOES match
# ===========================================================================


async def test_matching_env_resolves_correctly(
    db_session: AsyncSession,
) -> None:
    """When ``env`` matches the rule's environment, resolution works."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "finance-*",
        "prod-bundle",
        "production",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "finance-bot-1",
        env="production",
    )
    assert bundle == "prod-bundle"
    assert source == "rule"


async def test_multiple_envs_same_pattern_correct_resolution(
    db_session: AsyncSession,
) -> None:
    """Same pattern for different envs returns the correct bundle per env."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "api-*",
        "prod-api-bundle",
        "production",
    )
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        2,
        "api-*",
        "staging-api-bundle",
        "staging",
    )

    prod_bundle, _, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "api-gateway",
        env="production",
    )
    assert prod_bundle == "prod-api-bundle"

    staging_bundle, _, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "api-gateway",
        env="staging",
    )
    assert staging_bundle == "staging-api-bundle"


# ===========================================================================
# 3. Explicit assignment ignores env filter (by design)
# ===========================================================================


async def test_explicit_assignment_not_affected_by_env(
    db_session: AsyncSession,
) -> None:
    """Explicit bundle_name on AgentRegistration always wins, regardless of
    the ``env`` parameter. Explicit assignments are environment-agnostic."""
    await _insert_agent(
        db_session,
        TENANT_A_ID,
        "pinned-agent",
        bundle_name="pinned-bundle",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "pinned-agent",
        env="staging",
    )
    assert bundle == "pinned-bundle"
    assert source == "explicit"


# ===========================================================================
# 4. None env (dashboard preview) still sees all rules
# ===========================================================================


async def test_none_env_returns_all_matching_rules(
    db_session: AsyncSession,
) -> None:
    """When ``env=None`` (dashboard preview), rules from all environments
    are considered. The highest-priority matching rule wins."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        10,
        "dash-*",
        "prod-dash",
        "production",
    )
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        5,
        "dash-*",
        "staging-dash",
        "staging",
    )

    # env=None: sees both, priority 5 (staging) wins
    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "dash-agent",
        env=None,
    )
    assert bundle == "staging-dash"
    assert source == "rule"


# ===========================================================================
# 5. Tag matching + env filtering combined
# ===========================================================================


async def test_tag_match_with_wrong_env_does_not_resolve(
    db_session: AsyncSession,
) -> None:
    """A rule that matches by pattern and tags but has the wrong env must
    not resolve."""
    await _insert_agent(db_session, TENANT_A_ID, "tagged-agent")
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "tagged-*",
        "tagged-prod-bundle",
        "production",
        tag_match={"role": "finance"},
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "tagged-agent",
        agent_tags={"role": "finance"},
        env="staging",
    )
    assert bundle is None
    assert source == "none"


async def test_tag_match_with_correct_env_resolves(
    db_session: AsyncSession,
) -> None:
    """Tag matching works correctly when the env also matches."""
    await _insert_agent(db_session, TENANT_A_ID, "tagged-agent-2")
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "tagged-*",
        "tagged-prod-bundle",
        "production",
        tag_match={"role": "finance"},
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "tagged-agent-2",
        agent_tags={"role": "finance"},
        env="production",
    )
    assert bundle == "tagged-prod-bundle"
    assert source == "rule"


# ===========================================================================
# 6. Priority ordering within same env
# ===========================================================================


async def test_priority_ordering_within_same_env(
    db_session: AsyncSession,
) -> None:
    """When multiple rules match for the same env, the lowest priority
    number wins."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        20,
        "multi-*",
        "low-prio",
        "production",
    )
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        5,
        "multi-*",
        "high-prio",
        "production",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "multi-agent",
        env="production",
    )
    assert bundle == "high-prio"
    assert source == "rule"


async def test_cross_env_rule_does_not_affect_priority(
    db_session: AsyncSession,
) -> None:
    """A higher-priority rule in another env must not hide a lower-priority
    rule in the correct env."""
    # Priority 1 in staging
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "prio-*",
        "staging-winner",
        "staging",
    )
    # Priority 10 in production
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        10,
        "prio-*",
        "prod-rule",
        "production",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "prio-agent",
        env="production",
    )
    assert bundle == "prod-rule"
    assert source == "rule"


# ===========================================================================
# 7. agent_provided bundle fallback with env filtering
# ===========================================================================


async def test_agent_provided_bundle_used_when_no_env_rules_match(
    db_session: AsyncSession,
) -> None:
    """When env filtering excludes all rules, ``agent_provided_bundle``
    is the fallback."""
    await _insert_rule(
        db_session,
        TENANT_A_ID,
        1,
        "fallback-*",
        "prod-only",
        "production",
    )

    bundle, source, _, _ = await resolve_bundle(
        db_session,
        TENANT_A_ID,
        "fallback-agent",
        agent_provided_bundle="agent-default",
        env="staging",
    )
    assert bundle == "agent-default"
    assert source == "agent_provided"
