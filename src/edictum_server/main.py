"""FastAPI application entry point with lifespan management."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from edictum_server.config import get_settings
from edictum_server.db.engine import async_session_factory, get_engine, init_engine
from edictum_server.notifications.base import NotificationManager
from edictum_server.push.manager import PushManager
from edictum_server.redis.client import create_redis_client
from edictum_server.routes import (
    approvals,
    auth,
    bundles,
    events,
    health,
    keys,
    sessions,
    stream,
    telegram,
)
from edictum_server.services.approval_service import expire_approvals

logger = logging.getLogger(__name__)

_PARTITION_INTERVAL = 24 * 60 * 60  # 24 hours


async def _partition_worker() -> None:
    """Ensure event partitions exist for the next 3 months, once per day."""
    while True:
        try:
            engine = get_engine()
            if engine.dialect.name != "postgresql":
                return  # no-op for SQLite (tests)
            async with async_session_factory()() as db:
                await db.execute(sa.text("SELECT ensure_event_partitions(3)"))
                await db.commit()
                logger.info("Ensured event partitions for next 3 months")
        except Exception:
            logger.exception("Partition worker error")
        await asyncio.sleep(_PARTITION_INTERVAL)


async def _approval_timeout_worker(app: FastAPI) -> None:
    """Periodically expire pending approvals past their deadline."""
    while True:
        try:
            async with async_session_factory()() as db:
                expired = await expire_approvals(db)
                await db.commit()
                if expired:
                    logger.info("Expired %d approval(s)", len(expired))
                    push: PushManager = app.state.push_manager
                    for item in expired:
                        push.push_to_env(
                            item["env"],
                            {
                                "type": "approval_timeout",
                                "approval_id": item["id"],
                                "agent_id": item["agent_id"],
                                "tool_name": item["tool_name"],
                            },
                        )
                    # Notify via telegram channel if available
                    mgr: NotificationManager | None = getattr(
                        app.state,
                        "notification_manager",
                        None,
                    )
                    if mgr:
                        for ch in mgr.channels:
                            if hasattr(ch, "update_expired"):
                                try:
                                    await ch.update_expired(expired)
                                except Exception:
                                    logger.exception("Failed to update expired notifications")
        except Exception:
            logger.exception("Approval timeout worker error")
        await asyncio.sleep(10)


async def _bootstrap_admin(_app: FastAPI) -> None:
    """Create default tenant + admin user on first run if no users exist."""
    settings = get_settings()
    if not settings.admin_email or not settings.admin_password:
        logger.info("No admin credentials configured -- skipping bootstrap")
        return

    from edictum_server.auth.local import LocalAuthProvider
    from edictum_server.db.models import Tenant, User

    async with async_session_factory()() as db:
        result = await db.execute(select(func.count()).select_from(User))
        user_count = result.scalar() or 0

        if user_count > 0:
            logger.info("Users already exist -- skipping bootstrap")
            return

        # Create default tenant
        tenant = Tenant(name="default")
        db.add(tenant)
        await db.flush()

        # Create admin user
        password_hash = LocalAuthProvider.hash_password(settings.admin_password)
        admin = User(
            tenant_id=tenant.id,
            email=settings.admin_email,
            password_hash=password_hash,
            is_admin=True,
        )
        db.add(admin)
        await db.commit()
        logger.info("Bootstrapped admin user: %s", settings.admin_email)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle hook."""
    settings = get_settings()

    # Database
    engine = init_engine(settings.database_url)

    # Redis
    app.state.redis = create_redis_client(settings.redis_url)

    # Auth provider
    from edictum_server.auth.local import LocalAuthProvider

    app.state.auth_provider = LocalAuthProvider(
        redis=app.state.redis,
        session_ttl_hours=settings.session_ttl_hours,
    )

    # Push manager (SSE)
    app.state.push_manager = PushManager()

    # Notification manager
    notification_mgr = NotificationManager()

    # Telegram (optional)
    tg_channel = None
    if settings.telegram_bot_token:
        from edictum_server.notifications.telegram import TelegramChannel, TelegramClient

        tg_client = TelegramClient(settings.telegram_bot_token)
        tg_channel = TelegramChannel(
            client=tg_client,
            chat_id=settings.telegram_chat_id,
            redis=app.state.redis,
        )
        notification_mgr.add_channel(tg_channel)
        webhook_url = f"{settings.base_url.rstrip('/')}/api/v1/telegram/webhook"
        try:
            await tg_client.set_webhook(webhook_url, settings.telegram_webhook_secret)
            logger.info("Telegram webhook registered at %s", webhook_url)
        except Exception:
            logger.exception("Failed to register Telegram webhook")

    app.state.notification_manager = notification_mgr

    # Bootstrap admin on first run
    await _bootstrap_admin(app)

    # Background workers
    timeout_task = asyncio.create_task(_approval_timeout_worker(app))
    partition_task = asyncio.create_task(_partition_worker())

    yield

    # Shutdown
    partition_task.cancel()
    timeout_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await timeout_task
    with contextlib.suppress(asyncio.CancelledError):
        await partition_task
    if tg_channel is not None:
        await tg_channel.client.close()
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(
    title="Edictum Console",
    description="Self-hostable agent operations console -- runtime governance for AI agents",
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(keys.router)
app.include_router(bundles.router)
app.include_router(stream.router)
app.include_router(events.router)
app.include_router(sessions.router)
app.include_router(approvals.router)
app.include_router(telegram.router)
