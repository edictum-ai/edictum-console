"""Adversarial security tests for the Slack interaction endpoint."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Callable
from urllib.parse import urlencode

import fakeredis.aioredis
import pytest
from httpx import AsyncClient, Response

from tests.conftest import TENANT_A_ID


def _build_body(
    approval_id: str,
    action: str = "approve",
    username: str = "testuser",
) -> bytes:
    payload = {
        "type": "block_actions",
        "user": {"id": "U123", "username": username},
        "actions": [{"action_id": f"edictum_{action}:{approval_id}"}],
        "response_url": "https://hooks.slack.com/actions/...",
    }
    return urlencode({"payload": json.dumps(payload)}).encode()


def _sign(signing_secret: str, body: bytes, timestamp: str | None = None) -> tuple[str, str]:
    ts = timestamp or str(int(time.time()))
    sig_base = f"v0:{ts}:{body.decode()}"
    sig = "v0=" + hmac.new(
        signing_secret.encode(), sig_base.encode(), hashlib.sha256
    ).hexdigest()
    return ts, sig


async def _create_slack_app_channel(
    client: AsyncClient,
    *,
    signing_secret: str = "test-secret-abc",
    name: str = "Test Slack App",
) -> dict:
    resp = await client.post(
        "/api/v1/notifications/channels",
        json={
            "name": name,
            "channel_type": "slack_app",
            "config": {
                "bot_token": "xoxb-test-token",
                "signing_secret": signing_secret,
                "slack_channel": "#approvals",
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_approval(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "test-agent",
            "tool_name": "send_email",
            "message": "Please approve",
            "timeout": 300,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _post_interaction(
    client: AsyncClient,
    approval_id: str,
    signing_secret: str,
    *,
    action: str = "approve",
    timestamp: str | None = None,
    override_sig: str | None = None,
    omit_sig: bool = False,
    omit_ts: bool = False,
) -> Response:
    body = _build_body(approval_id, action=action)
    ts, sig = _sign(signing_secret, body, timestamp=timestamp)
    if override_sig is not None:
        sig = override_sig
    headers: dict[str, str] = {"Content-Type": "application/x-www-form-urlencoded"}
    if not omit_ts:
        headers["X-Slack-Request-Timestamp"] = ts
    if not omit_sig:
        headers["X-Slack-Signature"] = sig
    return await client.post(
        "/api/v1/slack/interactions",
        content=body,
        headers=headers,
    )


@pytest.mark.security
async def test_wrong_signature_rejected(client: AsyncClient) -> None:
    channel = await _create_slack_app_channel(client)
    approval = await _create_approval(client)
    resp = await _post_interaction(
        client,
        approval["id"],
        signing_secret=channel["config"]["signing_secret"],
        override_sig="v0=badhash0000000000000000000000000000000000000000000000000000000000",
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_expired_timestamp_rejected(client: AsyncClient) -> None:
    channel = await _create_slack_app_channel(client)
    approval = await _create_approval(client)
    old_ts = str(int(time.time()) - 600)  # 10 minutes ago
    resp = await _post_interaction(
        client,
        approval["id"],
        signing_secret=channel["config"]["signing_secret"],
        timestamp=old_ts,
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_missing_signature_header_rejected(client: AsyncClient) -> None:
    channel = await _create_slack_app_channel(client)
    approval = await _create_approval(client)
    resp = await _post_interaction(
        client,
        approval["id"],
        signing_secret=channel["config"]["signing_secret"],
        omit_sig=True,
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_missing_timestamp_header_rejected(client: AsyncClient) -> None:
    channel = await _create_slack_app_channel(client)
    approval = await _create_approval(client)
    resp = await _post_interaction(
        client,
        approval["id"],
        signing_secret=channel["config"]["signing_secret"],
        omit_ts=True,
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_no_slack_app_channels_rejects(client: AsyncClient) -> None:
    """When no slack_app channels exist, any request must be rejected."""
    approval = await _create_approval(client)
    resp = await _post_interaction(
        client,
        approval["id"],
        signing_secret="any-secret",
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_disabled_channel_not_matched(client: AsyncClient) -> None:
    channel = await _create_slack_app_channel(client)
    signing_secret = channel["config"]["signing_secret"]

    # Disable the channel
    disable_resp = await client.put(
        f"/api/v1/notifications/channels/{channel['id']}",
        json={"enabled": False},
    )
    assert disable_resp.status_code == 200

    approval = await _create_approval(client)
    resp = await _post_interaction(client, approval["id"], signing_secret=signing_secret)
    assert resp.status_code == 403


@pytest.mark.security
async def test_cross_tenant_blocked(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Tenant B's signing secret cannot decide tenant A's approvals.

    The route looks up Redis using the matched channel's ID. Tenant B's channel
    has a different channel_id, so slack:tenant:{channel_B_id}:{approval_A_id}
    does not exist — the interaction is gracefully rejected as expired/handled,
    and the approval remains pending.
    """
    # Create channel A under tenant A
    channel_a = await _create_slack_app_channel(
        client, signing_secret="secret-tenant-a", name="Channel A"
    )

    # Create channel B under tenant B
    set_auth_tenant_b()
    await _create_slack_app_channel(
        client, signing_secret="secret-tenant-b", name="Channel B"
    )

    # Create approval under tenant A
    set_auth_tenant_a()
    approval = await _create_approval(client)
    approval_id = approval["id"]

    # Seed Redis for channel A only
    await test_redis.set(
        f"slack:tenant:{channel_a['id']}:{approval_id}",
        str(TENANT_A_ID),
    )

    # Sign with tenant B's secret — matches channel B, but Redis key for
    # channel B + approval A doesn't exist
    body = _build_body(approval_id)
    ts, sig = _sign("secret-tenant-b", body)
    resp = await client.post(
        "/api/v1/slack/interactions",
        content=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Slack-Request-Timestamp": ts,
            "X-Slack-Signature": sig,
        },
    )
    # Graceful rejection: 200 with expired/handled message, not 500
    assert resp.status_code == 200
    data = resp.json()
    assert data["replace_original"] is True
    # Approval still pending — not decided by tenant B
    set_auth_tenant_a()
    list_resp = await client.get("/api/v1/approvals")
    assert list_resp.status_code == 200
    approvals = [a for a in list_resp.json() if a["id"] == approval_id]
    assert approvals[0]["status"] == "pending"


