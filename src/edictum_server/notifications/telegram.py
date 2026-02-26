"""Telegram notification channel -- HITL approval notifications via Telegram Bot API."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
import redis.asyncio as aioredis

from edictum_server.notifications.base import NotificationChannel

logger = logging.getLogger(__name__)

_STATUS_EMOJI = {"approved": "\u2705", "denied": "\u274c", "timeout": "\u23f0"}


class TelegramAPIError(Exception):
    """Raised when the Telegram API returns a non-OK response."""

    def __init__(self, message: str, error_code: int | None = None) -> None:
        super().__init__(message)
        self.error_code = error_code


class TelegramClient:
    """Thin async wrapper around the Telegram Bot API."""

    def __init__(self, token: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"https://api.telegram.org/bot{token}",
            timeout=10.0,
        )

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "HTML",
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return await self._post("/sendMessage", payload)

    async def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "HTML",
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return await self._post("/editMessageText", payload)

    async def answer_callback_query(
        self,
        callback_query_id: str,
        text: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text is not None:
            payload["text"] = text
        return await self._post("/answerCallbackQuery", payload)

    async def set_webhook(self, url: str, secret_token: str) -> dict[str, Any]:
        return await self._post(
            "/setWebhook",
            {
                "url": url,
                "secret_token": secret_token,
                "allowed_updates": ["callback_query"],
                "drop_pending_updates": True,
            },
        )

    async def delete_webhook(self) -> dict[str, Any]:
        return await self._post("/deleteWebhook", {})

    async def close(self) -> None:
        await self._client.aclose()

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._client.post(path, json=payload)
        data: dict[str, Any] = resp.json()
        if not data.get("ok"):
            logger.error("Telegram API error on %s: %s", path, data)
            msg = data.get("description", "Unknown Telegram API error")
            raise TelegramAPIError(msg, error_code=data.get("error_code"))
        result: dict[str, Any] = data["result"]
        return result


class TelegramChannel(NotificationChannel):
    """Telegram notification channel for HITL approvals."""

    def __init__(
        self,
        client: TelegramClient,
        chat_id: int,
        redis: aioredis.Redis,
    ) -> None:
        self.client = client
        self._chat_id = chat_id
        self._redis = redis

    @property
    def name(self) -> str:
        return "telegram"

    @property
    def supports_interactive(self) -> bool:
        return True

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
    ) -> None:
        text = self._format_approval(
            agent_id,
            tool_name,
            tool_args,
            message,
            env,
            timeout_seconds,
            timeout_effect,
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
            chat_id=self._chat_id,
            text=text,
            reply_markup=reply_markup,
        )
        ttl = timeout_seconds + 60
        msg_data = json.dumps(
            {
                "chat_id": self._chat_id,
                "message_id": result["message_id"],
            }
        )
        await self._redis.set(f"telegram:msg:{approval_id}", msg_data, ex=ttl)
        await self._redis.set(f"telegram:tenant:{approval_id}", tenant_id, ex=ttl)

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        raw = await self._redis.get(f"telegram:msg:{approval_id}")
        if raw is None:
            return
        msg_info = json.loads(raw)
        emoji = _STATUS_EMOJI.get(status, "")
        text = (
            f"<b>HITL Approval \u2014 {emoji} {status.upper()}</b>\n\n"
            f"<b>Decision:</b> {status}\n"
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
                raw = await self._redis.get(f"telegram:msg:{approval_id}")
                if raw is None:
                    continue
                msg_info = json.loads(raw)
                text = (
                    f"<b>HITL Approval \u2014 \u23f0 EXPIRED</b>\n\n"
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
                    "Failed to update expired message for %s",
                    item.get("id"),
                )

    async def update_decision(
        self,
        approval_id: str,
        status: str,
        decided_by: str | None,
    ) -> None:
        """Edit the original message to reflect the decision."""
        await self.send_approval_decided(
            approval_id=approval_id,
            status=status,
            decided_by=decided_by,
            reason=None,
        )

    @staticmethod
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
            "<b>HITL Approval Request</b>",
            "",
            f"<b>Agent:</b> {agent_id}",
            f"<b>Tool:</b> {tool_name}",
            f"<b>Env:</b> {env}",
            f"<b>Timeout:</b> {timeout_seconds}s ({timeout_effect} on timeout)",
            "",
            "<b>Message:</b>",
            message,
        ]
        if tool_args is not None:
            args_str = json.dumps(tool_args, indent=2)[:500]
            lines.extend(["", "<b>Arguments:</b>", f"<code>{args_str}</code>"])
        return "\n".join(lines)
