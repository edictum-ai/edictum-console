"""Webhook notification channel — fire-and-forget JSON POST with optional HMAC-SHA256."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

import httpx

from edictum_server.notifications.base import NotificationChannel
from edictum_server.security.safe_transport import SafeTransport

logger = logging.getLogger(__name__)


class WebhookChannel(NotificationChannel):
    def __init__(
        self,
        *,
        url: str,
        secret: str | None = None,
        channel_name: str = "Webhook",
        channel_id: str = "",
        filters: dict[str, list[str]] | None = None,
    ) -> None:
        self._url = url
        self._secret = secret
        self._name = channel_name
        self._channel_id = channel_id
        self._filters = filters
        self._client = httpx.AsyncClient(timeout=10.0, transport=SafeTransport())

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
        tool_args: dict[str, Any] | None,
        message: str,
        env: str,
        timeout_seconds: int,
        timeout_effect: str,
        tenant_id: str,
        contract_name: str | None = None,
    ) -> None:
        payload = {
            "event": "approval_requested",
            "approval_id": approval_id,
            "agent_id": agent_id,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "message": message,
            "env": env,
            "timeout_seconds": timeout_seconds,
            "timeout_effect": timeout_effect,
            "tenant_id": tenant_id,
        }
        if contract_name:
            payload["contract_name"] = contract_name
        await self._post(payload)

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        payload = {
            "event": "approval_decided",
            "approval_id": approval_id,
            "status": status,
            "decided_by": decided_by,
            "reason": reason,
        }
        await self._post(payload)

    async def _post(self, payload: dict[str, Any]) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        body = json.dumps(payload)
        if self._secret:
            sig = hmac.new(self._secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            headers["X-Edictum-Signature"] = f"sha256={sig}"
        await self._client.post(self._url, content=body, headers=headers)

    async def close(self) -> None:
        await self._client.aclose()
