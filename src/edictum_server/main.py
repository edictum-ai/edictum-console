"""FastAPI application entry point with lifespan management."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import async_session_factory, get_engine, init_engine
from edictum_server.notifications.base import NotificationManager
from edictum_server.notifications.loader import load_db_channels
from edictum_server.push.manager import PushManager
from edictum_server.redis.client import create_redis_client
from edictum_server.routes import (
    agent_registrations,
    agents,
    ai,
    ai_usage,
    approvals,
    assignment_rules,
    auth,
    bundles,
    compositions,
    contracts,
    deployments,
    discord,
    evaluate,
    events,
    health,
    keys,
    notifications,
    sessions,
    settings,
    setup,
    slack,
    stats,
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
                        timeout_data = {
                            "type": "approval_timeout",
                            "approval_id": item["id"],
                            "agent_id": item["agent_id"],
                            "tool_name": item["tool_name"],
                        }
                        push.push_to_env(item["env"], timeout_data, tenant_id=item["tenant_id"])
                        push.push_to_dashboard(item["tenant_id"], timeout_data)
                    # Group expired items by tenant for tenant-scoped notification
                    mgr: NotificationManager = app.state.notification_manager
                    by_tenant: dict[str, list[dict]] = {}
                    for item in expired:
                        tid = str(item["tenant_id"])
                        by_tenant.setdefault(tid, []).append(item)
                    for tid, tenant_items in by_tenant.items():
                        for ch in mgr.channels_for_tenant(tid):
                            if hasattr(ch, "update_expired"):
                                try:
                                    await ch.update_expired(tenant_items)
                                except Exception:
                                    logger.exception("Failed to update expired notifications")
        except Exception:
            logger.exception("Approval timeout worker error")
        await asyncio.sleep(10)


async def _worker_monitor(app: FastAPI) -> None:
    """Restart crashed background workers every 60 seconds."""
    while True:
        await asyncio.sleep(60)
        try:
            workers = app.state.background_workers
            if workers["approval_timeout"].done():
                logger.warning("Restarting crashed approval_timeout worker")
                workers["approval_timeout"] = asyncio.create_task(
                    _approval_timeout_worker(app)
                )
            if workers["partition"].done():
                logger.warning("Restarting crashed partition worker")
                workers["partition"] = asyncio.create_task(_partition_worker())
        except Exception:
            logger.exception("Worker monitor error")


async def _bootstrap_admin(_app: FastAPI) -> None:
    """Create default tenant + admin user on first run if no users exist."""
    settings = get_settings()
    from edictum_server.auth.local import LocalAuthProvider
    from edictum_server.db.models import SigningKey as SigningKeyModel
    from edictum_server.db.models import Tenant, User
    from edictum_server.services.signing_service import generate_signing_keypair

    async with async_session_factory()() as db:
        # Advisory lock prevents concurrent bootstrap across instances (S7).
        # Lock 42 is shared with the /api/v1/setup endpoint so the two
        # bootstrap paths are mutually exclusive.
        await db.execute(sa.text("SELECT pg_advisory_xact_lock(42)"))

        result = await db.execute(select(func.count()).select_from(User))
        user_count = result.scalar() or 0

        if user_count > 0:
            return

        # No users yet — check if env-var bootstrap is configured
        if not settings.admin_email or not settings.admin_password:
            logger.warning(
                "No admin account exists. "
                "Visit /dashboard/setup to create one, or set "
                "EDICTUM_ADMIN_EMAIL and EDICTUM_ADMIN_PASSWORD and restart."
            )
            return

        if len(settings.admin_password) < 12:
            logger.error(
                "EDICTUM_ADMIN_PASSWORD must be at least 12 characters. "
                "Bootstrap aborted — visit /dashboard/setup instead."
            )
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
        await db.flush()

        # Create initial signing key for bundle deployment
        if settings.signing_key_secret:
            secret = bytes.fromhex(settings.signing_key_secret)
            public_key_bytes, encrypted_private_key = generate_signing_keypair(secret)
            signing_key = SigningKeyModel(
                tenant_id=tenant.id,
                public_key=public_key_bytes,
                private_key_encrypted=encrypted_private_key,
                active=True,
            )
            db.add(signing_key)
            logger.info("Created initial signing key for tenant")

        await db.commit()
        logger.info("Bootstrapped admin user: %s", settings.admin_email)


async def _ensure_signing_keys(settings: Settings) -> None:
    """Backfill: create signing keys for tenants that don't have one.

    This handles existing deployments that were bootstrapped before
    signing key auto-creation was added.
    """
    if not settings.signing_key_secret:
        return

    from edictum_server.db.models import SigningKey as SigningKeyModel
    from edictum_server.db.models import Tenant
    from edictum_server.services.signing_service import generate_signing_keypair

    async with async_session_factory()() as db:
        # Find tenants without an active signing key
        tenants_with_keys = (
            select(SigningKeyModel.tenant_id).where(SigningKeyModel.active.is_(True)).subquery()
        )
        result = await db.execute(
            select(Tenant).where(Tenant.id.not_in(select(tenants_with_keys.c.tenant_id)))
        )
        tenants = result.scalars().all()

        if not tenants:
            return

        secret = bytes.fromhex(settings.signing_key_secret)
        for tenant in tenants:
            public_key_bytes, encrypted_private_key = generate_signing_keypair(secret)
            key = SigningKeyModel(
                tenant_id=tenant.id,
                public_key=public_key_bytes,
                private_key_encrypted=encrypted_private_key,
                active=True,
            )
            db.add(key)
            logger.info("Created signing key for tenant %s", tenant.id)

        await db.commit()


async def _cleanup_ai_usage() -> None:
    """Delete AI usage log rows older than 90 days.

    NOTE: Intentionally cross-tenant — this is an internal maintenance
    operation that only deletes expired rows and never returns data.
    Do not copy this pattern for data-access queries.
    """
    from edictum_server.db.models import AiUsageLog

    try:
        cutoff = datetime.now(UTC) - timedelta(days=90)
        async with async_session_factory()() as db:
            result = await db.execute(sa.delete(AiUsageLog).where(AiUsageLog.created_at < cutoff))
            if result.rowcount:
                await db.commit()
                logger.info("Cleaned up %d old AI usage log(s)", result.rowcount)
    except Exception:
        logger.exception("AI usage cleanup error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle hook."""
    settings = get_settings()
    settings.validate_required()

    # Warn if base_url is not HTTPS in non-local environments
    parsed = urlparse(settings.base_url)
    if not settings.base_url.startswith("https://") and parsed.hostname not in (
        "localhost",
        "127.0.0.1",
    ):
        logger.warning(
            "EDICTUM_BASE_URL is not HTTPS (%s) — session cookies will not have "
            "the Secure flag. Set EDICTUM_BASE_URL to your public HTTPS URL in production.",
            settings.base_url,
        )

    # Validate signing key secret early — log clearly if misconfigured
    try:
        settings.get_signing_secret()
    except ValueError as exc:
        logger.warning(
            "EDICTUM_SIGNING_KEY_SECRET not set — bundle signing and "
            "notification encryption disabled: %s",
            exc,
        )

    # Database
    engine = init_engine(settings.database_url)

    # Redis
    app.state.redis = create_redis_client(settings.redis_url)

    # Auth provider
    from edictum_server.auth.local import LocalAuthProvider

    app.state.auth_provider = LocalAuthProvider(
        redis=app.state.redis,
        session_ttl_hours=settings.session_ttl_hours,
        secure_cookies=settings.base_url.startswith("https://"),
    )

    # Push manager (SSE)
    app.state.push_manager = PushManager()

    # Notification manager (tenant-keyed, all channels from DB)
    notification_mgr = NotificationManager()
    app.state.notification_manager = notification_mgr

    # Load DB-configured notification channels and register Telegram webhooks
    try:
        signing_secret: bytes | None = None
        try:
            signing_secret = settings.get_signing_secret()
        except ValueError:
            pass
        async with async_session_factory()() as db:
            channels_by_tenant = await load_db_channels(
                db,
                app.state.redis,
                settings.base_url,
                secret=signing_secret,
            )
            await notification_mgr.reload(channels_by_tenant)
            total = sum(len(chs) for chs in channels_by_tenant.values())
            logger.info("Loaded %d notification channel(s) from DB", total)
    except Exception:
        logger.exception("Failed to load notification channels from DB")

    # Bootstrap admin on first run
    await _bootstrap_admin(app)

    # Ensure every tenant has an active signing key
    await _ensure_signing_keys(settings)

    # Clean up old AI usage logs
    await _cleanup_ai_usage()

    # Background workers
    timeout_task = asyncio.create_task(_approval_timeout_worker(app))
    partition_task = asyncio.create_task(_partition_worker())
    app.state.push_manager.start_cleanup_task()

    # Expose workers for health monitoring
    app.state.background_workers = {
        "approval_timeout": timeout_task,
        "partition": partition_task,
    }

    # Auto-restart monitor for crashed workers
    monitor_task = asyncio.create_task(_worker_monitor(app))

    yield

    # Shutdown
    monitor_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await monitor_task
    app.state.push_manager.stop_cleanup_task()
    workers = app.state.background_workers
    workers["approval_timeout"].cancel()
    workers["partition"].cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await workers["approval_timeout"]
    with contextlib.suppress(asyncio.CancelledError):
        await workers["partition"]
    for ch in notification_mgr.channels:
        try:
            await ch.close()
        except Exception:
            logger.exception("Error closing notification channel %s", ch.name)
    await app.state.redis.aclose()
    await engine.dispose()


