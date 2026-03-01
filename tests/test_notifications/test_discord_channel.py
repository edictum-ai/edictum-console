"""Unit tests for DiscordChannel -- mocked httpx, no network calls."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import fakeredis.aioredis
import pytest

from edictum_server.notifications.discord import DiscordChannel

_DISCORD_API = "https://discord.com/api/v10"
_CHANNEL_ID = "ch-uuid-123"
_DISCORD_CHANNEL_ID = "987654321"
_BOT_TOKEN = "test-bot-token"


@pytest.fixture()
async def channel(fake_redis: fakeredis.aioredis.FakeRedis) -> DiscordChannel:
    ch = DiscordChannel(
        bot_token=_BOT_TOKEN,
        public_key="abc123",
        discord_channel_id=_DISCORD_CHANNEL_ID,
        base_url="http://localhost:8000",
        channel_name="Test Discord",
        channel_id=_CHANNEL_ID,
        redis=fake_redis,
    )
    ch._client = AsyncMock()
    return ch


def _mock_post(data: dict) -> AsyncMock:
    resp = MagicMock()
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    return AsyncMock(return_value=resp)


async def test_send_approval_request_posts_embed(channel: DiscordChannel) -> None:
    channel._client.post = _mock_post({"id": "msg-snowflake-123"})
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
    assert call.args[0] == f"{_DISCORD_API}/channels/{_DISCORD_CHANNEL_ID}/messages"
    assert call.kwargs["headers"]["Authorization"] == f"Bot {_BOT_TOKEN}"
    payload = call.kwargs["json"]
    embed = payload["embeds"][0]
    assert embed["title"] == "Approval Requested"
    assert embed["color"] == 0xFFA500
    field_names = [f["name"] for f in embed["fields"]]
    assert {"Agent", "Tool", "Environment", "Timeout"}.issubset(field_names)
    buttons = payload["components"][0]["components"]
    styles = [b["style"] for b in buttons]
    assert 3 in styles  # Approve (success/green)
    assert 4 in styles  # Deny (danger/red)
    assert 5 in styles  # Link (dashboard)
    custom_ids = [b.get("custom_id") for b in buttons if "custom_id" in b]
    assert "edictum_approve:approval-xyz" in custom_ids
    assert "edictum_deny:approval-xyz" in custom_ids


async def test_send_approval_request_sets_redis_keys(
    channel: DiscordChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    channel._client.post = _mock_post({"id": "msg-snowflake-456"})
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
    tenant_val = await fake_redis.get(f"discord:tenant:{_CHANNEL_ID}:{approval_id}")
    assert tenant_val == "tenant-t1"
    msg_raw = await fake_redis.get(f"discord:msg:{_CHANNEL_ID}:{approval_id}")
    assert msg_raw is not None
    msg_data = json.loads(msg_raw)
    assert msg_data["discord_channel_id"] == _DISCORD_CHANNEL_ID
    assert msg_data["message_id"] == "msg-snowflake-456"
    ttl = await fake_redis.ttl(f"discord:tenant:{_CHANNEL_ID}:{approval_id}")
    assert 170 <= ttl <= 185  # 120 + 60 = 180s


async def test_send_approval_decided_patches_approved(
    channel: DiscordChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    approval_id = "approval-123"
    await fake_redis.set(
        f"discord:msg:{_CHANNEL_ID}:{approval_id}",
        json.dumps({"discord_channel_id": _DISCORD_CHANNEL_ID, "message_id": "msg-001"}),
    )
    channel._client.patch = AsyncMock(return_value=MagicMock())
    await channel.send_approval_decided(
        approval_id=approval_id, status="approved", decided_by="admin", reason=None
    )
    channel._client.patch.assert_called_once()
    call = channel._client.patch.call_args
    assert call.args[0] == (
        f"{_DISCORD_API}/channels/{_DISCORD_CHANNEL_ID}/messages/msg-001"
    )
    payload = call.kwargs["json"]
    assert payload["embeds"][0]["color"] == 0x57F287
    assert payload["components"] == []


async def test_send_approval_decided_patches_denied(
    channel: DiscordChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    approval_id = "approval-456"
    await fake_redis.set(
        f"discord:msg:{_CHANNEL_ID}:{approval_id}",
        json.dumps({"discord_channel_id": _DISCORD_CHANNEL_ID, "message_id": "msg-002"}),
    )
    channel._client.patch = AsyncMock(return_value=MagicMock())
    await channel.send_approval_decided(
        approval_id=approval_id, status="denied", decided_by="admin", reason=None
    )
    payload = channel._client.patch.call_args.kwargs["json"]
    assert payload["embeds"][0]["color"] == 0xED4245
    assert payload["components"] == []


async def test_send_approval_decided_fallback_post_on_expired_redis(
    channel: DiscordChannel,
) -> None:
    channel._client.post = _mock_post({"id": "fallback-msg"})
    await channel.send_approval_decided(
        approval_id="approval-nope", status="denied", decided_by="admin", reason=None
    )
    channel._client.post.assert_called_once()
    assert (
        channel._client.post.call_args.args[0]
        == f"{_DISCORD_API}/channels/{_DISCORD_CHANNEL_ID}/messages"
    )


async def test_update_expired_patches_grey_embed(
    channel: DiscordChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    approval_id = "approval-exp"
    await fake_redis.set(
        f"discord:msg:{_CHANNEL_ID}:{approval_id}",
        json.dumps({"discord_channel_id": _DISCORD_CHANNEL_ID, "message_id": "msg-exp"}),
    )
    channel._client.patch = AsyncMock(return_value=MagicMock())
    await channel.update_expired(
        [{"id": approval_id, "agent_id": "agent-1", "tool_name": "tool-x", "env": "prod"}]
    )
    channel._client.patch.assert_called_once()
    payload = channel._client.patch.call_args.kwargs["json"]
    assert payload["embeds"][0]["color"] == 0x99AAB5
    assert payload["components"] == []


async def test_update_expired_continues_on_error(
    channel: DiscordChannel,
    fake_redis: fakeredis.aioredis.FakeRedis,
) -> None:
    """An exception on one item must not stop the rest of the batch."""
    id_1, id_2 = "approval-err", "approval-ok"
    for aid in (id_1, id_2):
        await fake_redis.set(
            f"discord:msg:{_CHANNEL_ID}:{aid}",
            json.dumps({"discord_channel_id": _DISCORD_CHANNEL_ID, "message_id": aid}),
        )
    channel._client.patch = AsyncMock(side_effect=[Exception("boom"), MagicMock()])
    items = [
        {"id": id_1, "agent_id": "a", "tool_name": "t", "env": "e"},
        {"id": id_2, "agent_id": "a", "tool_name": "t", "env": "e"},
    ]
    await channel.update_expired(items)  # must not raise
    assert channel._client.patch.call_count == 2


async def test_supports_interactive(channel: DiscordChannel) -> None:
    assert channel.supports_interactive is True


async def test_close_calls_aclose(channel: DiscordChannel) -> None:
    channel._client.aclose = AsyncMock()
    await channel.close()
    channel._client.aclose.assert_called_once()
