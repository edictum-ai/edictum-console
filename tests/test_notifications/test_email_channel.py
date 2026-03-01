"""Tests for the Email notification channel."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from edictum_server.notifications.email import EmailChannel


@pytest.fixture()
def email_ch() -> EmailChannel:
    return EmailChannel(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="user",
        smtp_password="pass",
        from_address="noreply@example.com",
        to_addresses=["alice@co.com", "bob@co.com"],
        base_url="http://localhost:8000",
        filters={"environments": ["production"]},
    )


@patch("edictum_server.notifications.email.aiosmtplib.send", new_callable=AsyncMock)
async def test_send_approval_request(mock_send: AsyncMock, email_ch: EmailChannel) -> None:
    await email_ch.send_approval_request(
        approval_id="req-1",
        agent_id="billing-agent",
        tool_name="charge_card",
        tool_args=None,
        message="Please approve charge",
        env="production",
        timeout_seconds=300,
        timeout_effect="deny",
        tenant_id="t1",
    )
    mock_send.assert_called_once()
    msg = mock_send.call_args.args[0]
    assert "billing-agent" in msg["Subject"]
    assert "charge_card" in msg["Subject"]
    body = msg.get_content()
    assert "http://localhost:8000/dashboard/approvals?id=req-1" in body


@patch("edictum_server.notifications.email.aiosmtplib.send", new_callable=AsyncMock)
async def test_send_approval_decided(mock_send: AsyncMock, email_ch: EmailChannel) -> None:
    await email_ch.send_approval_decided(
        approval_id="abcdef1234567890",
        status="denied",
        decided_by="admin",
        reason="Not today",
    )
    mock_send.assert_called_once()
    msg = mock_send.call_args.args[0]
    assert "denied" in msg["Subject"]
    assert "abcdef12" in msg["Subject"]


@patch("edictum_server.notifications.email.aiosmtplib.send", new_callable=AsyncMock)
async def test_multiple_to_addresses(mock_send: AsyncMock, email_ch: EmailChannel) -> None:
    await email_ch.send_approval_request(
        approval_id="r1",
        agent_id="a",
        tool_name="t",
        tool_args=None,
        message="m",
        env="prod",
        timeout_seconds=60,
        timeout_effect="deny",
        tenant_id="t1",
    )
    msg = mock_send.call_args.args[0]
    assert "alice@co.com" in msg["To"]
    assert "bob@co.com" in msg["To"]


async def test_close_is_noop(email_ch: EmailChannel) -> None:
    await email_ch.close()  # Should not raise


async def test_filters_property(email_ch: EmailChannel) -> None:
    assert email_ch.filters == {"environments": ["production"]}
