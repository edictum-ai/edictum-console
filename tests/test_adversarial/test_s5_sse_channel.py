"""S5: SSE channel authorization tests.

Risk if bypassed: Contract/event leak across tenants.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from edictum_server.push.manager import PushManager

pytestmark = pytest.mark.security


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
    queue_a = push_manager.subscribe("production")
    queue_b = push_manager.subscribe("staging")

    push_manager.push_to_env("production", {"type": "contract_update", "version": 1})

    # Queue A should have the event
    assert not queue_a.empty()
    event = await queue_a.get()
    assert event["type"] == "contract_update"

    # Queue B should be empty
    assert queue_b.empty()

    push_manager.unsubscribe("production", queue_a)
    push_manager.unsubscribe("staging", queue_b)


async def test_event_type_is_contract_update(push_manager: PushManager) -> None:
    """SDK expects event type 'contract_update', not 'bundle_deployed'."""
    queue = push_manager.subscribe("production")

    push_manager.push_to_env(
        "production",
        {
            "type": "contract_update",
            "version": 1,
        },
    )

    event = await queue.get()
    assert event["type"] == "contract_update"
    assert event["type"] != "bundle_deployed"

    push_manager.unsubscribe("production", queue)


async def test_cross_environment_isolation(push_manager: PushManager) -> None:
    """Events for 'production' do not reach 'staging' subscribers."""
    prod_q = push_manager.subscribe("production")
    stg_q = push_manager.subscribe("staging")
    dev_q = push_manager.subscribe("development")

    push_manager.push_to_env("staging", {"type": "contract_update", "env": "staging"})

    # Only staging got it
    assert not stg_q.empty()
    assert prod_q.empty()
    assert dev_q.empty()

    push_manager.unsubscribe("production", prod_q)
    push_manager.unsubscribe("staging", stg_q)
    push_manager.unsubscribe("development", dev_q)
