"""Bundle CRUD and deployment endpoints — name-scoped."""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import (
    AuthContext,
    get_current_tenant,
    require_dashboard_auth,
)
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import Bundle
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.bundles import (
    BundleCurrentResponse,
    BundleResponse,
    BundleSummaryResponse,
    BundleUploadRequest,
    BundleWithDeploymentsResponse,
    DeploymentResponse,
    DeployRequest,
)
from edictum_server.services.bundle_service import (
    get_bundle_by_version,
    get_bundle_enrichment,
    get_current_bundle,
    get_deployed_envs_by_bundle_name,
    get_deployed_envs_map,
    list_bundle_names,
    list_bundle_versions,
    upload_bundle,
)
from edictum_server.services.deployment_service import deploy_bundle

router = APIRouter(prefix="/api/v1/bundles", tags=["bundles"])


def _bundle_to_response(bundle: Bundle) -> BundleResponse:
    """Convert a Bundle ORM instance to a BundleResponse."""
    return BundleResponse(
        id=bundle.id,
        tenant_id=bundle.tenant_id,
        name=bundle.name,
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
    push: PushManager = Depends(get_push_manager),
) -> BundleResponse:
    """Upload a new contract bundle (dashboard-authenticated users)."""
    try:
        bundle = await upload_bundle(
            db=db,
            tenant_id=auth.tenant_id,
            yaml_content=body.yaml_content.encode("utf-8"),
            uploaded_by=auth.email or auth.user_id or "unknown",
            source_hub_slug=None,
            source_hub_revision=None,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    push.push_to_dashboard(auth.tenant_id, {
        "type": "bundle_uploaded",
        "bundle_name": bundle.name,
        "version": bundle.version,
        "revision_hash": bundle.revision_hash,
        "uploaded_by": auth.email or auth.user_id or "unknown",
    })

    return _bundle_to_response(bundle)


@router.get("", response_model=list[BundleSummaryResponse])
async def list_bundles(
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[BundleSummaryResponse]:
    """List distinct bundle names with summaries.

    Accessible by both dashboard users and API key agents (for gate init).
    """
    names = await list_bundle_names(db, auth.tenant_id)
    envs_by_name = await get_deployed_envs_by_bundle_name(db, auth.tenant_id)
    enrichment = await get_bundle_enrichment(db, auth.tenant_id)
    return [
        BundleSummaryResponse(
            name=entry["name"],
            latest_version=entry["latest_version"],
            version_count=entry["version_count"],
            last_updated=entry["last_updated"],
            deployed_envs=envs_by_name.get(entry["name"], []),
            contract_count=enrichment.get(entry["name"], {}).get("contract_count"),
            last_deployed_at=enrichment.get(entry["name"], {}).get("last_deployed_at"),
        )
        for entry in names
    ]


# Register /{name}/current BEFORE /{name}/{version} — FastAPI matches top-to-bottom.
# Since version is typed as int, "current" won't match it, but order is a safety measure.
@router.get("/{name}/current", response_model=BundleCurrentResponse)
async def current(
    name: str,
    env: str = Query(..., description="Target environment"),
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> BundleCurrentResponse:
    """Get the currently deployed bundle for a (name, env) pair.

    Returns bundle metadata plus the YAML content (base64-encoded) so
    agents can parse and enforce contracts. Accessible by both API-key
    agents and dashboard-authenticated users.
    """
    bundle = await get_current_bundle(db, auth.tenant_id, env, bundle_name=name)
    if bundle is None:
        raise HTTPException(
            status_code=404,
            detail=f"No deployed bundle '{name}' for env '{env}'",
        )
    resp = _bundle_to_response(bundle)
    return BundleCurrentResponse(
        **resp.model_dump(),
        yaml_bytes=base64.b64encode(bundle.yaml_bytes).decode(),
    )


@router.get("/{name}", response_model=list[BundleWithDeploymentsResponse])
async def list_versions(
    name: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[BundleWithDeploymentsResponse]:
    """List all versions for a named bundle, newest first."""
    bundles = await list_bundle_versions(db, auth.tenant_id, name)
    if not bundles:
        raise HTTPException(status_code=404, detail=f"Bundle '{name}' not found")
    envs_map = await get_deployed_envs_map(db, auth.tenant_id, name)
    return [
        BundleWithDeploymentsResponse(
            **_bundle_to_response(b).model_dump(),
            deployed_envs=envs_map.get(b.version, []),
        )
        for b in bundles
    ]


@router.get("/{name}/{version}", response_model=BundleResponse)
async def get_version(
    name: str,
    version: int,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> BundleResponse:
    """Get a specific bundle version."""
    bundle = await get_bundle_by_version(db, auth.tenant_id, version, bundle_name=name)
    if bundle is None:
        raise HTTPException(
            status_code=404, detail=f"Bundle '{name}' v{version} not found"
        )
    return _bundle_to_response(bundle)


@router.get("/{name}/{version}/yaml")
async def get_yaml(
    name: str,
    version: int,
    auth: AuthContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Get the raw YAML content of a bundle version."""
    bundle = await get_bundle_by_version(db, auth.tenant_id, version, bundle_name=name)
    if bundle is None:
        raise HTTPException(
            status_code=404, detail=f"Bundle '{name}' v{version} not found"
        )
    return Response(
        content=bundle.yaml_bytes,
        media_type="application/x-yaml",
    )


@router.post(
    "/{name}/{version}/deploy",
    response_model=DeploymentResponse,
    status_code=201,
)
async def deploy(
    name: str,
    version: int,
    body: DeployRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
    settings: Settings = Depends(get_settings),
) -> DeploymentResponse:
    """Deploy a bundle version to an environment (dashboard-authenticated)."""
    try:
        signing_secret = settings.get_signing_secret()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        deployment = await deploy_bundle(
            db=db,
            tenant_id=auth.tenant_id,
            bundle_name=name,
            version=version,
            env=body.env,
            deployed_by=auth.email or auth.user_id or "unknown",
            signing_secret=signing_secret,
            push_manager=push,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DeploymentResponse(
        id=deployment.id,
        env=deployment.env,
        bundle_name=deployment.bundle_name,
        bundle_version=deployment.bundle_version,
        deployed_by=deployment.deployed_by,
        created_at=deployment.created_at,
    )
