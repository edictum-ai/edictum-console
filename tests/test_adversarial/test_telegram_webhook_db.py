"""Adversarial tests for the Telegram DB webhook endpoint."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import TENANT_A_ID


async def _create_tg_channel(client: AsyncClient, config: dict | None = None) -> dict:
    resp = await client.post(
        "/api/v1/notifications/channels",
        json={
            "name": "Test TG Bot",
            "channel_type": "telegram",
            "config": config
            or {
                "bot_token": "fake:token",
                "chat_id": -100123,
                "webhook_secret": "correct-secret",
            },
        },
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.security
async def test_wrong_secret_returns_403(client: AsyncClient) -> None:
    ch = await _create_tg_channel(client)
    resp = await client.post(
        f"/api/v1/telegram/webhook/{ch['id']}",
        json={"callback_query": {"id": "1", "data": "approve:abc"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
    )
    assert resp.status_code == 403


@pytest.mark.security
async def test_nonexistent_channel_returns_404(client: AsyncClient) -> None:
    random_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/telegram/webhook/{random_id}",
        json={"callback_query": {"id": "1"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "x"},
    )
    assert resp.status_code == 404


@pytest.mark.security
async def test_disabled_channel_returns_404(client: AsyncClient) -> None:
    ch = await _create_tg_channel(client)
    # Disable the channel
    resp = await client.put(
        f"/api/v1/notifications/channels/{ch['id']}",
        json={"enabled": False},
    )
    assert resp.status_code == 200

    resp = await client.post(
        f"/api/v1/telegram/webhook/{ch['id']}",
        json={"callback_query": {"id": "1"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "correct-secret"},
    )
    assert resp.status_code == 404


@pytest.mark.security
async def test_missing_callback_query_graceful(client: AsyncClient) -> None:
    ch = await _create_tg_channel(client)
    resp = await client.post(
        f"/api/v1/telegram/webhook/{ch['id']}",
        json={"update_id": 12345},
        headers={"X-Telegram-Bot-Api-Secret-Token": "correct-secret"},
    )
    assert resp.status_code == 200


@pytest.mark.security
async def test_invalid_channel_id_format_returns_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/telegram/webhook/not-a-uuid",
        json={"callback_query": {"id": "1"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "x"},
    )
    assert resp.status_code == 404
