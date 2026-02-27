"""Bootstrap setup endpoint -- interactive first-run wizard."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.engine import get_db
from edictum_server.db.models import Tenant, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["setup"])

_MIN_PASSWORD_LENGTH = 12


class SetupRequest(BaseModel):
    email: str
    password: str
    tenant_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < _MIN_PASSWORD_LENGTH:
            msg = f"Password must be at least {_MIN_PASSWORD_LENGTH} characters"
            raise ValueError(msg)
        return v


class SetupResponse(BaseModel):
    message: str
    user_id: str
    tenant_id: str


@router.post(
    "/setup",
    response_model=SetupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def setup(
    body: SetupRequest,
    db: AsyncSession = Depends(get_db),
) -> SetupResponse:
    """Create the first admin user and tenant.

    Only works when no users exist (bootstrap lock -- S7).
    Returns 409 if already bootstrapped.
    """
    result = await db.execute(select(func.count()).select_from(User))
    user_count = result.scalar() or 0

    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Server is already set up.",
        )

    tenant = Tenant(name=body.tenant_name or "Default")
    db.add(tenant)
    await db.flush()

    password_hash = LocalAuthProvider.hash_password(body.password)
    admin = User(
        tenant_id=tenant.id,
        email=str(body.email),
        password_hash=password_hash,
        is_admin=True,
    )
    db.add(admin)
    await db.commit()

    logger.info("Setup complete: admin user %s created", body.email)

    return SetupResponse(
        message="Admin created",
        user_id=str(admin.id),
        tenant_id=str(tenant.id),
    )
