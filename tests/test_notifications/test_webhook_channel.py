"""Tests for the Webhook notification channel."""

from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import AsyncMock

import pytest

from edictum_server.notifications.webhook import WebhookChannel


@pytest.fixture()
def webhook() -> WebhookChannel:
    return WebhookChannel(url="https://example.com/hook", secret="s3cret")


@pytest.fixture()
def webhook_no_secret() -> WebhookChannel:
    return WebhookChannel(url="https://example.com/hook")


async def test_send_approval_request_payload(webhook: WebhookChannel) -> None:
    webhook._client.post = AsyncMock()
    await webhook.send_approval_request(
        approval_id="a1",
        agent_id="agent-x",
        tool_name="run_query",
        tool_args={"sql": "SELECT 1"},
        message="Approve this",
        env="staging",
        timeout_seconds=120,
        timeout_effect="deny",
        tenant_id="t1",
        contract_name="security-audit",
    )
    webhook._client.post.assert_called_once()
    body = webhook._client.post.call_args.kwargs["content"]
    payload = json.loads(body)
    assert payload["event"] == "approval_requested"
    assert payload["agent_id"] == "agent-x"
    assert payload["tool_name"] == "run_query"
    assert payload["contract_name"] == "security-audit"


async def test_hmac_signature_present(webhook: WebhookChannel) -> None:
    webhook._client.post = AsyncMock()
    await webhook.send_approval_request(
        approval_id="a1",
        agent_id="ag",
        tool_name="t",
        tool_args=None,
        message="m",
        env="prod",
        timeout_seconds=60,
        timeout_effect="deny",
        tenant_id="t1",
    )
    call_kwargs = webhook._client.post.call_args.kwargs
    body = call_kwargs["content"]
    headers = call_kwargs["headers"]
    expected = hmac.new(b"s3cret", body.encode(), hashlib.sha256).hexdigest()
    assert headers["X-Edictum-Signature"] == f"sha256={expected}"


async def test_no_signature_without_secret(webhook_no_secret: WebhookChannel) -> None:
    webhook_no_secret._client.post = AsyncMock()
    await webhook_no_secret.send_approval_request(
        approval_id="a1",
        agent_id="ag",
        tool_name="t",
        tool_args=None,
        message="m",
        env="prod",
        timeout_seconds=60,
        timeout_effect="deny",
        tenant_id="t1",
    )
    headers = webhook_no_secret._client.post.call_args.kwargs["headers"]
    assert "X-Edictum-Signature" not in headers


async def test_send_approval_decided_payload(webhook: WebhookChannel) -> None:
    webhook._client.post = AsyncMock()
    await webhook.send_approval_decided(
        approval_id="a1",
        status="approved",
        decided_by="admin",
        reason="looks good",
    )
    body = webhook._client.post.call_args.kwargs["content"]
    payload = json.loads(body)
    assert payload["event"] == "approval_decided"
    assert payload["status"] == "approved"
    assert payload["reason"] == "looks good"


async def test_close_calls_aclose(webhook: WebhookChannel) -> None:
    webhook._client.aclose = AsyncMock()
    await webhook.close()
    webhook._client.aclose.assert_called_once()
