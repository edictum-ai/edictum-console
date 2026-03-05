"""Service for notification channel CRUD and testing."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import UTC, datetime

import httpx
from nacl.secret import SecretBox
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import NotificationChannel
from edictum_server.security.validators import ValidationError as SecurityError
from edictum_server.security.validators import validate_url
from edictum_server.services.channel_test_helpers import test_email, test_http_channel

# Fields per channel type that contain outbound URLs (SSRF targets)
_URL_FIELDS: dict[str, list[str]] = {
    "webhook": ["url"],
    "slack": ["webhook_url"],
}

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


def encrypt_config(config: dict, secret: bytes) -> bytes:
    """Encrypt a config dict using NaCl SecretBox.

    Args:
        config: The plain-text config dictionary.
        secret: 32-byte encryption key (EDICTUM_SIGNING_KEY_SECRET).

    Returns:
        Encrypted bytes suitable for ``config_encrypted`` column.
    """
    box = SecretBox(secret)
    return box.encrypt(json.dumps(config).encode("utf-8"))


def decrypt_config(encrypted: bytes, secret: bytes) -> dict:
    """Decrypt a config dict from ``config_encrypted``.

    Args:
        encrypted: Encrypted bytes from the DB column.
        secret: 32-byte decryption key.

    Returns:
        The original config dictionary.
    """
    box = SecretBox(secret)
    plaintext = box.decrypt(encrypted)
    return json.loads(plaintext)  # type: ignore[no-any-return]


def get_channel_config(channel: NotificationChannel, secret: bytes) -> dict:
    """Read the config from a channel, preferring encrypted over plain.

    Handles both migrated (encrypted) and un-migrated (plain JSON) rows.
    """
    if channel.config_encrypted is not None:
        return decrypt_config(channel.config_encrypted, secret)
    return channel.config or {}


def _set_channel_config(
    channel: NotificationChannel,
    config: dict,
    secret: bytes,
) -> None:
    """Write config to a channel — encrypted at rest, plain column cleared."""
    channel.config_encrypted = encrypt_config(config, secret)
    channel.config = None  # Clear plain-text so secrets don't linger


def _validate_config(channel_type: str, config: dict) -> None:  # noqa: ANN001
    """Raise ValueError if required config keys are missing."""
    required = REQUIRED_CONFIG.get(channel_type, [])
    missing = [k for k in required if k not in config]
    if missing:
        raise ValueError(
            f"Missing required config keys for {channel_type}: {', '.join(missing)}"
        )


async def _validate_urls(channel_type: str, config: dict) -> None:  # noqa: ANN001
    """Validate outbound URLs in channel config to prevent SSRF attacks."""
    for field in _URL_FIELDS.get(channel_type, []):
        if field in config:
            try:
                await validate_url(config[field])
            except SecurityError as exc:
                raise ValueError(f"Invalid {field}: {exc}") from exc


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
    secret: bytes | None = None,
) -> NotificationChannel:
    """Create a new notification channel. Caller commits.

    Args:
        secret: 32-byte encryption key. If None, config is stored as
                plain JSON (for environments without signing key configured).
    """
    _validate_config(channel_type, config)
    await _validate_urls(channel_type, config)
    # Auto-generate webhook_secret for Telegram DB channels
    if channel_type == "telegram" and "webhook_secret" not in config:
        config = {**config, "webhook_secret": secrets.token_urlsafe(32)}

    channel = NotificationChannel(
        tenant_id=tenant_id,
        name=name,
        channel_type=channel_type,
        filters=filters,
    )
    if secret is not None:
        _set_channel_config(channel, config, secret)
    else:
        channel.config = config
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
    secret: bytes | None = None,
) -> NotificationChannel | None:
    """Update a notification channel. Returns None if not found. Caller commits.

    Args:
        secret: 32-byte encryption key. If None, config update is stored as
                plain JSON (for environments without signing key configured).
    """
    channel = await get_channel(db, tenant_id, channel_id)
    if channel is None:
        return None

    if name is not None:
        channel.name = name
    if config is not None:
        _validate_config(channel.channel_type, config)
        await _validate_urls(channel.channel_type, config)
        if secret is not None:
            _set_channel_config(channel, config, secret)
        else:
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
    *,
    secret: bytes | None = None,
) -> tuple[bool, str]:
    """Send a test message through a channel. Updates last_test_* fields.

    Returns (success, message). Caller commits.

    Args:
        secret: 32-byte key to decrypt config_encrypted. If None, falls
                back to plain ``config`` column.
    """
    channel = await get_channel(db, tenant_id, channel_id)
    if channel is None:
        raise ValueError("Channel not found")

    config = get_channel_config(channel, secret) if secret else (channel.config or {})
    success = False
    message = ""

    try:
        if channel.channel_type == "email":
            success, message = await test_email(config)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                success, message = await test_http_channel(
                    client, channel.channel_type, config
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
