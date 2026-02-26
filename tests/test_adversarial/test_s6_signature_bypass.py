"""S6: Bundle signature verification bypass tests.

Risk if bypassed: Tampered contract deployment.
"""

from __future__ import annotations

import os

import pytest

from edictum_server.services.signing_service import (
    generate_signing_keypair,
    sign_bundle,
    verify_signature,
)

pytestmark = pytest.mark.security


@pytest.fixture()
def signing_secret() -> bytes:
    """32-byte secret for tests."""
    return os.urandom(32)


@pytest.fixture()
def keypair(signing_secret: bytes) -> tuple[bytes, bytes]:
    """Generate a fresh Ed25519 keypair."""
    return generate_signing_keypair(signing_secret)


async def test_sign_and_verify_round_trip(
    signing_secret: bytes, keypair: tuple[bytes, bytes],
) -> None:
    """Generate keypair, sign data, verify -> True."""
    public_key, encrypted_private_key = keypair
    data = b"rules:\n  - name: test\n"

    signature = sign_bundle(
        private_key_encrypted=encrypted_private_key,
        secret=signing_secret,
        data=data,
    )

    assert verify_signature(public_key, data, signature)


async def test_tampered_data_fails_verification(
    signing_secret: bytes, keypair: tuple[bytes, bytes],
) -> None:
    """Sign original data, tamper YAML bytes, verify -> False."""
    public_key, encrypted_private_key = keypair
    original = b"rules:\n  - name: test\n"

    signature = sign_bundle(
        private_key_encrypted=encrypted_private_key,
        secret=signing_secret,
        data=original,
    )

    tampered = b"rules:\n  - name: PWNED\n    verdict: allow\n"
    assert not verify_signature(public_key, tampered, signature)


async def test_verify_with_wrong_public_key(
    signing_secret: bytes, keypair: tuple[bytes, bytes],
) -> None:
    """Signature from keypair A does not verify with keypair B's public key."""
    _, encrypted_private_key_a = keypair
    data = b"rules:\n  - name: test\n"

    signature = sign_bundle(
        private_key_encrypted=encrypted_private_key_a,
        secret=signing_secret,
        data=data,
    )

    # Generate a different keypair
    public_key_b, _ = generate_signing_keypair(signing_secret)
    assert not verify_signature(public_key_b, data, signature)


async def test_wrong_secret_fails_decryption(
    signing_secret: bytes, keypair: tuple[bytes, bytes],
) -> None:
    """Using the wrong secret to decrypt the private key should fail."""
    _, encrypted_private_key = keypair
    data = b"rules:\n  - name: test\n"
    wrong_secret = os.urandom(32)

    with pytest.raises(Exception):
        sign_bundle(
            private_key_encrypted=encrypted_private_key,
            secret=wrong_secret,
            data=data,
        )
