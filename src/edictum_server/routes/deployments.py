"""Deployment listing endpoint -- ``GET /api/v1/deployments``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.db.models import Deployment
from edictum_server.schemas.bundles import DeploymentResponse

router = APIRouter(prefix="/api/v1/deployments", tags=["deployments"])


@router.get("", response_model=list[DeploymentResponse], summary="List deployments")
async def list_deployments(
    env: str | None = Query(default=None, description="Filter by environment"),
    bundle_name: str | None = Query(default=None, description="Filter by bundle name"),
    limit: int = Query(default=50, ge=1, le=200, description="Max results"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[DeploymentResponse]:
    """List deployments for the tenant, newest first."""
    stmt = (
        select(Deployment)
        .where(Deployment.tenant_id == auth.tenant_id)
        .order_by(Deployment.created_at.desc())
        .limit(limit)
    )
    if env is not None:
        stmt = stmt.where(Deployment.env == env)
    if bundle_name is not None:
        stmt = stmt.where(Deployment.bundle_name == bundle_name)

    result = await db.execute(stmt)
    return [DeploymentResponse.model_validate(d) for d in result.scalars().all()]
