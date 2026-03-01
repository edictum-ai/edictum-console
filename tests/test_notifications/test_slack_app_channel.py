"""Unit tests for SlackAppChannel -- mocked httpx, no network calls."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import fakeredis.aioredis
import pytest

from edictum_server.notifications.slack_app import SlackAppChannel


@pytest.fixture()
async def channel(fake_redis: fakeredis.aioredis.FakeRedis) -> SlackAppChannel:
    ch = SlackAppChannel(
        bot_token="xoxb-test-token",
        signing_secret="test-secret",
        slack_channel="#test-channel",
        base_url="http://localhost:8000",
        channel_name="Test Slack App",
        channel_id="ch-uuid-123",
        redis=fake_redis,
    )
    ch._client = AsyncMock()
    return ch


def _mock_post(data: dict) -> AsyncMock:
    """Return an AsyncMock for _client.post that yields the given response data."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = data
    mock_resp.raise_for_status = MagicMock()
    return AsyncMock(return_value=mock_resp)


async def test_send_approval_request_posts_block_kit(channel: SlackAppChannel) -> None:
    channel._client.post = _mock_post({"ok": True, "ts": "123.456"})
    await channel.send_approval_request(
        approval_id="approval-xyz",
        agent_id="billing-agent",
        tool_name="send_invoice",
        tool_args={"amount": 100},
        message="Please approve",
        env="production",
        timeout_seconds=300,
        timeout_effect="deny",
        tenant_id="tenant-abc",
    )
    channel._client.post.assert_called_once()
    call = channel._client.post.call_args
    assert call.args[0] == "https://slack.com/api/chat.postMessage"
    assert call.kwargs["headers"] == {"Authorization": "Bearer xoxb-test-token"}
    payload = call.kwargs["json"]
    assert payload["channel"] == "#test-channel"
    blocks = payload["blocks"]
    actions = next(b for b in blocks if b["type"] == "actions")
    action_ids = [e["action_id"] for e in actions["elements"]]
    assert "edictum_approve:approval-xyz" in action_ids
    assert "edictum_deny:approval-xyz" in action_ids
    context = next(b for b in blocks if b["type"] == "context")
    deep_link = "http://localhost:8000/dashboard/approvals?id=approval-xyz"
    assert deep_link in context["elements"][0]["text"]


async def test_send_approval_request_stores_redis_keys(
    channel: SlackAppChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    channel._client.post = _mock_post({"ok": True, "ts": "123.456"})
    approval_id = "approval-abc"
    await channel.send_approval_request(
        approval_id=approval_id,
        agent_id="agent-1",
        tool_name="tool-1",
        tool_args=None,
        message="msg",
        env="staging",
        timeout_seconds=120,
        timeout_effect="deny",
        tenant_id="tenant-t1",
    )
    tenant_val = await fake_redis.get(f"slack:tenant:ch-uuid-123:{approval_id}")
    assert tenant_val == "tenant-t1"
    msg_raw = await fake_redis.get(f"slack:msg:ch-uuid-123:{approval_id}")
    assert msg_raw is not None
    msg_data = json.loads(msg_raw)
    assert msg_data["slack_channel"] == "#test-channel"
    assert msg_data["ts"] == "123.456"
    ttl = await fake_redis.ttl(f"slack:tenant:ch-uuid-123:{approval_id}")
    assert ttl is not None and 170 <= ttl <= 185  # 120 + 60 = 180s


async def test_send_approval_decided_edits_message(
    channel: SlackAppChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    approval_id = "approval-123"
    await fake_redis.set(
        f"slack:msg:ch-uuid-123:{approval_id}",
        json.dumps({"slack_channel": "#test", "ts": "123.456"}),
    )
    channel._client.post = _mock_post({"ok": True})
    await channel.send_approval_decided(
        approval_id=approval_id,
        status="approved",
        decided_by="admin",
        reason=None,
    )
    channel._client.post.assert_called_once()
    call = channel._client.post.call_args
    assert call.args[0] == "https://slack.com/api/chat.update"
    payload = call.kwargs["json"]
    assert payload["channel"] == "#test"
    assert payload["ts"] == "123.456"
    assert not any(b.get("type") == "actions" for b in payload["blocks"])


async def test_send_approval_decided_falls_back_to_new_message(
    channel: SlackAppChannel,
) -> None:
    channel._client.post = _mock_post({"ok": True})
    await channel.send_approval_decided(
        approval_id="approval-nope",
        status="denied",
        decided_by="admin",
        reason=None,
    )
    channel._client.post.assert_called_once()
    call = channel._client.post.call_args
    assert call.args[0] == "https://slack.com/api/chat.postMessage"


async def test_update_expired_edits_messages(
    channel: SlackAppChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    approval_id = "approval-exp"
    await fake_redis.set(
        f"slack:msg:ch-uuid-123:{approval_id}",
        json.dumps({"slack_channel": "#test", "ts": "999.000"}),
    )
    channel._client.post = _mock_post({"ok": True})
    await channel.update_expired([
        {"id": approval_id, "agent_id": "agent-1", "tool_name": "some_tool"},
    ])
    channel._client.post.assert_called_once()
    call = channel._client.post.call_args
    assert call.args[0] == "https://slack.com/api/chat.update"
    blocks_text = json.dumps(call.kwargs["json"]["blocks"])
    assert "Expired" in blocks_text


async def test_supports_interactive(channel: SlackAppChannel) -> None:
    assert channel.supports_interactive is True


async def test_close(channel: SlackAppChannel) -> None:
    channel._client.aclose = AsyncMock()
    await channel.close()
    channel._client.aclose.assert_called_once()
