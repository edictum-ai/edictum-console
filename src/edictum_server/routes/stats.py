"""Dashboard statistics endpoint -- ``GET /api/v1/stats/overview``."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, get_current_tenant
from edictum_server.db.engine import get_db
from edictum_server.schemas.stats import StatsOverviewResponse
from edictum_server.services.stats_service import get_overview

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get(
    "/overview",
    response_model=StatsOverviewResponse,
    summary="Get dashboard overview statistics",
)
async def stats_overview(
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> StatsOverviewResponse:
    """Return aggregate stats for the dashboard home view."""
    return await get_overview(db, auth.tenant_id)
