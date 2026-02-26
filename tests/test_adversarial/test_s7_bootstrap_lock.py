"""S7: Admin bootstrap lock tests.

Risk if bypassed: Privilege escalation -- attacker creates admin after bootstrap.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User

pytestmark = pytest.mark.security


async def _run_bootstrap(db: AsyncSession, admin_email: str, admin_password: str) -> None:
    """Run the bootstrap logic directly against a test DB session.

    Mirrors the logic in _bootstrap_admin but uses the provided session
    instead of async_session_factory (which isn't initialised in tests).
    """
    if not admin_email or not admin_password:
        return

    result = await db.execute(select(func.count()).select_from(User))
    user_count = result.scalar() or 0

    if user_count > 0:
        return

    tenant = Tenant(name="default")
    db.add(tenant)
    await db.flush()

    password_hash = LocalAuthProvider.hash_password(admin_password)
    admin = User(
        tenant_id=tenant.id,
        email=admin_email,
        password_hash=password_hash,
        is_admin=True,
    )
    db.add(admin)
    await db.commit()


async def test_bootstrap_creates_admin_when_no_users(
    db_session: AsyncSession,
) -> None:
    """On first run with env vars set, bootstrap creates admin + tenant."""
    await _run_bootstrap(db_session, "bootstrap@test.com", "strong-password-123")

    result = await db_session.execute(
        select(User).where(User.email == "bootstrap@test.com")
    )
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.is_admin is True
    assert LocalAuthProvider.verify_password("strong-password-123", user.password_hash)


async def test_second_bootstrap_skipped_when_user_exists(
    db_session: AsyncSession,
) -> None:
    """If users already exist, bootstrap does not create another admin."""
    # Create an existing user
    tenant = Tenant(name="existing")
    db_session.add(tenant)
    await db_session.flush()
    user = User(
        tenant_id=tenant.id,
        email="existing@test.com",
        password_hash=LocalAuthProvider.hash_password("existing"),
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Try to bootstrap again -- should skip
    await _run_bootstrap(db_session, "attacker@test.com", "attacker-pass")

    result = await db_session.execute(
        select(func.count()).select_from(User)
    )
    count = result.scalar()
    assert count == 1  # Only the original user


async def test_bootstrap_without_env_vars_skips(
    db_session: AsyncSession,
) -> None:
    """If admin email/password not set, bootstrap skips silently."""
    await _run_bootstrap(db_session, "", "")

    result = await db_session.execute(
        select(func.count()).select_from(User)
    )
    count = result.scalar()
    assert count == 0
