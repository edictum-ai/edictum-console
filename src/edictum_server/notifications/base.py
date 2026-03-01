"""Notification channel protocol and manager for HITL approvals.

Currently only approval_requested and approval_decided events are supported.
Future: add event_type/verdict/severity filters for tool-call events,
deployments, agent status changes, etc.
"""

from __future__ import annotations

import fnmatch
import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class NotificationChannel(ABC):
    """Protocol for pluggable notification backends.

    Implementations: TelegramChannel, SlackChannel, EmailChannel, WebhookChannel.
    """

    @abstractmethod
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
    ) -> None: ...

    @abstractmethod
    async def send_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
    ) -> None: ...

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def supports_interactive(self) -> bool:
        """Whether this channel supports interactive decisions."""
        ...

    @property
    def filters(self) -> dict[str, list[str]] | None:
        """Routing filters for this channel. None = receive everything."""
        return None

    async def close(self) -> None:  # noqa: B027
        """Clean up resources (e.g. httpx clients). Override if needed."""


class NotificationManager:
    """Tenant-keyed fan-out notification manager.

    All channels are DB-configured and scoped to a tenant.
    On fan-out, only channels belonging to the approval's tenant are
    considered — zero cross-tenant leak by construction.
    """

    def __init__(self) -> None:
        self._channels: dict[str, list[NotificationChannel]] = {}

    async def reload(
        self, channels_by_tenant: dict[str, list[NotificationChannel]]
    ) -> None:
        """Replace all channels, closing old ones first."""
        for tenant_channels in self._channels.values():
            for ch in tenant_channels:
                try:
                    await ch.close()
                except Exception:
                    logger.exception("Error closing channel %s", ch.name)
        self._channels = channels_by_tenant

    @property
    def channels(self) -> list[NotificationChannel]:
        """All channels across all tenants (for introspection/shutdown)."""
        return [
            ch
            for tenant_channels in self._channels.values()
            for ch in tenant_channels
        ]

    def channels_for_tenant(self, tenant_id: str) -> list[NotificationChannel]:
        """Channels belonging to a specific tenant."""
        return list(self._channels.get(tenant_id, []))

    async def notify_approval_request(
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
        channels = self.channels_for_tenant(tenant_id)
        logger.info(
            "notify_approval_request: tenant=%s channels=%d approval=%s",
            tenant_id, len(channels), approval_id,
        )
        for channel in channels:
            if not _matches_filters(
                channel, env=env, agent_id=agent_id, contract_name=contract_name
            ):
                logger.info("Channel %s filtered out for approval %s", channel.name, approval_id)
                continue
            try:
                await channel.send_approval_request(
                    approval_id=approval_id,
                    agent_id=agent_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    message=message,
                    env=env,
                    timeout_seconds=timeout_seconds,
                    timeout_effect=timeout_effect,
                    tenant_id=tenant_id,
                    contract_name=contract_name,
                )
            except Exception:
                logger.exception(
                    "Failed to send approval request via %s", channel.name
                )

    async def notify_approval_decided(
        self,
        *,
        approval_id: str,
        status: str,
        decided_by: str | None,
        reason: str | None,
        tenant_id: str,
    ) -> None:
        for channel in self.channels_for_tenant(tenant_id):
            try:
                await channel.send_approval_decided(
                    approval_id=approval_id,
                    status=status,
                    decided_by=decided_by,
                    reason=reason,
                )
            except Exception:
                logger.exception(
                    "Failed to send approval decision via %s", channel.name
                )


def _matches_filters(
    channel: NotificationChannel,
    *,
    env: str,
    agent_id: str,
    contract_name: str | None,
) -> bool:
    """Check if an approval matches a channel's routing filters.

    All non-empty filter dimensions are AND-ed.
    Empty/null filters = receive everything.
    """
    filters = channel.filters
    if not filters:
        return True
    envs = filters.get("environments")
    if envs and env not in envs:
        return False
    agent_patterns = filters.get("agent_patterns")
    if agent_patterns and not any(
        fnmatch.fnmatchcase(agent_id, p) for p in agent_patterns
    ):
        return False
    contract_patterns = filters.get("contract_names")
    if contract_patterns and contract_name:
        return any(fnmatch.fnmatchcase(contract_name, p) for p in contract_patterns)
    return True
