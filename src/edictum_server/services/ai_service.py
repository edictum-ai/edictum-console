"""AI configuration service — CRUD + encryption for per-tenant AI config."""

from __future__ import annotations

import uuid

from nacl.secret import SecretBox
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import TenantAiConfig


async def get_ai_config(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> TenantAiConfig | None:
    """Fetch the AI config for a tenant, or None if not configured."""
    result = await db.execute(
        select(TenantAiConfig).where(TenantAiConfig.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


async def upsert_ai_config(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    provider: str,
    api_key: str | None,
    model: str | None,
    base_url: str | None,
    secret: bytes,
    updated_by: str,
) -> TenantAiConfig:
    """Create or update tenant AI config. Encrypts API key before storage."""
    encrypted_key: bytes | None = None
    if api_key:
        box = SecretBox(secret)
        encrypted_key = box.encrypt(api_key.encode("utf-8"))

    existing = await get_ai_config(db, tenant_id)
    if existing:
        existing.provider = provider
        if encrypted_key is not None:
            existing.api_key_encrypted = encrypted_key
        existing.model = model
        existing.base_url = base_url
        existing.updated_by = updated_by
        await db.flush()
        return existing

    config = TenantAiConfig(
        tenant_id=tenant_id,
        provider=provider,
        api_key_encrypted=encrypted_key,
        model=model,
        base_url=base_url,
        updated_by=updated_by,
    )
    db.add(config)
    await db.flush()
    return config


async def delete_ai_config(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> bool:
    """Delete tenant AI config. Returns True if deleted, False if not found."""
    existing = await get_ai_config(db, tenant_id)
    if not existing:
        return False
    await db.delete(existing)
    await db.flush()
    return True


def decrypt_api_key(encrypted: bytes, secret: bytes) -> str:
    """Decrypt an API key from storage."""
    box = SecretBox(secret)
    return box.decrypt(encrypted).decode("utf-8")


def mask_api_key(raw: str) -> str:
    """Mask API key for display: first 8 + ... + last 4."""
    if len(raw) <= 12:
        return "***"
    return f"{raw[:8]}...{raw[-4:]}"
