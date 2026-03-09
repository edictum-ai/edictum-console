"""Bootstrap setup endpoint -- interactive first-run wizard."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import SigningKey, Tenant, User
from edictum_server.services.signing_service import generate_signing_keypair

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
    settings: Settings = Depends(get_settings),
    x_requested_with: str | None = Header(default=None, alias="X-Requested-With"),
) -> SetupResponse:
    """Create the first admin user and tenant.

    Only works when no users exist (bootstrap lock -- S7).
    Returns 409 if already bootstrapped.
    """
    # CSRF protection: require X-Requested-With header (browsers block this on
    # cross-origin requests without a preflight, closing the CSRF vector)
    if not x_requested_with:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Requested-With header.",
        )

    # Advisory lock prevents concurrent bootstrap (S7 atomicity).
    # Lock 42 is shared with _bootstrap_admin() so the two paths are
    # mutually exclusive.  Released automatically on transaction commit.
    await db.execute(text("SELECT pg_advisory_xact_lock(42)"))

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

    # Create initial signing key for bundle deployment
    if settings.signing_key_secret:
        secret = bytes.fromhex(settings.signing_key_secret)
        public_key_bytes, encrypted_private_key = generate_signing_keypair(secret)
        signing_key = SigningKey(
            tenant_id=tenant.id,
            public_key=public_key_bytes,
            private_key_encrypted=encrypted_private_key,
            active=True,
        )
        db.add(signing_key)

    await db.commit()

    logger.info("Setup complete: admin user %s created", body.email)

    return SetupResponse(
        message="Admin created",
        user_id=str(admin.id),
        tenant_id=str(tenant.id),
    )
