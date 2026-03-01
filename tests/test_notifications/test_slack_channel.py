"""Tests for the Slack notification channel."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from edictum_server.notifications.slack import SlackChannel


@pytest.fixture()
def slack() -> SlackChannel:
    return SlackChannel(
        webhook_url="https://hooks.slack.com/test",
        base_url="http://localhost:8000",
        filters={"environments": ["production"]},
    )


async def test_send_approval_request_block_kit(slack: SlackChannel) -> None:
    slack._client.post = AsyncMock()
    await slack.send_approval_request(
        approval_id="abc-123",
        agent_id="billing-agent",
        tool_name="send_invoice",
        tool_args={"amount": 100},
        message="Please approve",
        env="production",
        timeout_seconds=300,
        timeout_effect="deny",
        tenant_id="t1",
    )
    slack._client.post.assert_called_once()
    payload = slack._client.post.call_args.kwargs["json"]
    blocks = payload["blocks"]
    assert blocks[0]["type"] == "header"
    # Section fields: agent, tool, env, timeout
    fields = blocks[1]["fields"]
    assert any("billing-agent" in f["text"] for f in fields)
    assert any("send_invoice" in f["text"] for f in fields)
    assert any("production" in f["text"] for f in fields)
    assert any("300" in f["text"] for f in fields)
    # Message section
    assert "Please approve" in blocks[2]["text"]["text"]
    # Action button with deep link
    btn = blocks[3]["elements"][0]
    assert btn["url"] == "http://localhost:8000/dashboard/approvals?id=abc-123"


async def test_send_approval_decided(slack: SlackChannel) -> None:
    slack._client.post = AsyncMock()
    await slack.send_approval_decided(
        approval_id="abc-12345678",
        status="approved",
        decided_by="admin@co.com",
        reason=None,
    )
    payload = slack._client.post.call_args.kwargs["json"]
    assert "approved" in payload["text"]
    assert "abc-1234" in payload["text"]


async def test_close_calls_aclose(slack: SlackChannel) -> None:
    slack._client.aclose = AsyncMock()
    await slack.close()
    slack._client.aclose.assert_called_once()


async def test_filters_property(slack: SlackChannel) -> None:
    assert slack.filters == {"environments": ["production"]}
