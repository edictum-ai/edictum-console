"""Adversarial security tests for the Discord interactions endpoint."""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable

import fakeredis.aioredis
import pytest
from httpx import AsyncClient, Response
from nacl.signing import SigningKey

from edictum_server.routes.discord import verify_discord_signature
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
        json={"agent_id": "agent", "tool_name": "tool", "message": "msg", "timeout": 300},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _post_raw(
    client: AsyncClient,
    body_bytes: bytes,
    *,
    sig: str | None = None,
    ts: str | None = None,
) -> Response:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if ts is not None:
        headers["X-Signature-Timestamp"] = ts
    if sig is not None:
        headers["X-Signature-Ed25519"] = sig
    return await client.post(
        "/api/v1/discord/interactions", content=body_bytes, headers=headers
    )


async def _signed_post(
    client: AsyncClient, signing_key: SigningKey, body: dict
) -> Response:
    body_bytes = json.dumps(body).encode()
    ts = str(int(time.time()))
    sig = sign_discord_payload(signing_key, ts, body_bytes)
    return await _post_raw(client, body_bytes, sig=sig, ts=ts)


@pytest.mark.security
async def test_wrong_signature_401(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    _, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    wrong_key = SigningKey.generate()
    resp = await _signed_post(client, wrong_key, {"type": 1})
    assert resp.status_code == 401


@pytest.mark.security
async def test_missing_signature_header_401(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    body_bytes = json.dumps({"type": 1}).encode()
    ts = str(int(time.time()))
    resp = await _post_raw(client, body_bytes, ts=ts)  # sig omitted
    assert resp.status_code == 401


@pytest.mark.security
async def test_missing_timestamp_header_401(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    body_bytes = json.dumps({"type": 1}).encode()
    ts = str(int(time.time()))
    sig = sign_discord_payload(signing_key, ts, body_bytes)
    resp = await _post_raw(client, body_bytes, sig=sig)  # ts omitted
    assert resp.status_code == 401


@pytest.mark.security
async def test_malformed_signature_hex_401(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    _, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    body_bytes = json.dumps({"type": 1}).encode()
    resp = await _post_raw(
        client, body_bytes, sig="not-valid-hex", ts=str(int(time.time()))
    )
    assert resp.status_code == 401


@pytest.mark.security
async def test_no_discord_channels_401(client: AsyncClient) -> None:
    signing_key = SigningKey.generate()
    resp = await _signed_post(client, signing_key, {"type": 1})
    assert resp.status_code == 401


@pytest.mark.security
async def test_disabled_channel_401(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    channel = await _create_discord_channel(client, public_key_hex=public_key_hex)
    await client.put(
        f"/api/v1/notifications/channels/{channel['id']}", json={"enabled": False}
    )
    resp = await _signed_post(client, signing_key, {"type": 1})
    assert resp.status_code == 401


@pytest.mark.security
async def test_malformed_public_key_skipped(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    """Channel with non-hex public_key is skipped; the valid channel still matches."""
    signing_key, public_key_hex = discord_keypair
    # Insert a bad channel first (it will be tried and skipped)
    await client.post(
        "/api/v1/notifications/channels",
        json={
            "name": "Bad Key",
            "channel_type": "discord",
            "config": {"bot_token": "tok", "public_key": "not-hex", "discord_channel_id": "1"},
        },
    )
    await _create_discord_channel(client, public_key_hex=public_key_hex, name="Good Key")
    resp = await _signed_post(client, signing_key, {"type": 1})
    assert resp.status_code == 200
    assert resp.json() == {"type": 1}


@pytest.mark.security
async def test_cross_tenant_blocked(
    client: AsyncClient,
    test_redis: fakeredis.aioredis.FakeRedis,
    discord_keypair: tuple[SigningKey, str],
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Tenant B's channel cannot decide tenant A's approvals.

    Signing with key B matches channel B, but there is no Redis tenant key
    for (channel_B_id, approval_A_id) — the interaction is rejected as expired
    and the approval remains pending.
    """
    _, key_a_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=key_a_hex, name="Channel A")

    key_b_sk = SigningKey.generate()
    key_b_hex = key_b_sk.verify_key.encode().hex()
    set_auth_tenant_b()
    await _create_discord_channel(client, public_key_hex=key_b_hex, name="Channel B")

    set_auth_tenant_a()
    approval = await _create_approval(client)
    approval_id = approval["id"]
    # Only seed Redis for channel A — channel B has no entry for this approval

    body = {
        "type": 3,
        "data": {"custom_id": f"edictum_approve:{approval_id}"},
        "member": {"user": {"username": "attacker"}},
    }
    resp = await _signed_post(client, key_b_sk, body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0x99AAB5  # expired

    set_auth_tenant_a()
    list_resp = await client.get("/api/v1/approvals")
    record = next(a for a in list_resp.json() if a["id"] == approval_id)
    assert record["status"] == "pending"


@pytest.mark.security
async def test_replay_already_decided(
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
        "member": {"user": {"username": "user1"}},
    }
    resp1 = await _signed_post(client, signing_key, body)
    assert resp1.status_code == 200
    assert resp1.json()["type"] == 7

    # Replay — approval already decided
    resp2 = await _signed_post(client, signing_key, body)
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0x99AAB5  # Already Decided


@pytest.mark.security
async def test_invalid_custom_id_no_colon(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    resp = await _signed_post(
        client, signing_key, {"type": 3, "data": {"custom_id": "random_string"}}
    )
    assert resp.status_code == 200  # graceful, no crash


@pytest.mark.security
async def test_invalid_approval_id_not_uuid(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    resp = await _signed_post(
        client, signing_key, {"type": 3, "data": {"custom_id": "edictum_approve:not-a-uuid"}}
    )
    assert resp.status_code == 200  # graceful, no crash


@pytest.mark.security
async def test_expired_redis_tenant_key_returns_expired_embed(
    client: AsyncClient, discord_keypair: tuple[SigningKey, str]
) -> None:
    signing_key, public_key_hex = discord_keypair
    await _create_discord_channel(client, public_key_hex=public_key_hex)
    approval_id = str(uuid.uuid4())  # no Redis key seeded
    body = {
        "type": 3,
        "data": {"custom_id": f"edictum_approve:{approval_id}"},
        "member": {"user": {"username": "user1"}},
    }
    resp = await _signed_post(client, signing_key, body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == 7
    assert data["data"]["embeds"][0]["color"] == 0x99AAB5


@pytest.mark.security
def test_verify_signature_valid(discord_keypair: tuple[SigningKey, str]) -> None:
    signing_key, public_key_hex = discord_keypair
    body = b'{"type": 1}'
    ts = "1234567890"
    sig_hex = sign_discord_payload(signing_key, ts, body)
    assert verify_discord_signature(public_key_hex, ts, body, sig_hex) is True


@pytest.mark.security
def test_verify_signature_wrong_key() -> None:
    signing_key = SigningKey.generate()
    wrong_key = SigningKey.generate()
    public_key_hex = wrong_key.verify_key.encode().hex()
    body = b'{"type": 1}'
    ts = "1234567890"
    sig_hex = sign_discord_payload(signing_key, ts, body)
    assert verify_discord_signature(public_key_hex, ts, body, sig_hex) is False


@pytest.mark.security
def test_verify_signature_malformed_hex() -> None:
    key = SigningKey.generate()
    assert verify_discord_signature(
        key.verify_key.encode().hex(), "ts", b"body", "not-hex"
    ) is False
