"""Bundle CRUD and deployment endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import (
    AuthContext,
    get_current_tenant,
    require_dashboard_auth,
)
from edictum_server.config import get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import Bundle
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.bundles import (
    BundleResponse,
    BundleUploadRequest,
    BundleWithDeploymentsResponse,
    DeploymentResponse,
    DeployRequest,
)
from edictum_server.services.bundle_service import (
    get_bundle_by_version,
    get_current_bundle,
    get_deployed_envs_map,
    list_tenant_bundles,
    upload_bundle,
)
from edictum_server.services.deployment_service import deploy_bundle

router = APIRouter(prefix="/api/v1/bundles", tags=["bundles"])


def _bundle_to_response(bundle: Bundle) -> BundleResponse:
    """Convert a Bundle ORM instance to a BundleResponse."""
    return BundleResponse(
        id=bundle.id,
        tenant_id=bundle.tenant_id,
        version=bundle.version,
        revision_hash=bundle.revision_hash,
        signature_hex=bundle.signature.hex() if bundle.signature is not None else None,
        source_hub_slug=bundle.source_hub_slug,
        source_hub_revision=bundle.source_hub_revision,
        uploaded_by=bundle.uploaded_by,
        created_at=bundle.created_at,
    )


@router.post("", response_model=BundleResponse, status_code=201)
async def upload(
    body: BundleUploadRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    """Upload a new contract bundle (dashboard-authenticated users)."""
    try:
        bundle = await upload_bundle(
            db=db,
            tenant_id=auth.tenant_id,
            yaml_content=body.yaml_content.encode("utf-8"),
            uploaded_by=auth.user_id or "unknown",
            source_hub_slug=None,
            source_hub_revision=None,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _bundle_to_response(bundle)


@router.get("", response_model=list[BundleWithDeploymentsResponse])
async def list_bundles(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[BundleWithDeploymentsResponse]:
    """List all bundles for the tenant, enriched with deployed environments."""
    bundles = await list_tenant_bundles(db, auth.tenant_id)
    envs_map = await get_deployed_envs_map(db, auth.tenant_id)
    return [
        BundleWithDeploymentsResponse(
            **_bundle_to_response(b).model_dump(),
            deployed_envs=envs_map.get(b.version, []),
        )
        for b in bundles
    ]


@router.get("/current", response_model=BundleResponse)
async def current(
    env: str = Query(..., description="Target environment"),
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    """Get the currently deployed bundle for an environment.

    Accessible by both API-key agents and dashboard-authenticated users.
    """
    bundle = await get_current_bundle(db, auth.tenant_id, env)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"No deployed bundle for env '{env}'")
    return _bundle_to_response(bundle)


@router.get("/{version}", response_model=BundleResponse)
async def get_version(
    version: int,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    """Get a specific bundle version."""
    bundle = await get_bundle_by_version(db, auth.tenant_id, version)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Bundle version not found")
    return _bundle_to_response(bundle)


@router.get("/{version}/yaml")
async def get_yaml(
    version: int,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Get the raw YAML content of a bundle version."""
    bundle = await get_bundle_by_version(db, auth.tenant_id, version)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Bundle version not found")
    return Response(
        content=bundle.yaml_bytes,
        media_type="application/x-yaml",
    )


@router.post(
    "/{version}/deploy",
    response_model=DeploymentResponse,
    status_code=201,
)
async def deploy(
    version: int,
    body: DeployRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> DeploymentResponse:
    """Deploy a bundle version to an environment (dashboard-authenticated)."""
    settings = get_settings()
    signing_secret = bytes.fromhex(settings.signing_key_secret)

    try:
        deployment = await deploy_bundle(
            db=db,
            tenant_id=auth.tenant_id,
            version=version,
            env=body.env,
            deployed_by=auth.user_id or "unknown",
            signing_secret=signing_secret,
            push_manager=push,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DeploymentResponse(
        id=deployment.id,
        env=deployment.env,
        bundle_version=deployment.bundle_version,
        deployed_by=deployment.deployed_by,
        created_at=deployment.created_at,
    )
