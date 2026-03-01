"""Slack App notification channel -- interactive HITL approvals via Block Kit."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
import redis.asyncio as aioredis

from edictum_server.notifications.base import NotificationChannel

logger = logging.getLogger(__name__)

_STATUS_EMOJI = {"approved": "\u2705", "denied": "\u274c", "timeout": "\u23f0"}


class SlackAppChannel(NotificationChannel):
    """Interactive Slack App channel using Bot API + action buttons.

    NOTE: Slack requires an HTTPS URL to deliver interactive payloads (button
    clicks). The Request URL configured in the Slack app under
    "Interactivity & Shortcuts" must point to an HTTPS endpoint:
        https://<your-domain>/api/v1/notifications/slack/interactive
    In local development, use a tunnel such as ngrok to expose an HTTPS URL
    and update both EDICTUM_BASE_URL and the Slack app's Request URL.
    Sending notifications works without HTTPS; only button interactions require it.
    """

    def __init__(
        self,
        *,
        bot_token: str,
        signing_secret: str,
        slack_channel: str,
        base_url: str,
        channel_name: str = "Slack App",
        channel_id: str = "",
        filters: dict[str, list[str]] | None = None,
        redis: aioredis.Redis,  # type: ignore[type-arg]
    ) -> None:
        self._bot_token = bot_token
        self._signing_secret = signing_secret
        self._slack_channel = slack_channel
        self._base_url = base_url.rstrip("/")
        self._channel_name = channel_name
        self._channel_id = channel_id
        self._filters = filters
        self._redis = redis
        self._client = httpx.AsyncClient(timeout=10.0)

    @property
    def name(self) -> str:
        return self._channel_name

    @property
    def channel_id(self) -> str:
        return self._channel_id

    @property
    def signing_secret(self) -> str:
        return self._signing_secret

    @property
    def supports_interactive(self) -> bool:
        return True

    @property
    def filters(self) -> dict[str, list[str]] | None:
        return self._filters

    def _msg_key(self, approval_id: str) -> str:
        return f"slack:msg:{self._channel_id}:{approval_id}"

    def _tenant_key(self, approval_id: str) -> str:
        return f"slack:tenant:{self._channel_id}:{approval_id}"

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
        timeout_effect: str,  # noqa: ARG002
        tenant_id: str,
        contract_name: str | None = None,  # noqa: ARG002
    ) -> None:
        deep_link = f"{self._base_url}/dashboard/approvals?id={approval_id}"
        blocks = [
            {"type": "header", "text": {"type": "plain_text", "text": "Approval Requested"}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Agent:*\n{agent_id}"},
                    {"type": "mrkdwn", "text": f"*Tool:*\n{tool_name}"},
                    {"type": "mrkdwn", "text": f"*Environment:*\n{env}"},
                    {"type": "mrkdwn", "text": f"*Timeout:*\n{timeout_seconds}s"},
                ],
            },
            {"type": "section", "text": {"type": "mrkdwn", "text": message}},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "\u2705 Approve"},
                        "style": "primary",
                        "action_id": f"edictum_approve:{approval_id}",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "\u274c Deny"},
                        "style": "danger",
                        "action_id": f"edictum_deny:{approval_id}",
                    },
                ],
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Or review in dashboard: <{deep_link}|Open in Edictum>",
                    },
                ],
            },
        ]
        resp = await self._client.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {self._bot_token}"},
            json={"channel": self._slack_channel, "blocks": blocks},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Slack chat.postMessage failed: {data.get('error', 'unknown')}")
        ts = data["ts"]
        # Use the channel ID returned by Slack (not the configured name).
        # chat.update requires the channel ID, not a name like #channel-name.
        channel_id = data.get("channel", self._slack_channel)
        ttl = timeout_seconds + 60
        await self._redis.set(self._tenant_key(approval_id), tenant_id, ex=ttl)
        msg_data = json.dumps({"slack_channel": channel_id, "ts": ts})
        await self._redis.set(self._msg_key(approval_id), msg_data, ex=ttl)

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        raw = await self._redis.get(self._msg_key(approval_id))
        _label = {"approved": "Approved :white_check_mark:", "denied": "Denied :x:", "timeout": "Expired :hourglass_flowing_sand:"}
        label = _label.get(status, status.capitalize())
        body = f"*Decision:* {label}"
        if decided_by:
            body += f"\n*Decided by:* {decided_by}"
        if reason:
            body += f"\n*Reason:* {reason}"

        if raw is not None:
            msg_info = json.loads(raw)
            title = f"Request {status.capitalize()}"
            blocks = [
                {"type": "header", "text": {"type": "plain_text", "text": title}},
                {"type": "section", "text": {"type": "mrkdwn", "text": body}},
            ]
            resp = await self._client.post(
                "https://slack.com/api/chat.update",
                headers={"Authorization": f"Bearer {self._bot_token}"},
                json={
                    "channel": msg_info["slack_channel"],
                    "ts": msg_info["ts"],
                    "blocks": blocks,
                },
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning(
                    "Slack chat.update failed for %s: %s",
                    approval_id, data.get("error", "unknown"),
                )
        else:
            fallback = f"Request {status.capitalize()}: {body}"
            resp = await self._client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {self._bot_token}"},
                json={"channel": self._slack_channel, "text": fallback},
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning(
                    "Slack fallback postMessage failed for %s: %s",
                    approval_id, data.get("error", "unknown"),
                )

    async def update_expired(self, expired_items: list[dict[str, Any]]) -> None:
        """Update Slack messages for expired approvals."""
        for item in expired_items:
            try:
                approval_id = item["id"]
                raw = await self._redis.get(self._msg_key(approval_id))
                if raw is None:
                    continue
                msg_info = json.loads(raw)
                agent = item.get("agent_id", "unknown")
                tool = item.get("tool_name", "unknown")
                blocks = [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": "Approval Expired \u23f0"},
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Agent:*\n{agent}"},
                            {"type": "mrkdwn", "text": f"*Tool:*\n{tool}"},
                        ],
                    },
                ]
                resp = await self._client.post(
                    "https://slack.com/api/chat.update",
                    headers={"Authorization": f"Bearer {self._bot_token}"},
                    json={
                        "channel": msg_info["slack_channel"],
                        "ts": msg_info["ts"],
                        "blocks": blocks,
                    },
                )
                data = resp.json()
                if not data.get("ok"):
                    logger.warning(
                        "Slack chat.update failed for expired %s: %s",
                        approval_id, data.get("error", "unknown"),
                    )
            except Exception:
                logger.exception("Failed to update expired Slack message for %s", item.get("id"))

    async def update_decision(
        self, approval_id: str, status: str, decided_by: str | None,
    ) -> None:
        """Edit the original message to reflect the decision."""
        await self.send_approval_decided(
            approval_id=approval_id,
            status=status,
            decided_by=decided_by,
            reason=None,
        )

    async def close(self) -> None:
        await self._client.aclose()
