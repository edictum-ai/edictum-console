"""S4: Approval state transition tests.

Risk if bypassed: Unauthorized tool execution.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.security


async def _create_approval(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "agent-1",
            "tool_name": "shell",
            "tool_args": {"cmd": "rm -rf /"},
            "message": "Agent wants to run a dangerous command",
            "timeout": 300,
            "timeout_effect": "deny",
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_double_approve(client: AsyncClient) -> None:
    """Approving the same approval twice -> second returns 409."""
    created = await _create_approval(client)
    first = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "admin"},
    )
    assert first.status_code == 200

    second = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "admin"},
    )
    assert second.status_code == 409


async def test_approve_then_deny(client: AsyncClient) -> None:
    """Approving then denying the same approval -> second returns 409."""
    created = await _create_approval(client)
    await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "admin"},
    )
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": False, "decided_by": "admin"},
    )
    assert resp.status_code == 409


async def test_deny_then_approve(client: AsyncClient) -> None:
    """Denying then approving the same approval -> second returns 409."""
    created = await _create_approval(client)
    await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": False, "decided_by": "admin"},
    )
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "admin"},
    )
    assert resp.status_code == 409


async def test_approve_nonexistent(client: AsyncClient) -> None:
    """Approving a non-existent approval -> 409 (not found or already decided)."""
    fake_id = str(uuid.uuid4())
    resp = await client.put(
        f"/api/v1/approvals/{fake_id}",
        json={"approved": True, "decided_by": "admin"},
    )
    assert resp.status_code == 409


async def test_approve_wrong_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Approving tenant A's approval as tenant B -> 409 (not found)."""
    created = await _create_approval(client)
    set_auth_tenant_b()
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "attacker"},
    )
    assert resp.status_code == 409
