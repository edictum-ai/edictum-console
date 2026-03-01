"""Slack notification channel — sends approval alerts with dashboard deep links."""

from __future__ import annotations

from typing import Any

import httpx

from edictum_server.notifications.base import NotificationChannel

_STATUS_EMOJI = {"approved": "✅", "denied": "❌", "timeout": "⏰"}


class SlackChannel(NotificationChannel):

    def __init__(
        self,
        *,
        webhook_url: str,
        base_url: str,
        channel_name: str = "Slack",
        channel_id: str = "",
        filters: dict[str, list[str]] | None = None,
    ) -> None:
        self._webhook_url = webhook_url
        self._base_url = base_url.rstrip("/")
        self._name = channel_name
        self._channel_id = channel_id
        self._filters = filters
        self._client = httpx.AsyncClient(timeout=10.0)

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
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "Approval Requested"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Agent:* {agent_id}"},
                    {"type": "mrkdwn", "text": f"*Tool:* `{tool_name}`"},
                    {"type": "mrkdwn", "text": f"*Env:* {env}"},
                    {
                        "type": "mrkdwn",
                        "text": f"*Timeout:* {timeout_seconds}s ({timeout_effect})",
                    },
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Message:* {message}"},
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Review in Dashboard",
                        },
                        "url": deep_link,
                        "style": "primary",
                    },
                ],
            },
        ]
        await self._client.post(self._webhook_url, json={"blocks": blocks})

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        emoji = _STATUS_EMOJI.get(status, "")
        text = f"{emoji} Approval `{approval_id[:8]}` *{status}* by {decided_by or 'system'}"
        if reason:
            text += f"\n> {reason}"
        await self._client.post(self._webhook_url, json={"text": text})

    async def close(self) -> None:
        await self._client.aclose()
