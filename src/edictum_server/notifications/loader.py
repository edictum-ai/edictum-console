"""Load DB-configured notification channels into live instances.

The loader queries all enabled channels (across all tenants), groups them
by tenant_id, and returns a dict ready for NotificationManager.reload().
"""

from __future__ import annotations

import logging
from collections import defaultdict

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import NotificationChannel as ChannelModel
from edictum_server.notifications.base import NotificationChannel
from edictum_server.services.notification_service import get_channel_config

logger = logging.getLogger(__name__)


async def load_db_channels(
    db: AsyncSession,
    redis: aioredis.Redis,  # type: ignore[type-arg]
    base_url: str,
    *,
    secret: bytes | None = None,
) -> dict[str, list[NotificationChannel]]:
    """Query all enabled channels, group by tenant, return live instances.

    Telegram channels get their webhooks registered with the Telegram API
    so callback queries are routed to our endpoint.

    Args:
        secret: 32-byte key to decrypt ``config_encrypted``. If None,
                falls back to plain ``config`` column (un-migrated rows).
    """
    result = await db.execute(
        select(ChannelModel).where(ChannelModel.enabled == True)  # noqa: E712
    )
    channels_by_tenant: dict[str, list[NotificationChannel]] = defaultdict(list)
    for row in result.scalars():
        try:
            ch = _build_channel(row, redis=redis, base_url=base_url, secret=secret)
            if ch is not None:
                channels_by_tenant[str(row.tenant_id)].append(ch)
                await _register_webhook_if_telegram(ch, base_url)
        except Exception:
            logger.warning(
                "Failed to build channel %s (%s), skipping",
                row.id,
                row.name,
                exc_info=True,
            )
    return dict(channels_by_tenant)


async def _register_webhook_if_telegram(
    ch: NotificationChannel, base_url: str
) -> None:
    """Register Telegram webhook so callback queries reach our endpoint.

    NOTE: Telegram's Bot API requires an HTTPS URL for webhooks. Interactive
    buttons (approve/deny) will not work unless EDICTUM_BASE_URL is an HTTPS
    endpoint reachable by Telegram's servers. In local development, use a
    tunnel such as ngrok to expose an HTTPS URL.
    """
    if not hasattr(ch, "register_webhook"):
        return
    if not base_url.startswith("https://"):
        logger.warning(
            "Skipping Telegram webhook registration for channel %s — "
            "EDICTUM_BASE_URL must be HTTPS for interactive buttons (got %s)",
            ch.name,
            base_url,
        )
        return
    try:
        await ch.register_webhook(base_url)  # type: ignore[attr-defined]
    except Exception:
        logger.warning(
            "Failed to register Telegram webhook for channel %s, "
            "interactive buttons won't work until next reload",
            ch.name,
            exc_info=True,
        )


def _build_channel(
    row: ChannelModel,
    *,
    redis: aioredis.Redis,  # type: ignore[type-arg]
    base_url: str,
    secret: bytes | None = None,
) -> NotificationChannel | None:
    """Factory: create a live channel instance from a DB row."""
    channel_id = str(row.id)
    filters = row.filters
    config = get_channel_config(row, secret) if secret else (row.config or {})

    if row.channel_type == "telegram":
        from edictum_server.notifications.telegram import TelegramChannel, TelegramClient

        client = TelegramClient(config["bot_token"])
        return TelegramChannel(
            client=client,
            chat_id=int(config["chat_id"]),
            redis=redis,
            channel_id=channel_id,
            channel_name=row.name,
            filters=filters,
            webhook_secret=config.get("webhook_secret", ""),
        )

    if row.channel_type == "slack":
        from edictum_server.notifications.slack import SlackChannel

        return SlackChannel(
            webhook_url=config["webhook_url"],
            base_url=base_url,
            channel_name=row.name,
            channel_id=channel_id,
            filters=filters,
        )

    if row.channel_type == "email":
        from edictum_server.notifications.email import EmailChannel

        raw_to = config["to_addresses"]
        to_list = (
            [a.strip() for a in raw_to.split(",") if a.strip()]
            if isinstance(raw_to, str)
            else list(raw_to)
        )
        return EmailChannel(
            smtp_host=config["smtp_host"],
            smtp_port=int(config["smtp_port"]),
            smtp_user=config["smtp_user"],
            smtp_password=config["smtp_password"],
            from_address=config["from_address"],
            to_addresses=to_list,
            base_url=base_url,
            channel_name=row.name,
            channel_id=channel_id,
            filters=filters,
        )

    if row.channel_type == "slack_app":
        from edictum_server.notifications.slack_app import SlackAppChannel

        return SlackAppChannel(
            bot_token=config["bot_token"],
            signing_secret=config["signing_secret"],
            slack_channel=config["slack_channel"],
            base_url=base_url,
            channel_name=row.name,
            channel_id=channel_id,
            filters=filters,
            redis=redis,
        )

    if row.channel_type == "discord":
        from edictum_server.notifications.discord import DiscordChannel

        return DiscordChannel(
            bot_token=config["bot_token"],
            public_key=config["public_key"],
            discord_channel_id=config["discord_channel_id"],
            base_url=base_url,
            channel_name=row.name,
            channel_id=channel_id,
            filters=filters,
            redis=redis,
        )

    if row.channel_type == "webhook":
        from edictum_server.notifications.webhook import WebhookChannel

        return WebhookChannel(
            url=config["url"],
            secret=config.get("secret"),
            channel_name=row.name,
            channel_id=channel_id,
            filters=filters,
        )

    logger.warning("Unknown channel type %s for channel %s", row.channel_type, row.id)
    return None
