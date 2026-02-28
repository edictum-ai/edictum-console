"""Ed25519 bundle signing and verification service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from nacl.secret import SecretBox
from nacl.signing import SigningKey, VerifyKey
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment
from edictum_server.db.models import SigningKey as SigningKeyModel


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


async def rotate_signing_key(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    secret: bytes,
) -> dict[str, object]:
    """Rotate the tenant's signing key.

    1. Deactivate current active key.
    2. Generate a new keypair.
    3. Re-sign all currently-deployed bundles with the new key.
    4. flush() — caller commits.

    Returns dict with public_key hex, rotated_at, deployments_re_signed count.
    """
    # Deactivate current active key(s)
    result = await db.execute(
        select(SigningKeyModel).where(
            SigningKeyModel.tenant_id == tenant_id,
            SigningKeyModel.active.is_(True),
        )
    )
    for old_key in result.scalars().all():
        old_key.active = False

    # Generate new keypair
    public_key_bytes, encrypted_private_key = generate_signing_keypair(secret)
    new_key = SigningKeyModel(
        tenant_id=tenant_id,
        public_key=public_key_bytes,
        private_key_encrypted=encrypted_private_key,
        active=True,
    )
    db.add(new_key)
    await db.flush()

    # Find currently-deployed bundle versions (latest deployment per env+bundle_name)
    ranked = (
        select(
            Deployment.bundle_name,
            Deployment.bundle_version,
            func.row_number()
            .over(
                partition_by=(Deployment.env, Deployment.bundle_name),
                order_by=Deployment.created_at.desc(),
            )
            .label("rn"),
        )
        .where(Deployment.tenant_id == tenant_id)
        .subquery()
    )
    active_result = await db.execute(
        select(ranked.c.bundle_name, ranked.c.bundle_version).where(ranked.c.rn == 1)
    )
    active_pairs = set(active_result.all())

    # Re-sign each active bundle
    re_signed = 0
    for bundle_name, bundle_version in active_pairs:
        bundle_result = await db.execute(
            select(Bundle).where(
                Bundle.tenant_id == tenant_id,
                Bundle.name == bundle_name,
                Bundle.version == bundle_version,
            )
        )
        bundle = bundle_result.scalar_one_or_none()
        if bundle is not None:
            bundle.signature = sign_bundle(
                private_key_encrypted=encrypted_private_key,
                secret=secret,
                data=bundle.yaml_bytes,
            )
            re_signed += 1

    await db.flush()

    rotated_at = datetime.now(UTC)
    return {
        "public_key": public_key_bytes.hex(),
        "rotated_at": rotated_at,
        "deployments_re_signed": re_signed,
    }
