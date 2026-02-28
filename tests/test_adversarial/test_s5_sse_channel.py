"""S5: SSE channel authorization tests.

Risk if bypassed: Contract/event leak across tenants.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from edictum_server.push.manager import PushManager

pytestmark = pytest.mark.security

_TENANT = uuid.uuid4()


async def test_subscribe_without_auth(no_auth_client: AsyncClient) -> None:
    """SSE stream endpoint requires API key auth."""
    resp = await no_auth_client.get(
        "/api/v1/stream",
        params={"env": "production"},
    )
    # Should fail with 401 or 422 (missing header)
    assert resp.status_code in (401, 422)


async def test_push_only_to_subscribed_env(push_manager: PushManager) -> None:
    """Events pushed to env A are not received by env B subscribers."""
    conn_a = push_manager.subscribe("production", tenant_id=_TENANT, agent_id="a1")
    conn_b = push_manager.subscribe("staging", tenant_id=_TENANT, agent_id="a2")

    push_manager.push_to_env(
        "production", {"type": "contract_update", "version": 1}, tenant_id=_TENANT
    )

    # Queue A should have the event
    assert not conn_a.queue.empty()
    event = await conn_a.queue.get()
    assert event["type"] == "contract_update"

    # Queue B should be empty
    assert conn_b.queue.empty()

    push_manager.unsubscribe("production", conn_a)
    push_manager.unsubscribe("staging", conn_b)


async def test_event_type_is_contract_update(push_manager: PushManager) -> None:
    """SDK expects event type 'contract_update', not 'bundle_deployed'."""
    conn = push_manager.subscribe("production", tenant_id=_TENANT, agent_id="a1")

    push_manager.push_to_env(
        "production",
        {"type": "contract_update", "version": 1},
        tenant_id=_TENANT,
    )

    event = await conn.queue.get()
    assert event["type"] == "contract_update"
    assert event["type"] != "bundle_deployed"

    push_manager.unsubscribe("production", conn)


async def test_cross_environment_isolation(push_manager: PushManager) -> None:
    """Events for 'production' do not reach 'staging' subscribers."""
    prod = push_manager.subscribe("production", tenant_id=_TENANT, agent_id="a1")
    stg = push_manager.subscribe("staging", tenant_id=_TENANT, agent_id="a2")
    dev = push_manager.subscribe("development", tenant_id=_TENANT, agent_id="a3")

    push_manager.push_to_env(
        "staging", {"type": "contract_update", "env": "staging"}, tenant_id=_TENANT
    )

    # Only staging got it
    assert not stg.queue.empty()
    assert prod.queue.empty()
    assert dev.queue.empty()

    push_manager.unsubscribe("production", prod)
    push_manager.unsubscribe("staging", stg)
    push_manager.unsubscribe("development", dev)
