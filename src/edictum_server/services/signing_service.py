"""Ed25519 bundle signing and verification service."""

from __future__ import annotations

from nacl.secret import SecretBox
from nacl.signing import SigningKey, VerifyKey


def generate_signing_keypair(secret: bytes) -> tuple[bytes, bytes]:
    """Generate an Ed25519 keypair and encrypt the private key.

    Args:
        secret: 32-byte secret for encrypting the private key at rest.

    Returns:
        (public_key_bytes, encrypted_private_key_bytes)
    """
    signing_key = SigningKey.generate()
    public_key = signing_key.verify_key.encode()
    private_key_raw = bytes(signing_key)

    box = SecretBox(secret)
    encrypted_private_key = box.encrypt(private_key_raw)

    return public_key, encrypted_private_key


def sign_bundle(
    private_key_encrypted: bytes,
    secret: bytes,
    data: bytes,
) -> bytes:
    """Decrypt the private key and sign arbitrary data.

    Args:
        private_key_encrypted: Encrypted Ed25519 private key bytes.
        secret: 32-byte decryption secret.
        data: Payload to sign.

    Returns:
        64-byte Ed25519 signature.
    """
    box = SecretBox(secret)
    private_key_raw = box.decrypt(private_key_encrypted)
    signing_key = SigningKey(private_key_raw)
    signed = signing_key.sign(data)
    return signed.signature


def verify_signature(
    public_key: bytes,
    data: bytes,
    signature: bytes,
) -> bool:
    """Verify an Ed25519 signature.

    Returns:
        True if valid, False otherwise.
    """
    verify_key = VerifyKey(public_key)
    try:
        verify_key.verify(data, signature)
    except Exception:  # nacl.exceptions.BadSignatureError
        return False
    return True
