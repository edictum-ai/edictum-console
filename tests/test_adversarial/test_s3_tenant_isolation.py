"""S3: Tenant isolation tests -- cross-tenant on EVERY endpoint.

Risk if bypassed: Cross-tenant data leak. SHIP-BLOCKER.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Deployment
from tests.conftest import TENANT_A_ID, TENANT_B_ID

pytestmark = pytest.mark.security

SAMPLE_YAML = "rules:\n  - name: test\n    tool: shell\n    verdict: deny\n"


# ---------------------------------------------------------------------------
# Keys
# ---------------------------------------------------------------------------


async def test_keys_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create key as tenant A, list as tenant B -> not visible."""
    await client.post("/api/v1/keys", json={"env": "production", "label": "a-key"})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/keys")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_revoke_key_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant B cannot revoke tenant A's key."""
    create_resp = await client.post("/api/v1/keys", json={"env": "production"})
    key_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.delete(f"/api/v1/keys/{key_id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bundles
# ---------------------------------------------------------------------------


async def test_bundle_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create bundle as tenant A, get as tenant B -> 404."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles/1")
    assert resp.status_code == 404


async def test_list_bundles_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Tenant A's bundles not listed for tenant B."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_yaml_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """GET /bundles/{version}/yaml as wrong tenant -> 404."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles/1/yaml")
    assert resp.status_code == 404


async def test_deploy_bundle_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Deploy bundle as tenant B on tenant A's bundle -> 422 (not found)."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})

    set_auth_tenant_b()
    resp = await client.post(
        "/api/v1/bundles/1/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422


async def test_get_current_bundle_cross_tenant(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Current bundle for tenant A is not visible to tenant B."""
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML})
    db_session.add(Deployment(
        tenant_id=TENANT_A_ID,
        env="production",
        bundle_version=1,
        deployed_by="test",
    ))
    await db_session.commit()

    set_auth_tenant_b()
    resp = await client.get(
        "/api/v1/bundles/current", params={"env": "production"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


async def test_events_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Post events as tenant A, query as tenant B -> empty."""
    event = {
        "call_id": "cross-tenant-1",
        "agent_id": "agent-1",
        "tool_name": "shell",
        "verdict": "deny",
        "mode": "enforce",
        "timestamp": "2026-02-18T12:00:00Z",
    }
    await client.post("/api/v1/events", json={"events": [event]})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/events")
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Sessions (Redis key-value)
# ---------------------------------------------------------------------------


async def test_session_value_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Set session value as tenant A, get as tenant B -> 404."""
    await client.put(
        "/api/v1/sessions/secret",
        json={"value": "tenant-a-data"},
    )

    set_auth_tenant_b()
    resp = await client.get("/api/v1/sessions/secret")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------


async def test_approval_not_visible_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create approval as tenant A, get as tenant B -> 404."""
    create_resp = await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "agent-1",
            "tool_name": "shell",
            "message": "test",
        },
    )
    approval_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.get(f"/api/v1/approvals/{approval_id}")
    assert resp.status_code == 404


async def test_list_approvals_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """List approvals as tenant B after creating as tenant A -> empty."""
    await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "agent-1",
            "tool_name": "shell",
            "message": "test",
        },
    )

    set_auth_tenant_b()
    resp = await client.get("/api/v1/approvals")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_submit_decision_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Submit decision on tenant A's approval as tenant B -> 409/404."""
    create_resp = await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "agent-1",
            "tool_name": "shell",
            "message": "test",
        },
    )
    approval_id = create_resp.json()["id"]

    set_auth_tenant_b()
    resp = await client.put(
        f"/api/v1/approvals/{approval_id}",
        json={"approved": True, "decided_by": "attacker"},
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Mixed auth context mismatch
# ---------------------------------------------------------------------------


async def test_create_then_access_different_tenant_key(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Switch between tenants -- data created in A stays in A."""
    # Tenant A creates a key
    create_resp = await client.post("/api/v1/keys", json={"env": "staging"})
    assert create_resp.status_code == 201

    # Tenant B lists -- empty
    set_auth_tenant_b()
    resp = await client.get("/api/v1/keys")
    assert resp.json() == []

    # Switch back to A -- key is still there
    set_auth_tenant_a()
    resp = await client.get("/api/v1/keys")
    assert len(resp.json()) == 1


async def test_create_approval_then_list_different_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Approval created by A not leaking to B, then back to A still visible."""
    await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "agent-1",
            "tool_name": "shell",
            "message": "sensitive",
        },
    )

    set_auth_tenant_b()
    resp = await client.get("/api/v1/approvals")
    assert resp.json() == []

    set_auth_tenant_a()
    resp = await client.get("/api/v1/approvals")
    assert len(resp.json()) == 1


async def test_session_increment_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Increment session key as tenant A, read as tenant B -> 404."""
    await client.post(
        "/api/v1/sessions/count/increment",
        json={"amount": 5},
    )

    set_auth_tenant_b()
    resp = await client.get("/api/v1/sessions/count")
    # Tenant B should not see tenant A's counter
    assert resp.status_code == 404
