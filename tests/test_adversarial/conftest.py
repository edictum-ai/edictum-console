"""Shared fixtures for adversarial security tests."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.local import LocalAuthProvider
from edictum_server.db.models import Tenant, User
from tests.conftest import TENANT_A_ID, TENANT_B_ID


@pytest.fixture()
async def tenant_a(db_session: AsyncSession) -> Tenant:
    """Create tenant A with a known ID for adversarial tests."""
    tenant = Tenant(id=TENANT_A_ID, name="tenant-a")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest.fixture()
async def tenant_b(db_session: AsyncSession) -> Tenant:
    """Create tenant B with a known ID for adversarial tests."""
    tenant = Tenant(id=TENANT_B_ID, name="tenant-b")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest.fixture()
async def user_a(db_session: AsyncSession, tenant_a: Tenant) -> User:
    """Create an admin user in tenant A."""
    password_hash = LocalAuthProvider.hash_password("password-a")
    user = User(
        tenant_id=tenant_a.id,
        email="admin-a@test.com",
        password_hash=password_hash,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture()
async def user_b(db_session: AsyncSession, tenant_b: Tenant) -> User:
    """Create an admin user in tenant B."""
    password_hash = LocalAuthProvider.hash_password("password-b")
    user = User(
        tenant_id=tenant_b.id,
        email="admin-b@test.com",
        password_hash=password_hash,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user
