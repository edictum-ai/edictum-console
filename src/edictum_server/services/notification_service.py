"""Service for notification channel CRUD and testing."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import NotificationChannel

REQUIRED_CONFIG: dict[str, list[str]] = {
    "telegram": ["bot_token", "chat_id"],
    "slack": ["webhook_url"],
    "webhook": ["url"],
}


def _validate_config(channel_type: str, config: dict) -> None:
    """Raise ValueError if required config keys are missing."""
    required = REQUIRED_CONFIG.get(channel_type, [])
    missing = [k for k in required if k not in config]
    if missing:
        raise ValueError(f"Missing required config keys for {channel_type}: {', '.join(missing)}")


async def list_channels(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[NotificationChannel]:
    """List all notification channels for a tenant."""
    result = await db.execute(
        select(NotificationChannel)
        .where(NotificationChannel.tenant_id == tenant_id)
        .order_by(NotificationChannel.created_at.desc())
    )
    return list(result.scalars().all())


async def get_channel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    channel_id: uuid.UUID,
) -> NotificationChannel | None:
    """Get a single channel, scoped to tenant. Returns None if not found."""
    result = await db.execute(
        select(NotificationChannel).where(
            NotificationChannel.id == channel_id,
            NotificationChannel.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def create_channel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    name: str,
    channel_type: str,
    config: dict,
) -> NotificationChannel:
    """Create a new notification channel. Caller commits."""
    _validate_config(channel_type, config)
    channel = NotificationChannel(
        tenant_id=tenant_id,
        name=name,
        channel_type=channel_type,
        config=config,
    )
    db.add(channel)
    await db.flush()
    return channel


async def update_channel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    channel_id: uuid.UUID,
    *,
    name: str | None = None,
    config: dict | None = None,
    enabled: bool | None = None,
) -> NotificationChannel | None:
    """Update a notification channel. Returns None if not found. Caller commits."""
    channel = await get_channel(db, tenant_id, channel_id)
    if channel is None:
        return None

    if name is not None:
        channel.name = name
    if config is not None:
        _validate_config(channel.channel_type, config)
        channel.config = config
    if enabled is not None:
        channel.enabled = enabled

    await db.flush()
    return channel


async def delete_channel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    channel_id: uuid.UUID,
) -> bool:
    """Delete a notification channel. Returns False if not found. Caller commits."""
    channel = await get_channel(db, tenant_id, channel_id)
    if channel is None:
        return False
    await db.delete(channel)
    await db.flush()
    return True


async def test_channel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    channel_id: uuid.UUID,
) -> tuple[bool, str]:
    """Send a test message through a channel. Updates last_test_* fields.

    Returns (success, message). Caller commits.
    """
    channel = await get_channel(db, tenant_id, channel_id)
    if channel is None:
        raise ValueError("Channel not found")

    success = False
    message = ""

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if channel.channel_type == "telegram":
                resp = await client.post(
                    f"https://api.telegram.org/bot{channel.config['bot_token']}/sendMessage",
                    json={
                        "chat_id": channel.config["chat_id"],
                        "text": "Edictum test notification — channel is working.",
                    },
                )
                resp.raise_for_status()
                success = True
                message = "Telegram message sent successfully."

            elif channel.channel_type == "slack":
                resp = await client.post(
                    channel.config["webhook_url"],
                    json={"text": "Edictum test notification — channel is working."},
                )
                resp.raise_for_status()
                success = True
                message = "Slack message sent successfully."

            elif channel.channel_type == "webhook":
                resp = await client.post(
                    channel.config["url"],
                    json={
                        "event": "test",
                        "message": "Edictum test notification — channel is working.",
                    },
                )
                resp.raise_for_status()
                success = True
                message = "Webhook delivered successfully."

            else:
                message = f"Unknown channel type: {channel.channel_type}"

    except httpx.HTTPStatusError as exc:
        message = f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
    except httpx.RequestError as exc:
        message = f"Connection error: {exc}"

    channel.last_test_at = datetime.now(UTC)
    channel.last_test_ok = success
    await db.flush()

    return success, message
