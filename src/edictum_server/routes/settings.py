"""Settings endpoints — signing key rotation and event purge."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.schemas.settings import PurgeEventsResponse, RotateKeyResponse
from edictum_server.services.event_service import purge_events
from edictum_server.services.signing_service import rotate_signing_key

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.post("/rotate-signing-key", response_model=RotateKeyResponse, status_code=201)
async def rotate_key(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RotateKeyResponse:
    """Rotate the tenant's Ed25519 signing key and re-sign active deployments."""
    try:
        signing_secret = settings.get_signing_secret()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result = await rotate_signing_key(db, auth.tenant_id, signing_secret)
    await db.commit()
    return RotateKeyResponse(
        public_key=result["public_key"],  # type: ignore[arg-type]
        rotated_at=result["rotated_at"],  # type: ignore[arg-type]
        deployments_re_signed=result["deployments_re_signed"],  # type: ignore[arg-type]
    )


@router.delete("/purge-events", response_model=PurgeEventsResponse)
async def purge(
    older_than_days: int = Query(..., ge=1, description="Delete events older than N days"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> PurgeEventsResponse:
    """Purge audit events older than the specified number of days."""
    deleted_count, cutoff = await purge_events(db, auth.tenant_id, older_than_days)
    await db.commit()
    return PurgeEventsResponse(deleted_count=deleted_count, cutoff=cutoff)
