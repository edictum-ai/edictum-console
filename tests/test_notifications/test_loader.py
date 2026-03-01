"""Tests for the DB channel loader."""

from __future__ import annotations

import uuid

import fakeredis.aioredis
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import NotificationChannel as ChannelModel
from edictum_server.notifications.email import EmailChannel
from edictum_server.notifications.loader import load_db_channels
from edictum_server.notifications.slack import SlackChannel
from edictum_server.notifications.telegram import TelegramChannel
from edictum_server.notifications.webhook import WebhookChannel
from tests.conftest import TENANT_A_ID, TENANT_B_ID


def _make_channel(
    tenant_id: uuid.UUID,
    channel_type: str,
    config: dict,
    *,
    enabled: bool = True,
    name: str = "ch",
) -> ChannelModel:
    return ChannelModel(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        name=name,
        channel_type=channel_type,
        config=config,
        enabled=enabled,
    )


_TG_CFG = {"bot_token": "fake:token", "chat_id": -100123}
_SLACK_CFG = {"webhook_url": "https://hooks.slack.com/x"}
_EMAIL_CFG = {
    "smtp_host": "smtp.example.com",
    "smtp_port": 587,
    "smtp_user": "u",
    "smtp_password": "p",
    "from_address": "no@ex.com",
    "to_addresses": ["a@ex.com"],
}
_WEBHOOK_CFG = {"url": "https://example.com/hook"}


async def test_loads_all_channel_types(
    db_session: AsyncSession, test_redis: fakeredis.aioredis.FakeRedis
) -> None:
    for ch_type, cfg in [
        ("telegram", _TG_CFG),
        ("slack", _SLACK_CFG),
        ("email", _EMAIL_CFG),
        ("webhook", _WEBHOOK_CFG),
    ]:
        db_session.add(_make_channel(TENANT_A_ID, ch_type, cfg))
    await db_session.commit()

    result = await load_db_channels(db_session, test_redis, "http://localhost:8000")
    tenant_key = str(TENANT_A_ID)
    assert tenant_key in result
    channels = result[tenant_key]
    assert len(channels) == 4
    types = {type(ch) for ch in channels}
    assert types == {TelegramChannel, SlackChannel, EmailChannel, WebhookChannel}


async def test_disabled_channel_excluded(
    db_session: AsyncSession, test_redis: fakeredis.aioredis.FakeRedis
) -> None:
    db_session.add(_make_channel(TENANT_A_ID, "slack", _SLACK_CFG, enabled=False))
    await db_session.commit()

    result = await load_db_channels(db_session, test_redis, "http://localhost:8000")
    assert str(TENANT_A_ID) not in result


async def test_invalid_config_skipped(
    db_session: AsyncSession, test_redis: fakeredis.aioredis.FakeRedis
) -> None:
    db_session.add(_make_channel(TENANT_A_ID, "slack", {}))  # missing webhook_url
    db_session.add(_make_channel(TENANT_A_ID, "webhook", _WEBHOOK_CFG))
    await db_session.commit()

    result = await load_db_channels(db_session, test_redis, "http://localhost:8000")
    channels = result.get(str(TENANT_A_ID), [])
    assert len(channels) == 1
    assert isinstance(channels[0], WebhookChannel)


async def test_multi_tenant(
    db_session: AsyncSession, test_redis: fakeredis.aioredis.FakeRedis
) -> None:
    db_session.add(_make_channel(TENANT_A_ID, "slack", _SLACK_CFG))
    db_session.add(_make_channel(TENANT_B_ID, "webhook", _WEBHOOK_CFG))
    await db_session.commit()

    result = await load_db_channels(db_session, test_redis, "http://localhost:8000")
    assert str(TENANT_A_ID) in result
    assert str(TENANT_B_ID) in result
    assert len(result[str(TENANT_A_ID)]) == 1
    assert len(result[str(TENANT_B_ID)]) == 1
