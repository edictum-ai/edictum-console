"""Dashboard statistics endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import (
    AuthContext,
    get_current_tenant,
    require_dashboard_auth,
)
from edictum_server.db.engine import get_db
from edictum_server.schemas.stats import ContractStatsResponse, StatsOverviewResponse
from edictum_server.services.stats_service import get_contract_stats, get_overview

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


@router.get(
    "/contracts",
    response_model=ContractStatsResponse,
    summary="Get per-contract evaluation statistics",
)
async def contract_stats(
    since: datetime | None = Query(default=None, description="Start of time window (ISO 8601)"),
    until: datetime | None = Query(default=None, description="End of time window (ISO 8601)"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ContractStatsResponse:
    """Return per-contract aggregated evaluation stats."""
    now = datetime.now(UTC)
    effective_until = until or now
    effective_since = since or (now - timedelta(hours=24))
    return await get_contract_stats(db, auth.tenant_id, effective_since, effective_until)