@pytest.mark.security
async def test_replay_already_decided(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    """Submitting the same interaction twice is handled gracefully (no crash)."""
    channel = await _create_slack_app_channel(client)
    channel_id = channel["id"]
    signing_secret = channel["config"]["signing_secret"]

    approval = await _create_approval(client)
    approval_id = approval["id"]

    await test_redis.set(
        f"slack:tenant:{channel_id}:{approval_id}",
        str(TENANT_A_ID),
    )

    # First interaction — succeeds
    resp1 = await _post_interaction(client, approval_id, signing_secret=signing_secret)
    assert resp1.status_code == 200
    assert resp1.json()["replace_original"] is True

    # Second interaction — approval already decided, should NOT crash
    resp2 = await _post_interaction(client, approval_id, signing_secret=signing_secret)
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["replace_original"] is True
    # Response indicates already handled
    blocks_text = json.dumps(data["blocks"])
    assert "Already decided" in blocks_text or "expired" in blocks_text.lower()


@pytest.mark.security
async def test_expired_approval_no_redis_key(client: AsyncClient) -> None:
    """Interaction for an approval whose Redis key has expired returns 200, not 500."""
    channel = await _create_slack_app_channel(client)
    signing_secret = channel["config"]["signing_secret"]

    approval = await _create_approval(client)
    # Do NOT set the Redis key — simulates TTL expiry

    resp = await _post_interaction(client, approval["id"], signing_secret=signing_secret)
    assert resp.status_code == 200
    data = resp.json()
    assert data["replace_original"] is True
    blocks_text = json.dumps(data["blocks"])
    assert "expired" in blocks_text.lower() or "handled" in blocks_text.lower()
