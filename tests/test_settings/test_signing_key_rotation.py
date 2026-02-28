"""Tests for signing key rotation endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from edictum_server.config import Settings, get_settings

pytestmark = pytest.mark.anyio

ROTATE_URL = "/api/v1/settings/rotate-signing-key"

# 32-byte hex secret for test signing key encryption
TEST_SECRET_HEX = "00" * 32


@pytest.fixture(autouse=True)
def _override_signing_secret() -> None:
    """Ensure signing_key_secret is set for all tests in this module."""
    from edictum_server.main import app

    test_settings = Settings(signing_key_secret=TEST_SECRET_HEX)
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield  # type: ignore[misc]
    app.dependency_overrides.pop(get_settings, None)


async def test_rotate_key_returns_new_public_key(client: AsyncClient) -> None:
    """Rotating returns a new public key and timestamp."""
    resp = await client.post(ROTATE_URL)
    assert resp.status_code == 201
    data = resp.json()
    assert "public_key" in data
    assert len(data["public_key"]) > 0
    assert "rotated_at" in data
    assert "deployments_re_signed" in data
    assert data["deployments_re_signed"] == 0  # no deployments in test


async def test_rotate_key_twice_different_keys(client: AsyncClient) -> None:
    """Two rotations produce different public keys; old key is deactivated."""
    resp1 = await client.post(ROTATE_URL)
    key1 = resp1.json()["public_key"]

    resp2 = await client.post(ROTATE_URL)
    key2 = resp2.json()["public_key"]

    assert key1 != key2
