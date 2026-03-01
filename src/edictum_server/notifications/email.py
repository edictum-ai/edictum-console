"""Email notification channel — sends approval alerts via SMTP with dashboard deep links."""

from __future__ import annotations

import logging
from email.message import EmailMessage
from typing import Any

import aiosmtplib

from edictum_server.notifications.base import NotificationChannel

logger = logging.getLogger(__name__)

_STATUS_EMOJI = {"approved": "✅", "denied": "❌", "timeout": "⏰"}


class EmailChannel(NotificationChannel):

    def __init__(
        self,
        *,
        smtp_host: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
        from_address: str,
        to_addresses: list[str],
        base_url: str,
        channel_name: str = "Email",
        channel_id: str = "",
        filters: dict[str, list[str]] | None = None,
    ) -> None:
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._smtp_user = smtp_user
        self._smtp_password = smtp_password
        self._from_address = from_address
        self._to_addresses = to_addresses
        self._base_url = base_url.rstrip("/")
        self._name = channel_name
        self._channel_id = channel_id
        self._filters = filters

    @property
    def name(self) -> str:
        return self._name

    @property
    def supports_interactive(self) -> bool:
        return False

    @property
    def filters(self) -> dict[str, list[str]] | None:
        return self._filters

    async def send_approval_request(
        self,
        *,
        approval_id: str,
        agent_id: str,
        tool_name: str,
        tool_args: dict[str, Any] | None,  # noqa: ARG002
        message: str,
        env: str,
        timeout_seconds: int,
        timeout_effect: str,
        tenant_id: str,  # noqa: ARG002
        contract_name: str | None = None,  # noqa: ARG002
    ) -> None:
        deep_link = f"{self._base_url}/dashboard/approvals?id={approval_id}"
        subject = f"[Edictum] Approval Requested — {agent_id} wants to call {tool_name}"
        html = (
            "<h2>HITL Approval Request</h2>"
            f"<p><b>Agent:</b> {agent_id}<br>"
            f"<b>Tool:</b> {tool_name}<br>"
            f"<b>Env:</b> {env}<br>"
            f"<b>Timeout:</b> {timeout_seconds}s ({timeout_effect})</p>"
            f"<p><b>Message:</b> {message}</p>"
            f'<p><a href="{deep_link}" style="display:inline-block;padding:10px 20px;'
            'background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">'
            "Review &amp; Decide</a></p>"
        )
        await self._send_email(subject, html)

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        emoji = _STATUS_EMOJI.get(status, "")
        subject = f"[Edictum] Approval {status} — {approval_id[:8]}"
        html = (
            f"<h2>{emoji} Approval {status.upper()}</h2>"
            f"<p><b>Decision:</b> {status}<br>"
            f"<b>Decided by:</b> {decided_by or 'system'}</p>"
        )
        if reason:
            html += f"<p><b>Reason:</b> {reason}</p>"
        await self._send_email(subject, html)

    async def _send_email(self, subject: str, html_body: str) -> None:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self._from_address
        msg["To"] = ", ".join(self._to_addresses)
        msg.set_content(html_body, subtype="html")
        await aiosmtplib.send(
            msg,
            hostname=self._smtp_host,
            port=self._smtp_port,
            username=self._smtp_user,
            password=self._smtp_password,
            start_tls=True,
        )

    async def close(self) -> None:
        pass  # No persistent connection
