"""Health-check endpoints with metadata and probe support."""

from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server import __version__
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import User

router = APIRouter(prefix="/api/v1", tags=["health"])


def _get_worker_statuses(request: Request) -> dict[str, str]:
    """Check background worker task statuses."""
    workers: dict[str, str] = {}
    try:
        bg: dict[str, asyncio.Task[None]] = request.app.state.background_workers
        for name, task in bg.items():
            if not task.done():
                workers[name] = "running"
            elif task.cancelled():
                workers[name] = "stopped"
            else:
                try:
                    task.exception()
                    workers[name] = "crashed"
                except asyncio.InvalidStateError:
                    workers[name] = "stopped"
    except AttributeError:
        pass
    return workers


@router.get("/health")
async def health(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Full health check. Returns 503 when degraded."""
    result = await db.execute(select(func.count()).select_from(User))
    user_count = result.scalar() or 0

    # DB latency
    db_start = time.monotonic()
    await db.execute(text("SELECT 1"))
    db_latency_ms = round((time.monotonic() - db_start) * 1000, 2)

    # Redis latency
    redis_connected = False
    redis_latency_ms: float | None = None
    try:
        redis = request.app.state.redis
        redis_start = time.monotonic()
        await redis.ping()
        redis_latency_ms = round((time.monotonic() - redis_start) * 1000, 2)
        redis_connected = True
    except Exception:
        redis_connected = False

    # Connected agents
    connected_agents = 0
    try:
        push_manager = request.app.state.push_manager
        connected_agents = push_manager.connection_count
    except Exception:
        pass

    # Worker health
    workers = _get_worker_statuses(request)
    any_worker_unhealthy = any(s in ("crashed", "stopped") for s in workers.values())

    status = "ok"
    if not redis_connected or any_worker_unhealthy:
        status = "degraded"

    body = {
        "status": status,
        "version": __version__,
        "auth_provider": settings.auth_provider,
        "bootstrap_complete": user_count > 0,
        "base_url_https": settings.base_url.startswith("https://"),
        "database": {"connected": True, "latency_ms": db_latency_ms},
        "redis": {"connected": redis_connected, "latency_ms": redis_latency_ms},
        "connected_agents": connected_agents,
        "workers": workers,
    }

    status_code = 200 if status == "ok" else 503
    return JSONResponse(content=body, status_code=status_code)


@router.get("/health/live")
async def health_live() -> dict[str, str]:
    """Liveness probe. Returns 200 if the process is running."""
    return {"status": "alive"}


@router.get("/health/ready")
async def health_ready(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Readiness probe. Returns 200 if Postgres and Redis are reachable, 503 otherwise."""
    # Postgres check
    db_connected = False
    db_latency_ms: float | None = None
    try:
        db_start = time.monotonic()
        await db.execute(text("SELECT 1"))
        db_latency_ms = round((time.monotonic() - db_start) * 1000, 2)
        db_connected = True
    except Exception:
        db_connected = False

    # Redis check
    redis_connected = False
    redis_latency_ms: float | None = None
    try:
        redis = request.app.state.redis
        redis_start = time.monotonic()
        await redis.ping()
        redis_latency_ms = round((time.monotonic() - redis_start) * 1000, 2)
        redis_connected = True
    except Exception:
        redis_connected = False

    # Worker health
    workers = _get_worker_statuses(request)
    any_worker_unhealthy = any(s in ("crashed", "stopped") for s in workers.values())

    ready = db_connected and redis_connected and not any_worker_unhealthy
    status = "ready" if ready else "not_ready"

    body = {
        "status": status,
        "database": {"connected": db_connected, "latency_ms": db_latency_ms},
        "redis": {"connected": redis_connected, "latency_ms": redis_latency_ms},
        "workers": workers,
    }

    status_code = 200 if ready else 503
    return JSONResponse(content=body, status_code=status_code)
