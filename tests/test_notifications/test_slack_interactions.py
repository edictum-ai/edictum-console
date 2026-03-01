"""Integration tests for the Slack interaction endpoint and manifest."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import fakeredis.aioredis
from httpx import AsyncClient

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
    signing_secret: str = "test-signing-secret",
) -> dict:
    resp = await client.post(
        "/api/v1/notifications/channels",
        json={
            "name": "Test Slack App",
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
            "message": "Please approve this action",
            "timeout": 300,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_slack_interaction_approve(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    channel = await _create_slack_app_channel(client)
    channel_id = channel["id"]
    signing_secret = channel["config"]["signing_secret"]

    approval = await _create_approval(client)
    approval_id = approval["id"]

    await test_redis.set(
        f"slack:tenant:{channel_id}:{approval_id}",
        str(TENANT_A_ID),
    )

    body = _build_body(approval_id, action="approve")
    ts, sig = _sign(signing_secret, body)

    resp = await client.post(
        "/api/v1/slack/interactions",
        content=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Slack-Request-Timestamp": ts,
            "X-Slack-Signature": sig,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["replace_original"] is True
    blocks_text = json.dumps(data["blocks"])
    assert "APPROVED" in blocks_text


async def test_slack_interaction_deny(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    channel = await _create_slack_app_channel(client)
    channel_id = channel["id"]
    signing_secret = channel["config"]["signing_secret"]

    approval = await _create_approval(client)
    approval_id = approval["id"]

    await test_redis.set(
        f"slack:tenant:{channel_id}:{approval_id}",
        str(TENANT_A_ID),
    )

    body = _build_body(approval_id, action="deny")
    ts, sig = _sign(signing_secret, body)

    resp = await client.post(
        "/api/v1/slack/interactions",
        content=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Slack-Request-Timestamp": ts,
            "X-Slack-Signature": sig,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["replace_original"] is True
    blocks_text = json.dumps(data["blocks"])
    assert "DENIED" in blocks_text


async def test_manifest_endpoint(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/slack/manifest")
    assert resp.status_code == 200
    manifest = resp.json()
    assert manifest["display_information"]["name"] == "Edictum Approvals"
    request_url = manifest["settings"]["interactivity"]["request_url"]
    assert request_url.endswith("/api/v1/slack/interactions")
    assert "chat:write" in manifest["oauth_config"]["scopes"]["bot"]
