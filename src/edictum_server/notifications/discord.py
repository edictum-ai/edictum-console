"""Discord notification channel — HITL approval notifications via Discord Bot API."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
import redis.asyncio as aioredis

from edictum_server.notifications.base import NotificationChannel

logger = logging.getLogger(__name__)

_DISCORD_API = "https://discord.com/api/v10"
_COLOR = {"request": 0xFFA500, "approved": 0x57F287, "denied": 0xED4245, "expired": 0x99AAB5}
_LABEL = {"approved": "Approved \u2705", "denied": "Denied \u274c", "timeout": "Expired \u23f0"}


def _decided_embed(status: str, decided_by: str | None, reason: str | None) -> dict:
    color = _COLOR.get(status, _COLOR["expired"])
    label = _LABEL.get(status, status.upper())
    desc = f"**Decision:** {label}"
    if decided_by:
        desc += f"\n**Decided by:** {decided_by}"
    if reason:
        desc += f"\n**Reason:** {reason}"
    return {"title": f"Request {status.capitalize()}", "description": desc, "color": color}


class DiscordChannel(NotificationChannel):
    """Interactive Discord channel using Bot API + component buttons."""

    def __init__(
        self,
        *,
        bot_token: str,
        public_key: str,
        discord_channel_id: str,
        base_url: str,
        channel_name: str = "Discord",
        channel_id: str = "",
        filters: dict[str, list[str]] | None = None,
        redis: aioredis.Redis,  # type: ignore[type-arg]
    ) -> None:
        self._bot_token = bot_token
        self._public_key = public_key
        self._discord_channel_id = discord_channel_id
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
    def public_key(self) -> str:
        return self._public_key

    @property
    def supports_interactive(self) -> bool:
        return True

    @property
    def filters(self) -> dict[str, list[str]] | None:
        return self._filters

    def _msg_key(self, approval_id: str) -> str:
        return f"discord:msg:{self._channel_id}:{approval_id}"

    def _tenant_key(self, approval_id: str) -> str:
        return f"discord:tenant:{self._channel_id}:{approval_id}"

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bot {self._bot_token}", "Content-Type": "application/json"}

    def _msg_url(self, message_id: str | None = None) -> str:
        base = f"{_DISCORD_API}/channels/{self._discord_channel_id}/messages"
        return f"{base}/{message_id}" if message_id else base

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
        tenant_id: str,
        contract_name: str | None = None,  # noqa: ARG002
    ) -> None:
        deep_link = f"{self._base_url}/dashboard/approvals?id={approval_id}"
        payload = {
            "embeds": [{
                "title": "Approval Requested",
                "description": message,
                "color": _COLOR["request"],
                "fields": [
                    {"name": "Agent", "value": agent_id, "inline": True},
                    {"name": "Tool", "value": tool_name, "inline": True},
                    {"name": "Environment", "value": env, "inline": True},
                    {
                        "name": "Timeout",
                        "value": f"{timeout_seconds}s ({timeout_effect} on timeout)",
                        "inline": True,
                    },
                ],
            }],
            "components": [{"type": 1, "components": [
                {"type": 2, "style": 3, "label": "Approve",
                 "custom_id": f"edictum_approve:{approval_id}"},
                {"type": 2, "style": 4, "label": "Deny",
                 "custom_id": f"edictum_deny:{approval_id}"},
                {"type": 2, "style": 5, "label": "View in Dashboard", "url": deep_link},
            ]}],
        }
        resp = await self._client.post(self._msg_url(), headers=self._auth(), json=payload)
        resp.raise_for_status()
        message_id: str = resp.json()["id"]
        ttl = timeout_seconds + 60
        await self._redis.set(self._tenant_key(approval_id), tenant_id, ex=ttl)
        await self._redis.set(
            self._msg_key(approval_id),
            json.dumps({"discord_channel_id": self._discord_channel_id, "message_id": message_id}),
            ex=ttl,
        )

    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None:
        embed = _decided_embed(status, decided_by, reason)
        raw = await self._redis.get(self._msg_key(approval_id))
        if raw is not None:
            msg_info = json.loads(raw)
            url = (
                f"{_DISCORD_API}/channels/{msg_info['discord_channel_id']}"
                f"/messages/{msg_info['message_id']}"
            )
            await self._client.patch(
                url, headers=self._auth(), json={"embeds": [embed], "components": []},
            )
        else:
            label = _LABEL.get(status, status.upper())
            suffix = f" by {decided_by}" if decided_by else ""
            fallback = f"Approval {approval_id}: {label}{suffix}"
            await self._client.post(
                self._msg_url(), headers=self._auth(), json={"content": fallback}
            )

    async def update_expired(self, expired_items: list[dict[str, str]]) -> None:
        """Update Discord messages for expired approvals."""
        for item in expired_items:
            try:
                raw = await self._redis.get(self._msg_key(item["id"]))
                if raw is None:
                    continue
                msg_info = json.loads(raw)
                desc = (
                    f"**Agent:** {item.get('agent_id', 'unknown')}\n"
                    f"**Tool:** {item.get('tool_name', 'unknown')}\n"
                    f"**Env:** {item.get('env', 'unknown')}"
                )
                url = (
                    f"{_DISCORD_API}/channels/{msg_info['discord_channel_id']}"
                    f"/messages/{msg_info['message_id']}"
                )
                await self._client.patch(
                    url,
                    headers=self._auth(),
                    json={
                        "embeds": [{"title": "Approval Expired", "description": desc,
                                    "color": _COLOR["expired"]}],
                        "components": [],
                    },
                )
            except Exception:
                logger.exception("Failed to update expired Discord message for %s", item.get("id"))

    async def update_decision(
        self, approval_id: str, status: str, decided_by: str | None
    ) -> None:
        """Edit the original message to reflect the decision."""
        await self.send_approval_decided(
            approval_id=approval_id, status=status, decided_by=decided_by, reason=None
        )

    async def close(self) -> None:
        await self._client.aclose()
