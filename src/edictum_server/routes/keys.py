"""API key management endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.api_keys import generate_api_key
from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.db.models import ApiKey
from edictum_server.schemas.keys import ApiKeyInfo, CreateKeyRequest, CreateKeyResponse

router = APIRouter(prefix="/api/v1/keys", tags=["keys"])


@router.post(
    "",
    response_model=CreateKeyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_key(
    body: CreateKeyRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> CreateKeyResponse:
    """Create a new API key for the authenticated tenant.

    Only available to dashboard-authenticated users.
    The full key is returned once and cannot be retrieved again.
    """
    full_key, prefix, key_hash = generate_api_key(body.env)

    api_key = ApiKey(
        tenant_id=auth.tenant_id,
        key_prefix=prefix,
        key_hash=key_hash,
        env=body.env,
        label=body.label,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return CreateKeyResponse(
        id=str(api_key.id),
        key=full_key,
        prefix=api_key.key_prefix,
        env=body.env,
        label=body.label,
        created_at=api_key.created_at,
    )


@router.get("", response_model=list[ApiKeyInfo])
async def list_keys(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKeyInfo]:
    """List all non-revoked API keys for the authenticated tenant."""
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.tenant_id == auth.tenant_id,
            ApiKey.revoked_at.is_(None),
        )
    )
    rows = result.scalars().all()

    return [
        ApiKeyInfo(
            id=str(row.id),
            prefix=row.key_prefix,
            env=row.env,
            label=row.label,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_key(
    key_id: uuid.UUID,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke an API key by setting its revoked_at timestamp.

    Only the owning tenant (via dashboard auth) can revoke their keys.
    """
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.tenant_id == auth.tenant_id,
            ApiKey.revoked_at.is_(None),
        )
    )
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found or already revoked.",
        )

    await db.execute(
        update(ApiKey).where(ApiKey.id == key_id).values(revoked_at=datetime.now(UTC))
    )
    await db.commit()
