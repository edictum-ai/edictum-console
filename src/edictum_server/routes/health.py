"""Health-check endpoint with metadata."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server import __version__
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import User

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
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

    status = "ok" if redis_connected else "degraded"

    return {
        "status": status,
        "version": __version__,
        "auth_provider": settings.auth_provider,
        "bootstrap_complete": user_count > 0,
        "database": {"connected": True, "latency_ms": db_latency_ms},
        "redis": {"connected": redis_connected, "latency_ms": redis_latency_ms},
        "connected_agents": connected_agents,
    }
