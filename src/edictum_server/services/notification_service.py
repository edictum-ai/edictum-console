"""Service for notification channel CRUD and testing."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import NotificationChannel
from edictum_server.services.channel_test_helpers import test_email, test_http_channel

REQUIRED_CONFIG: dict[str, list[str]] = {
    "telegram": ["bot_token", "chat_id"],
    "slack": ["webhook_url"],
    "slack_app": ["bot_token", "signing_secret", "slack_channel"],
    "webhook": ["url"],
    "email": [
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_password",
        "from_address",
        "to_addresses",
    ],
    "discord": ["bot_token", "public_key", "discord_channel_id"],
}

_UNSET = object()


def _validate_config(channel_type: str, config: dict) -> None:  # noqa: ANN001
    """Raise ValueError if required config keys are missing."""
    required = REQUIRED_CONFIG.get(channel_type, [])
    missing = [k for k in required if k not in config]
    if missing:
        raise ValueError(
            f"Missing required config keys for {channel_type}: {', '.join(missing)}"
        )


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
    filters: dict | None = None,
) -> NotificationChannel:
    """Create a new notification channel. Caller commits."""
    _validate_config(channel_type, config)
    # Auto-generate webhook_secret for Telegram DB channels
    if channel_type == "telegram" and "webhook_secret" not in config:
        config = {**config, "webhook_secret": secrets.token_urlsafe(32)}
    channel = NotificationChannel(
        tenant_id=tenant_id,
        name=name,
        channel_type=channel_type,
        config=config,
        filters=filters,
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
    filters: object = _UNSET,
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
    if filters is not _UNSET:
        channel.filters = filters  # type: ignore[assignment]

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
        if channel.channel_type == "email":
            success, message = await test_email(channel.config)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                success, message = await test_http_channel(
                    client, channel.channel_type, channel.config
                )
    except httpx.HTTPStatusError as exc:
        message = f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
    except httpx.RequestError as exc:
        message = f"Connection error: {exc}"
    except Exception as exc:
        message = f"Error: {exc}"

    channel.last_test_at = datetime.now(UTC)
    channel.last_test_ok = success
    await db.flush()

    return success, message
