"""Adversarial tests for Phase 2 Agent Assignment.

Covers cross-tenant isolation, pattern injection, priority conflicts,
and resolution logic for AgentRegistration and AssignmentRule endpoints.

Risk if bypassed: Cross-tenant agent data leak, unauthorized bundle assignment.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import AgentRegistration, AssignmentRule
from tests.conftest import TENANT_A_ID, TENANT_B_ID

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_agent_reg(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agent_id: str,
    *,
    bundle_name: str | None = None,
    tags: dict | None = None,
) -> AgentRegistration:
    """Insert an AgentRegistration directly via DB (bypasses pg_insert)."""
    reg = AgentRegistration(
        tenant_id=tenant_id,
        agent_id=agent_id,
        bundle_name=bundle_name,
        tags=tags or {},
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return reg


async def _create_rule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    priority: int,
    pattern: str,
    bundle_name: str,
    env: str = "production",
    tag_match: dict | None = None,
) -> AssignmentRule:
    """Insert an AssignmentRule directly via DB."""
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


# ===========================================================================
# 1. Cross-Tenant Isolation (highest priority, ~8 tests)
# ===========================================================================


async def test_tenant_a_cannot_list_tenant_b_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant A listing registrations must not see Tenant B's agents."""
    # Create agent in Tenant B
    await _create_agent_reg(db_session, TENANT_B_ID, "secret-agent-b")

    # Tenant A lists — must not see it
    resp = await client.get("/api/v1/agent-registrations")
    assert resp.status_code == 200
    agent_ids = [a["agent_id"] for a in resp.json()]
    assert "secret-agent-b" not in agent_ids


async def test_tenant_a_cannot_update_tenant_b_agent(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """PATCH /agent-registrations/{agent_id} with Tenant A auth targeting Tenant B agent."""
    # Create agent in Tenant B
    await _create_agent_reg(db_session, TENANT_B_ID, "b-agent")

    # Tenant A tries to update it — should get 404 (not 403, no existence leak)
    resp = await client.patch(
        "/api/v1/agent-registrations/b-agent",
        json={"bundle_name": "stolen-bundle"},
    )
    assert resp.status_code == 404


async def test_tenant_a_cannot_bulk_assign_tenant_b_agents(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Bulk assign should only affect agents in the calling tenant."""
    # Create agents in both tenants
    await _create_agent_reg(db_session, TENANT_A_ID, "shared-name")
    await _create_agent_reg(db_session, TENANT_B_ID, "shared-name")

    # Tenant A bulk-assigns — should only update Tenant A's agent
    resp = await client.post(
        "/api/v1/agent-registrations/bulk-assign",
        json={"agent_ids": ["shared-name"], "bundle_name": "my-bundle"},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    # Verify Tenant B's agent is untouched
    from sqlalchemy import select

    result = await db_session.execute(
        select(AgentRegistration).where(
            AgentRegistration.tenant_id == TENANT_B_ID,
            AgentRegistration.agent_id == "shared-name",
        )
    )
    b_agent = result.scalar_one()
    assert b_agent.bundle_name is None  # Untouched


async def test_tenant_a_cannot_list_tenant_b_rules(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Assignment rules are fully tenant-scoped."""
    # Create rule in Tenant B
    await _create_rule(db_session, TENANT_B_ID, 1, "finance-*", "finance-bundle")

    # Tenant A lists — must see empty
    resp = await client.get("/api/v1/assignment-rules")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_tenant_a_cannot_update_tenant_b_rule(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """PATCH on cross-tenant rule returns 404 (no existence leak)."""
    rule = await _create_rule(db_session, TENANT_B_ID, 1, "ops-*", "ops-bundle")

    resp = await client.patch(
        f"/api/v1/assignment-rules/{rule.id}",
        json={"pattern": "hijacked-*"},
    )
    assert resp.status_code == 404


async def test_tenant_a_cannot_delete_tenant_b_rule(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """DELETE on cross-tenant rule returns 404, not 403 (no existence leak)."""
    rule = await _create_rule(db_session, TENANT_B_ID, 1, "ops-*", "ops-bundle")

    resp = await client.delete(f"/api/v1/assignment-rules/{rule.id}")
    assert resp.status_code == 404

    # Verify the rule still exists for Tenant B
    from sqlalchemy import select

    result = await db_session.execute(
        select(AssignmentRule).where(AssignmentRule.id == rule.id)
    )
    assert result.scalar_one_or_none() is not None


async def test_resolve_only_considers_own_tenant_rules(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Resolution must not match rules from other tenants even if pattern matches."""
    # Tenant B has a rule that would match "finance-bot-1"
    await _create_rule(db_session, TENANT_B_ID, 1, "finance-*", "b-finance-bundle")

    # Tenant A resolves — must not see Tenant B's rule
    resp = await client.get("/api/v1/assignment-rules/resolve/finance-bot-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "none"
    assert data["bundle_name"] is None


async def test_cross_tenant_agent_id_collision(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Same agent_id in two tenants are independent entities."""
    # Both tenants have agent "shared-bot"
    await _create_agent_reg(db_session, TENANT_A_ID, "shared-bot", bundle_name="a-bundle")
    await _create_agent_reg(db_session, TENANT_B_ID, "shared-bot", bundle_name="b-bundle")

    # Tenant A sees their version
    resp = await client.get("/api/v1/agent-registrations")
    assert resp.status_code == 200
    agents = resp.json()
    assert len(agents) == 1
    assert agents[0]["bundle_name"] == "a-bundle"

    # Tenant B sees their version
    set_auth_tenant_b()
    resp = await client.get("/api/v1/agent-registrations")
    assert resp.status_code == 200
    agents = resp.json()
    assert len(agents) == 1
    assert agents[0]["bundle_name"] == "b-bundle"


# ===========================================================================
# 2. Pattern Injection (~4 tests)
# ===========================================================================


async def test_pattern_rejects_forward_slash(
    client: AsyncClient,
) -> None:
    """Patterns with / must be rejected."""
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "../../etc/passwd",
            "bundle_name": "evil",
            "env": "production",
        },
    )
    assert resp.status_code == 400
    assert "path separator" in resp.json()["detail"].lower()


async def test_pattern_rejects_backslash(
    client: AsyncClient,
) -> None:
    """Patterns with \\ must be rejected."""
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "agent\\evil",
            "bundle_name": "evil",
            "env": "production",
        },
    )
    assert resp.status_code == 400
    assert "path separator" in resp.json()["detail"].lower()


async def test_pattern_rejects_null_bytes(
    client: AsyncClient,
) -> None:
    """Null bytes in patterns must be rejected."""
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "agent\x00evil",
            "bundle_name": "evil",
            "env": "production",
        },
    )
    # Null bytes should be caught by either printable ASCII check or forbidden chars check
    assert resp.status_code == 400


