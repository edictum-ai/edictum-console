"""Tests for notification channel CRUD endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio

CHANNELS_URL = "/api/v1/notifications/channels"

TELEGRAM_CONFIG = {"bot_token": "test-bot-token", "chat_id": "123456"}
SLACK_CONFIG = {"webhook_url": "https://hooks.slack.com/services/T/B/xxx"}
WEBHOOK_CONFIG = {"url": "https://example.com/hook"}


async def _create_channel(
    client: AsyncClient,
    name: str = "ops-telegram",
    channel_type: str = "telegram",
    config: dict | None = None,
) -> dict:
    resp = await client.post(
        CHANNELS_URL,
        json={
            "name": name,
            "channel_type": channel_type,
            "config": config or TELEGRAM_CONFIG,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_create_channel(client: AsyncClient) -> None:
    data = await _create_channel(client)
    assert data["name"] == "ops-telegram"
    assert data["channel_type"] == "telegram"
    # Config includes auto-generated webhook_secret for Telegram DB channels
    assert data["config"]["bot_token"] == TELEGRAM_CONFIG["bot_token"]
    assert data["config"]["chat_id"] == TELEGRAM_CONFIG["chat_id"]
    assert "webhook_secret" in data["config"]
    assert data["enabled"] is True
    assert data["last_test_at"] is None
    assert data["last_test_ok"] is None
    assert data["filters"] is None


async def test_list_channels(client: AsyncClient) -> None:
    await _create_channel(client, name="ch-1")
    await _create_channel(client, name="ch-2", channel_type="slack", config=SLACK_CONFIG)

    resp = await client.get(CHANNELS_URL)
    assert resp.status_code == 200
    names = {ch["name"] for ch in resp.json()}
    assert names == {"ch-1", "ch-2"}


async def test_update_channel(client: AsyncClient) -> None:
    data = await _create_channel(client)
    ch_id = data["id"]

    resp = await client.put(
        f"{CHANNELS_URL}/{ch_id}",
        json={"name": "renamed", "enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"
    assert resp.json()["enabled"] is False


async def test_delete_channel(client: AsyncClient) -> None:
    data = await _create_channel(client)
    ch_id = data["id"]

    resp = await client.delete(f"{CHANNELS_URL}/{ch_id}")
    assert resp.status_code == 204

    resp = await client.get(CHANNELS_URL)
    assert resp.json() == []


async def test_delete_nonexistent_channel(client: AsyncClient) -> None:
    resp = await client.delete(f"{CHANNELS_URL}/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_test_channel_success(client: AsyncClient) -> None:
    data = await _create_channel(client)
    ch_id = data["id"]

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = lambda: None

    with patch("edictum_server.services.notification_service.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client

        resp = await client.post(f"{CHANNELS_URL}/{ch_id}/test")

    assert resp.status_code == 200
    result = resp.json()
    assert result["success"] is True
    assert "Telegram" in result["message"]


async def test_invalid_config_missing_bot_token(client: AsyncClient) -> None:
    resp = await client.post(
        CHANNELS_URL,
        json={"name": "bad", "channel_type": "telegram", "config": {"chat_id": "123"}},
    )
    assert resp.status_code == 422


async def test_invalid_channel_type(client: AsyncClient) -> None:
    resp = await client.post(
        CHANNELS_URL,
        json={"name": "bad", "channel_type": "fax", "config": {}},
    )
    assert resp.status_code == 422


async def test_email_channel_missing_config(client: AsyncClient) -> None:
    resp = await client.post(
        CHANNELS_URL,
        json={"name": "bad", "channel_type": "email", "config": {}},
    )
    assert resp.status_code == 422


async def test_update_nonexistent(client: AsyncClient) -> None:
    resp = await client.put(
        f"{CHANNELS_URL}/00000000-0000-0000-0000-000000000000",
        json={"name": "nope"},
    )
    assert resp.status_code == 404
