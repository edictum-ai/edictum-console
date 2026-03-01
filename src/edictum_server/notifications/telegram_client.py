"""Thin async wrapper around the Telegram Bot API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


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
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
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

    async def aclose(self) -> None:
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