async def test_pattern_rejects_oversized(
    client: AsyncClient,
) -> None:
    """Patterns > 200 chars must be rejected."""
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "a" * 201,
            "bundle_name": "evil",
            "env": "production",
        },
    )
    # Pydantic max_length=200 or regex check should reject
    assert resp.status_code in (400, 422)


# ===========================================================================
# 3. Priority Conflicts (~3 tests)
# ===========================================================================


async def test_duplicate_priority_returns_409(
    client: AsyncClient,
) -> None:
    """Two rules with same priority in same tenant must conflict."""
    resp1 = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 10,
            "pattern": "finance-*",
            "bundle_name": "finance-bundle",
            "env": "production",
        },
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 10,
            "pattern": "ops-*",
            "bundle_name": "ops-bundle",
            "env": "production",
        },
    )
    assert resp2.status_code == 409


async def test_priority_isolation_across_tenants(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Same priority number is allowed across different tenants."""
    # Tenant A creates priority 1
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "agent-*",
            "bundle_name": "a-bundle",
            "env": "production",
        },
    )
    assert resp.status_code == 201

    # Tenant B also has priority 1 — no conflict
    await _create_rule(db_session, TENANT_B_ID, 1, "agent-*", "b-bundle")

    # Tenant A can still list their rules
    resp = await client.get("/api/v1/assignment-rules")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_priority_reuse_after_delete(
    client: AsyncClient,
) -> None:
    """Priority can be reused after the rule using it is deleted."""
    # Create rule with priority 5
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 5,
            "pattern": "temp-*",
            "bundle_name": "temp-bundle",
            "env": "production",
        },
    )
    assert resp.status_code == 201
    rule_id = resp.json()["id"]

    # Delete it
    resp = await client.delete(f"/api/v1/assignment-rules/{rule_id}")
    assert resp.status_code == 204

    # Reuse priority 5
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 5,
            "pattern": "new-*",
            "bundle_name": "new-bundle",
            "env": "production",
        },
    )
    assert resp.status_code == 201


# ===========================================================================
# 4. Resolution Logic (~5 tests)
# ===========================================================================


async def test_explicit_assignment_overrides_rules(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent with explicit bundle_name ignores all rules."""
    # Agent has explicit assignment
    await _create_agent_reg(
        db_session, TENANT_A_ID, "finance-bot-1", bundle_name="explicit-bundle"
    )
    # Rule that would also match
    await _create_rule(db_session, TENANT_A_ID, 1, "finance-*", "rule-bundle")

    resp = await client.get("/api/v1/assignment-rules/resolve/finance-bot-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bundle_name"] == "explicit-bundle"
    assert data["source"] == "explicit"


async def test_rule_matching_respects_priority_order(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Lower priority number matches first when multiple rules match."""
    # Agent exists but without explicit assignment
    await _create_agent_reg(db_session, TENANT_A_ID, "finance-bot-1")

    # Two matching rules — priority 10 should win over priority 20
    await _create_rule(db_session, TENANT_A_ID, 10, "finance-*", "high-priority-bundle")
    await _create_rule(db_session, TENANT_A_ID, 20, "finance-*", "low-priority-bundle")

    resp = await client.get("/api/v1/assignment-rules/resolve/finance-bot-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bundle_name"] == "high-priority-bundle"
    assert data["source"] == "rule"


async def test_tag_match_requires_all_tags(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Rule with tag_match requires ALL specified tags to match (AND logic)."""
    # Agent with partial tags
    await _create_agent_reg(
        db_session, TENANT_A_ID, "multi-tag-agent",
        tags={"role": "finance", "tier": "premium"},
    )

    # Rule requires role=finance AND region=us — agent lacks region
    await _create_rule(
        db_session, TENANT_A_ID, 1, "multi-*", "restricted-bundle",
        tag_match={"role": "finance", "region": "us"},
    )
    # Fallback rule with no tag requirement
    await _create_rule(db_session, TENANT_A_ID, 2, "multi-*", "fallback-bundle")

    resp = await client.get("/api/v1/assignment-rules/resolve/multi-tag-agent")
    assert resp.status_code == 200
    data = resp.json()
    # First rule should NOT match (missing region tag), falls through to priority 2
    assert data["bundle_name"] == "fallback-bundle"
    assert data["source"] == "rule"


async def test_no_match_returns_none(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Agent with no explicit, no matching rule → source=none."""
    # Agent exists but no explicit assignment
    await _create_agent_reg(db_session, TENANT_A_ID, "orphan-agent")
    # Rule that doesn't match
    await _create_rule(db_session, TENANT_A_ID, 1, "finance-*", "finance-bundle")

    resp = await client.get("/api/v1/assignment-rules/resolve/orphan-agent")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bundle_name"] is None
    assert data["source"] == "none"


async def test_agent_not_registered_resolves_via_rules(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Unregistered agent can still match rules (no AgentRegistration needed)."""
    await _create_rule(db_session, TENANT_A_ID, 1, "wildcard-*", "catch-all-bundle")

    resp = await client.get("/api/v1/assignment-rules/resolve/wildcard-999")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bundle_name"] == "catch-all-bundle"
    assert data["source"] == "rule"


# ===========================================================================
# 5. Pattern validation on update (not just create)
# ===========================================================================


async def test_pattern_injection_on_update_rejected(
    client: AsyncClient,
) -> None:
    """Pattern validation also applies on PATCH, not just POST."""
    # Create a valid rule first
    resp = await client.post(
        "/api/v1/assignment-rules",
        json={
            "priority": 1,
            "pattern": "safe-*",
            "bundle_name": "safe-bundle",
            "env": "production",
        },
    )
    assert resp.status_code == 201
    rule_id = resp.json()["id"]

    # Try to update pattern to something malicious
    resp = await client.patch(
        f"/api/v1/assignment-rules/{rule_id}",
        json={"pattern": "../../traversal"},
    )
    assert resp.status_code == 400


# ===========================================================================
# 6. fnmatch safety
# ===========================================================================


async def test_fnmatch_crafted_patterns_safe(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verify fnmatch with crafted patterns doesn't cause unexpected matches."""
    # Create rule with bracket pattern (valid printable ASCII, no path seps)
    await _create_rule(db_session, TENANT_A_ID, 1, "[!a]*", "bracket-bundle")

    # "b-agent" should match [!a]* (starts with non-a)
    resp = await client.get("/api/v1/assignment-rules/resolve/b-agent")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bundle_name"] == "bracket-bundle"

    # "a-agent" should NOT match [!a]* (starts with a)
    resp = await client.get("/api/v1/assignment-rules/resolve/a-agent")
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "none"
