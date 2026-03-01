"""Integration tests for the Discord interactions endpoint."""

from __future__ import annotations

import json
import time

import fakeredis.aioredis
import pytest
from httpx import AsyncClient, Response
from nacl.signing import SigningKey

from tests.conftest import TENANT_A_ID


def sign_discord_payload(signing_key: SigningKey, timestamp: str, body: bytes) -> str:
    message = timestamp.encode() + body
    return signing_key.sign(message).signature.hex()


@pytest.fixture()
def discord_keypair() -> tuple[SigningKey, str]:
    signing_key = SigningKey.generate()
    public_key_hex = signing_key.verify_key.encode().hex()
    return signing_key, public_key_hex


async def _create_discord_channel(
    client: AsyncClient, *, public_key_hex: str, name: str = "Test Discord"
) -> dict:
    resp = await client.post(
        "/api/v1/notifications/channels",
        json={
            "name": name,
            "channel_type": "discord",
            "config": {
                "bot_token": "test-bot-token",
                "public_key": public_key_hex,
                "discord_channel_id": "123456789",
            },
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_approval(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/approvals",
        json={
            "agent_id": "test-agent",
            "tool_name": "send_email",
            "message": "Please approve",
            "timeout": 300,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _post_interaction(
    client: AsyncClient,
    signing_key: SigningKey,
    body: dict,
    *,
    omit_sig: bool = False,
    omit_ts: bool = False,
) -> Response:
    body_bytes = json.dumps(body).encode()
    ts = str(int(time.time()))
    sig = sign_discord_payload(signing_key, ts, body_bytes)
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if not omit_ts:
        headers["X-Signature-Timestamp"] = ts
    if not omit_sig:
        headers["X-Signature-Ed25519"] = sig
    return await client.post(
        "/api/v1/discord/interactions", content=body_bytes, headers=headers
    )


async def test_ping_pong(
    client: AsyncClient,
    discord_keypair: tuple[SigningKey, str],
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    resp = await _post_interaction(client, signing_key, {"type": 1})
    assert resp.status_code == 200
    assert resp.json() == {"type": 1}


async def test_button_approve_submits_decision(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
    discord_keypair: tuple[SigningKey, str],
) -> None:
    signing_key, public_key_hex = discord_keypair
    channel = await _create_discord_channel(client, public_key_hex=public_key_hex)
    approval = await _create_approval(client)
    approval_id = approval["id"]

    await test_redis.set(
        f"discord:tenant:{channel['id']}:{approval_id}", str(TENANT_A_ID)
    )
    body = {
        "type": 3,
        "data": {"custom_id": f"edictum_approve:{approval_id}"},
        "member": {"user": {"username": "testuser"}},
    }
    resp = await _post_interaction(client, signing_key, body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0x57F287
    assert data["data"]["components"] == []

    list_resp = await client.get("/api/v1/approvals")
    approval_record = next(a for a in list_resp.json() if a["id"] == approval_id)
    assert approval_record["status"] == "approved"


async def test_button_deny_submits_decision(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
    discord_keypair: tuple[SigningKey, str],
) -> None:
    signing_key, public_key_hex = discord_keypair
    channel = await _create_discord_channel(client, public_key_hex=public_key_hex)
    approval = await _create_approval(client)
    approval_id = approval["id"]

    await test_redis.set(
        f"discord:tenant:{channel['id']}:{approval_id}", str(TENANT_A_ID)
    )
    body = {
        "type": 3,
        "data": {"custom_id": f"edictum_deny:{approval_id}"},
        "member": {"user": {"username": "testuser"}},
    }
    resp = await _post_interaction(client, signing_key, body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0xED4245
    assert data["data"]["components"] == []

    list_resp = await client.get("/api/v1/approvals")
    approval_record = next(a for a in list_resp.json() if a["id"] == approval_id)
    assert approval_record["status"] == "denied"


async def test_expired_tenant_key_returns_expired_embed(
    client: AsyncClient,
    discord_keypair: tuple[SigningKey, str],
) -> None:
    import uuid

    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    approval_id = str(uuid.uuid4())  # no Redis key seeded
    body = {
        "type": 3,
        "data": {"custom_id": f"edictum_approve:{approval_id}"},
        "member": {"user": {"username": "testuser"}},
    }
    resp = await _post_interaction(client, signing_key, body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0x99AAB5
    assert data["data"]["components"] == []
