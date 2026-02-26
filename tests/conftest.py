"""Shared test fixtures -- in-memory SQLite, fakeredis, auth overrides."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, Callable

import bcrypt
import fakeredis.aioredis
import pytest
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Speed up bcrypt: use rounds=4 (minimum) instead of production rounds=12.
# This shaves ~8s off the test suite. Applied at module load time so every
# call to bcrypt.gensalt() in the process uses fast rounds.
# ---------------------------------------------------------------------------
_original_gensalt = bcrypt.gensalt


def _fast_gensalt(rounds: int = 4, prefix: bytes = b"2b") -> bytes:  # noqa: ARG001
    return _original_gensalt(rounds=4, prefix=prefix)


bcrypt.gensalt = _fast_gensalt  # type: ignore[assignment]
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from edictum_server.auth.dependencies import AuthContext  # noqa: E402
from edictum_server.auth.local import LocalAuthProvider  # noqa: E402
from edictum_server.db.base import Base  # noqa: E402
from edictum_server.db.engine import get_db  # noqa: E402
from edictum_server.notifications.base import NotificationManager  # noqa: E402
from edictum_server.push.manager import PushManager, get_push_manager  # noqa: E402
from edictum_server.redis.client import get_redis  # noqa: E402

# ---------------------------------------------------------------------------
# Database (SQLite async, in-memory)
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

_test_engine = create_async_engine(TEST_DB_URL, echo=False)
_test_session_factory = async_sessionmaker(_test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def _setup_db() -> AsyncGenerator[None, None]:
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _test_engine.dispose()


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _test_session_factory() as session:
        yield session


@pytest.fixture()
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _test_session_factory() as session:
        yield session


@pytest.fixture()
async def test_redis() -> AsyncGenerator[fakeredis.aioredis.FakeRedis, None]:
    """Fake in-memory Redis -- no real server needed."""
    r = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield r
    await r.flushdb()
    await r.aclose()


# Keep `fake_redis` as an alias so existing test signatures don't break
@pytest.fixture()
async def fake_redis(test_redis: fakeredis.aioredis.FakeRedis) -> fakeredis.aioredis.FakeRedis:
    """Alias for test_redis -- kept for backward compatibility."""
    return test_redis


TENANT_A_ID = uuid.uuid4()
TENANT_B_ID = uuid.uuid4()


def _make_auth_a_api_key() -> AuthContext:
    return AuthContext(tenant_id=TENANT_A_ID, auth_type="api_key", env="production")


def _make_auth_a_dashboard() -> AuthContext:
    return AuthContext(tenant_id=TENANT_A_ID, auth_type="dashboard", user_id="user_test_123")


def _make_auth_b_api_key() -> AuthContext:
    return AuthContext(tenant_id=TENANT_B_ID, auth_type="api_key", env="production")


def _make_auth_b_dashboard() -> AuthContext:
    return AuthContext(tenant_id=TENANT_B_ID, auth_type="dashboard", user_id="user_test_456")


@pytest.fixture()
def push_manager() -> PushManager:
    return PushManager()


def _get_app():
    from edictum_server.main import app

    return app


@pytest.fixture()
async def client(
    test_redis: aioredis.Redis,
    push_manager: PushManager,
) -> AsyncGenerator[AsyncClient, None]:
    from edictum_server.auth.dependencies import (
        get_current_tenant,
        require_api_key,
        require_dashboard_auth,
    )

    app = _get_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = lambda: test_redis
    app.dependency_overrides[get_push_manager] = lambda: push_manager
    app.dependency_overrides[require_api_key] = _make_auth_a_api_key
    app.dependency_overrides[require_dashboard_auth] = _make_auth_a_dashboard
    app.dependency_overrides[get_current_tenant] = _make_auth_a_api_key

    # Set app state for routes that access it directly
    app.state.redis = test_redis
    app.state.push_manager = push_manager
    app.state.auth_provider = LocalAuthProvider(redis=test_redis, session_ttl_hours=24)
    app.state.notification_manager = NotificationManager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture()
async def no_auth_client(
    test_redis: aioredis.Redis,
    push_manager: PushManager,
) -> AsyncGenerator[AsyncClient, None]:
    app = _get_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = lambda: test_redis
    app.dependency_overrides[get_push_manager] = lambda: push_manager

    app.state.redis = test_redis
    app.state.push_manager = push_manager
    app.state.auth_provider = LocalAuthProvider(redis=test_redis, session_ttl_hours=24)
    app.state.notification_manager = NotificationManager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture()
def set_auth_tenant_b() -> Callable[[], None]:
    from edictum_server.auth.dependencies import (
        get_current_tenant,
        require_api_key,
        require_dashboard_auth,
    )

    def _swap() -> None:
        app = _get_app()
        app.dependency_overrides[require_api_key] = _make_auth_b_api_key
        app.dependency_overrides[require_dashboard_auth] = _make_auth_b_dashboard
        app.dependency_overrides[get_current_tenant] = _make_auth_b_api_key

    return _swap


@pytest.fixture()
def set_auth_tenant_a() -> Callable[[], None]:
    from edictum_server.auth.dependencies import (
        get_current_tenant,
        require_api_key,
        require_dashboard_auth,
    )

    def _swap() -> None:
        app = _get_app()
        app.dependency_overrides[require_api_key] = _make_auth_a_api_key
        app.dependency_overrides[require_dashboard_auth] = _make_auth_a_dashboard
        app.dependency_overrides[get_current_tenant] = _make_auth_a_api_key

    return _swap
