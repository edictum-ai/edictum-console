"""Notification channel protocol and manager for HITL approvals."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class NotificationChannel(ABC):
    """Protocol for pluggable notification backends.

    Implementations: TelegramChannel (first), Slack (planned).
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


class NotificationManager:
    """Fan-out notification manager. Sends to all registered channels."""

    def __init__(self, channels: list[NotificationChannel] | None = None) -> None:
        self._channels: list[NotificationChannel] = channels or []

    def add_channel(self, channel: NotificationChannel) -> None:
        self._channels.append(channel)

    @property
    def channels(self) -> list[NotificationChannel]:
        return list(self._channels)

    async def notify_approval_request(self, **kwargs: Any) -> None:
        for channel in self._channels:
            try:
                await channel.send_approval_request(**kwargs)
            except Exception:
                logger.exception(
                    "Failed to send approval request via %s", channel.name
                )

    async def notify_approval_decided(self, **kwargs: Any) -> None:
        for channel in self._channels:
            try:
                await channel.send_approval_decided(**kwargs)
            except Exception:
                logger.exception(
                    "Failed to send approval decision via %s", channel.name
                )
