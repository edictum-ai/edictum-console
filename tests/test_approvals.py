"""Tests for the approval-queue endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Approval
from edictum_server.services.approval_service import expire_approvals


def _make_approval_body(**overrides: object) -> dict:
    base = {
        "agent_id": "agent-1",
        "tool_name": "shell",
        "tool_args": {"cmd": "rm -rf /"},
        "message": "Agent wants to run a dangerous command",
        "timeout": 300,
        "timeout_effect": "deny",
    }
    base.update(overrides)
    return base


async def _create_approval(client: AsyncClient, **overrides: object) -> dict:
    resp = await client.post("/api/v1/approvals", json=_make_approval_body(**overrides))
    assert resp.status_code == 201
    return resp.json()


async def test_create_approval(client: AsyncClient) -> None:
    data = await _create_approval(client)
    assert data["status"] == "pending"
    assert data["agent_id"] == "agent-1"
    assert data["tool_name"] == "shell"
    assert data["message"] == "Agent wants to run a dangerous command"
    assert data["timeout_effect"] == "deny"
    assert data["env"] == "production"
    assert data["tool_args"] == {"cmd": "rm -rf /"}
    assert "timeout_seconds" in data
    assert "created_at" in data
    assert "id" in data


async def test_get_approval(client: AsyncClient) -> None:
    created = await _create_approval(client)
    resp = await client.get(f"/api/v1/approvals/{created['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == created["id"]
    assert data["status"] == "pending"
    assert data["agent_id"] == "agent-1"


async def test_get_approval_not_found(client: AsyncClient) -> None:
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/approvals/{fake_id}")
    assert resp.status_code == 404


async def test_list_pending_approvals(client: AsyncClient) -> None:
    await _create_approval(client, agent_id="a1")
    await _create_approval(client, agent_id="a2")

    all_resp = await client.get("/api/v1/approvals")
    all_data = all_resp.json()
    first_id = all_data[0]["id"]
    await client.put(
        f"/api/v1/approvals/{first_id}",
        json={"approved": True, "decided_by": "admin"},
    )

    resp = await client.get("/api/v1/approvals", params={"status": "pending"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "pending"


async def test_submit_decision_approve(client: AsyncClient) -> None:
    created = await _create_approval(client)
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True, "decided_by": "admin", "reason": "looks safe"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["decided_by"] == "admin"
    assert data["decision_reason"] == "looks safe"
    assert data["decided_at"] is not None


async def test_submit_decision_deny(client: AsyncClient) -> None:
    created = await _create_approval(client)
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": False, "decided_by": "admin", "reason": "too risky"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "denied"
    assert data["decided_by"] == "admin"
    assert data["decision_reason"] == "too risky"


async def test_submit_decision_already_decided(client: AsyncClient) -> None:
    created = await _create_approval(client)
    await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": True},
    )
    resp = await client.put(
        f"/api/v1/approvals/{created['id']}",
        json={"approved": False},
    )
    assert resp.status_code == 409


async def test_expire_approvals(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    created = await _create_approval(client, timeout=1)

    await db_session.execute(
        update(Approval)
        .where(Approval.id == uuid.UUID(created["id"]))
        .values(created_at=datetime.now(UTC) - timedelta(seconds=3600))
    )
    await db_session.commit()

    expired = await expire_approvals(db_session)
    await db_session.commit()
    assert len(expired) == 1

    resp = await client.get(f"/api/v1/approvals/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "timeout"
