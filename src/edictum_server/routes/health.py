"""Health-check endpoint with metadata."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server import __version__
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import User

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health(
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(func.count()).select_from(User))
    user_count = result.scalar() or 0

    return {
        "status": "ok",
        "version": __version__,
        "auth_provider": settings.auth_provider,
        "bootstrap_complete": user_count > 0,
    }