_settings = get_settings()
_is_production = _settings.env_name == "production"
app = FastAPI(
    title="Edictum Console",
    description="Self-hostable agent operations console -- runtime governance for AI agents",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CSRF protection — must be added after CORS so it runs on the inner request.
# Requires X-Requested-With header on cookie-auth mutating requests.
from edictum_server.auth.csrf import CSRFMiddleware  # noqa: E402

app.add_middleware(CSRFMiddleware)

# Trusted proxy support — properly resolve client IPs behind reverse proxies
if _settings.trusted_proxies:
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware  # noqa: E402

    _trusted_hosts = [h.strip() for h in _settings.trusted_proxies.split(",") if h.strip()]
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=_trusted_hosts)

# Routers
app.include_router(health.router)
app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(keys.router)
app.include_router(bundles.router)
app.include_router(compositions.router)
app.include_router(contracts.router)
app.include_router(evaluate.router)
app.include_router(deployments.router)
app.include_router(stream.router)
app.include_router(events.router)
app.include_router(sessions.router)
app.include_router(approvals.router)
app.include_router(stats.router)
app.include_router(telegram.router)
app.include_router(discord.router)
app.include_router(slack.router)
app.include_router(agents.router)
app.include_router(agent_registrations.router)
app.include_router(assignment_rules.router)
app.include_router(notifications.router)
app.include_router(settings.router)
app.include_router(ai.router)
app.include_router(ai_usage.router)


