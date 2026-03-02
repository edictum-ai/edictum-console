"""Telegram notification channel -- HITL approval notifications via Telegram Bot API."""

from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from edictum_server.notifications.base import NotificationChannel
from edictum_server.notifications.telegram_client import TelegramClient

logger = logging.getLogger(__name__)

_STATUS_EMOJI = {"approved": "\u2705", "denied": "\u274c", "timeout": "\u23f0"}

# Re-export for backwards compatibility
__all__ = ["TelegramChannel", "TelegramClient"]


class TelegramChannel(NotificationChannel):
    """Telegram notification channel for HITL approvals."""

    def __init__(
        self,
        client: TelegramClient,
        chat_id: int,
        redis: aioredis.Redis,  # type: ignore[type-arg]
        channel_id: str = "env",
        channel_name: str = "telegram",
        filters: dict[str, list[str]] | None = None,
        webhook_secret: str = "",
    ) -> None:
        self.client = client
        self._chat_id = chat_id
        self._redis = redis
        self._channel_id = channel_id
        self._channel_name = channel_name
        self._filters = filters
        self._webhook_secret = webhook_secret

    @property
    def name(self) -> str:
        return self._channel_name

    @property
    def channel_id(self) -> str:
        return self._channel_id

    @property
    def supports_interactive(self) -> bool:
        return True

    @property
    def filters(self) -> dict[str, list[str]] | None:
        return self._filters

    def _msg_key(self, approval_id: str) -> str:
        return f"telegram:msg:{self._channel_id}:{approval_id}"

    def _tenant_key(self, approval_id: str) -> str:
        return f"telegram:tenant:{self._channel_id}:{approval_id}"

    async def send_approval_request(
        self,
        *,
        approval_id: str,
        agent_id: str,
        tool_name: str,
        tool_args: dict[str, Any] | None,
        message: str,
        env: str,
        timeout_seconds: int,
        timeout_effect: str,
        tenant_id: str,
        contract_name: str | None = None,  # noqa: ARG002
    ) -> None:
        text = _format_approval(
            agent_id, tool_name, tool_args, message, env,
            timeout_seconds, timeout_effect,
        )
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "\u2705 Approve", "callback_data": f"approve:{approval_id}"},
                    {"text": "\u274c Deny", "callback_data": f"deny:{approval_id}"},
                ]
            ],
        }
        result = await self.client.send_message(
            chat_id=self._chat_id, text=text, reply_markup=reply_markup,
        )
        _SEVEN_DAYS = 86400 * 7
        msg_data = json.dumps(
            {"chat_id": self._chat_id, "message_id": result["message_id"]}
        )
        await self._redis.set(self._msg_key(approval_id), msg_data, ex=_SEVEN_DAYS)
        await self._redis.set(self._tenant_key(approval_id), tenant_id, ex=_SEVEN_DAYS)

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        raw = await self._redis.get(self._msg_key(approval_id))
        if raw is None:
            return
        msg_info = json.loads(raw)
        _label = {"approved": "Approved ✅", "denied": "Denied ❌", "timeout": "Expired ⏰"}
        label = _label.get(status, status.capitalize())
        text = (
            f"<b>Request {status.capitalize()}</b>\n\n"
            f"<b>Decision:</b> {label}\n"
            f"<b>Decided by:</b> {decided_by or 'unknown'}"
        )
        if reason:
            text += f"\n<b>Reason:</b> {reason}"
        await self.client.edit_message_text(
            chat_id=msg_info["chat_id"],
            message_id=msg_info["message_id"],
            text=text,
            reply_markup={"inline_keyboard": []},
        )

    async def update_expired(self, expired_items: list[dict[str, Any]]) -> None:
        """Update Telegram messages for expired approvals."""
        for item in expired_items:
            try:
                approval_id = item["id"]
                raw = await self._redis.get(self._msg_key(approval_id))
                if raw is None:
                    continue
                msg_info = json.loads(raw)
                text = (
                    "<b>HITL Approval \u2014 \u23f0 EXPIRED</b>\n\n"
                    f"<b>Agent:</b> {item.get('agent_id', 'unknown')}\n"
                    f"<b>Tool:</b> {item.get('tool_name', 'unknown')}\n"
                    f"<b>Env:</b> {item.get('env', 'unknown')}"
                )
                await self.client.edit_message_text(
                    chat_id=msg_info["chat_id"],
                    message_id=msg_info["message_id"],
                    text=text,
                    reply_markup={"inline_keyboard": []},
                )
            except Exception:
                logger.exception(
                    "Failed to update expired message for %s", item.get("id"),
                )

    async def update_decision(
        self, approval_id: str, status: str, decided_by: str | None,
    ) -> None:
        """Edit the original message to reflect the decision."""
        await self.send_approval_decided(
            approval_id=approval_id, status=status,
            decided_by=decided_by, reason=None,
        )

    async def register_webhook(self, base_url: str) -> None:
        """Register the Telegram webhook URL for this channel."""
        webhook_url = f"{base_url.rstrip('/')}/api/v1/telegram/webhook/{self._channel_id}"
        await self.client.set_webhook(webhook_url, self._webhook_secret)
        logger.info("Registered Telegram webhook for channel %s", self._channel_id)

    async def close(self) -> None:
        await self.client.aclose()


def _format_approval(
    agent_id: str,
    tool_name: str,
    tool_args: dict[str, Any] | None,
    message: str,
    env: str,
    timeout_seconds: int,
    timeout_effect: str,
) -> str:
    lines = [
        "<b>HITL Approval Request</b>", "",
        f"<b>Agent:</b> {agent_id}",
        f"<b>Tool:</b> {tool_name}",
        f"<b>Env:</b> {env}",
        f"<b>Timeout:</b> {timeout_seconds}s ({timeout_effect} on timeout)",
        "", "<b>Message:</b>", message,
    ]
    if tool_args is not None:
        args_str = json.dumps(tool_args, indent=2)[:500]
        lines.extend(["", "<b>Arguments:</b>", f"<code>{args_str}</code>"])
    return "\n".join(lines)
