"""AI usage statistics endpoint — token counts, costs, daily breakdown."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Date

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.db.models import AiUsageLog
from edictum_server.schemas.ai import AiUsageResponse, DailyUsage

router = APIRouter(tags=["ai"])


@router.get("/api/v1/settings/ai/usage", response_model=AiUsageResponse)
async def get_usage_stats(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=1, le=365),
) -> AiUsageResponse:
    """Get aggregated AI usage statistics for the current tenant."""
    since = datetime.now(UTC) - timedelta(days=days)

    # Totals query
    totals = await db.execute(
        select(
            func.coalesce(func.sum(AiUsageLog.input_tokens), 0).label("total_input"),
            func.coalesce(func.sum(AiUsageLog.output_tokens), 0).label("total_output"),
            func.sum(AiUsageLog.estimated_cost_usd).label("total_cost"),
            func.count().label("query_count"),
            func.coalesce(func.avg(
                AiUsageLog.output_tokens * 1000.0 / func.nullif(AiUsageLog.duration_ms, 0)
            ), 0.0).label("avg_tps"),
        ).where(
            AiUsageLog.tenant_id == auth.tenant_id,
            AiUsageLog.created_at >= since,
        )
    )
    row = totals.one()

    # Daily breakdown
    daily_q = await db.execute(
        select(
            cast(AiUsageLog.created_at, Date).label("day"),
            func.sum(AiUsageLog.input_tokens).label("input_tokens"),
            func.sum(AiUsageLog.output_tokens).label("output_tokens"),
            func.sum(AiUsageLog.estimated_cost_usd).label("cost_usd"),
            func.count().label("queries"),
        ).where(
            AiUsageLog.tenant_id == auth.tenant_id,
            AiUsageLog.created_at >= since,
        ).group_by("day").order_by("day")
    )
    daily_rows = daily_q.all()

    total_cost = float(row.total_cost) if row.total_cost is not None else None
    avg_tps = float(row.avg_tps) if row.avg_tps is not None else 0.0

    return AiUsageResponse(
        total_input_tokens=int(row.total_input),
        total_output_tokens=int(row.total_output),
        total_cost_usd=round(total_cost, 6) if total_cost is not None else None,
        query_count=int(row.query_count),
        avg_tokens_per_second=round(avg_tps, 1),
        daily=[
            DailyUsage(
                date=str(r.day),
                input_tokens=int(r.input_tokens),
                output_tokens=int(r.output_tokens),
                cost_usd=round(float(r.cost_usd), 6) if r.cost_usd is not None else None,
                queries=int(r.queries),
            )
            for r in daily_rows
        ],
    )