# --- 404 handler: redirect non-API paths to dashboard -------------------------
@app.exception_handler(404)
async def not_found_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse | RedirectResponse:
    """API routes get JSON 404; everything else redirects to the dashboard."""
    if request.url.path.startswith("/api/"):
        detail = exc.detail if exc.detail else "Not Found"
        return JSONResponse({"detail": detail}, status_code=404)
    return RedirectResponse(url="/dashboard", status_code=302)


# --- SPA serving (dashboard) ---------------------------------------------------
_STATIC_DIR = Path(os.environ.get("EDICTUM_STATIC_DIR", "/app/static/dashboard"))


@app.get("/dashboard/{full_path:path}", response_model=None)
async def serve_spa(request: Request, full_path: str) -> FileResponse | HTMLResponse:  # noqa: ARG001
    """Serve the React SPA — static files or index.html for client-side routing."""
    file_path = (_STATIC_DIR / full_path).resolve()
    if full_path and file_path.is_file() and str(file_path).startswith(str(_STATIC_DIR.resolve())):
        return FileResponse(file_path)
    index = _STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return HTMLResponse(
        "<h1>Dashboard not built</h1>"
        "<p>Run <code>cd dashboard && pnpm build</code> or use the Vite dev server.</p>",
        status_code=404,
    )


_ASSETS_DIR = _STATIC_DIR / "assets"
if _ASSETS_DIR.is_dir():
    app.mount(
        "/dashboard/assets",
        StaticFiles(directory=str(_ASSETS_DIR)),
        name="dashboard-assets",
    )
