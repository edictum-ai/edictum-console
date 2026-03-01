"""Service for notification channel CRUD and testing."""

from __future__ import annotations

import secrets
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
    "email": [
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_password",
        "from_address",
        "to_addresses",
    ],
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
            success, message = await _test_email(channel.config)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                success, message = await _test_http_channel(
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


async def _test_http_channel(
    client: httpx.AsyncClient,
    channel_type: str,
    config: dict,
) -> tuple[bool, str]:
    """Test HTTP-based channels (telegram, slack, webhook)."""
    if channel_type == "telegram":
        resp = await client.post(
            f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
            json={
                "chat_id": config["chat_id"],
                "text": "Edictum test notification — channel is working.",
            },
        )
        resp.raise_for_status()
        return True, "Telegram message sent successfully."

    if channel_type == "slack":
        resp = await client.post(
            config["webhook_url"],
            json={"text": "Edictum test notification — channel is working."},
        )
        resp.raise_for_status()
        return True, "Slack message sent successfully."

    if channel_type == "webhook":
        resp = await client.post(
            config["url"],
            json={
                "event": "test",
                "message": "Edictum test notification — channel is working.",
            },
        )
        resp.raise_for_status()
        return True, "Webhook delivered successfully."

    return False, f"Unknown channel type: {channel_type}"


async def _test_email(config: dict) -> tuple[bool, str]:
    """Test email channel via aiosmtplib."""
    from email.message import EmailMessage

    import aiosmtplib

    msg = EmailMessage()
    msg["Subject"] = "[Edictum] Test Notification"
    msg["From"] = config["from_address"]
    msg["To"] = ", ".join(config["to_addresses"])
    msg.set_content("Edictum test notification — email channel is working.")

    await aiosmtplib.send(
        msg,
        hostname=config["smtp_host"],
        port=int(config["smtp_port"]),
        username=config["smtp_user"],
        password=config["smtp_password"],
        start_tls=True,
    )
    return True, "Email sent successfully."
