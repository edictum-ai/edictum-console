"""Bundle composition CRUD, preview, and deploy endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.compositions import (
    ComposeDeployRequest,
    ComposeDeployResponse,
    CompositionCreateRequest,
    CompositionDetail,
    CompositionItemDetail,
    CompositionSummary,
    CompositionUpdateRequest,
    PreviewResponse,
)
from edictum_server.services.composition_assembly import (
    deploy_composition,
    preview_composition,
)
from edictum_server.services.composition_service import (
    create_composition,
    delete_composition,
    get_composition,
    get_composition_items,
    list_compositions,
    update_composition,
)

router = APIRouter(prefix="/api/v1/compositions", tags=["compositions"])


def _to_summary(comp: object, count: int) -> CompositionSummary:
    return CompositionSummary(
        name=comp.name,  # type: ignore[attr-defined]
        description=comp.description,  # type: ignore[attr-defined]
        defaults_mode=comp.defaults_mode,  # type: ignore[attr-defined]
        update_strategy=comp.update_strategy,  # type: ignore[attr-defined]
        contract_count=count,
        updated_at=comp.updated_at,  # type: ignore[attr-defined]
        created_by=comp.created_by,  # type: ignore[attr-defined]
    )


@router.get("", response_model=list[CompositionSummary])
async def list_compositions_endpoint(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[CompositionSummary]:
    """List all bundle compositions for this tenant."""
    rows = await list_compositions(db, auth.tenant_id)
    return [_to_summary(r["composition"], r["contract_count"]) for r in rows]


@router.get("/{name}", response_model=CompositionDetail)
async def get_composition_endpoint(
    name: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> CompositionDetail:
    """Get composition detail with contract items."""
    comp = await get_composition(db, auth.tenant_id, name)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Composition '{name}' not found")
    items = await get_composition_items(db, comp)
    return CompositionDetail(
        **_to_summary(comp, len(items)).model_dump(),
        id=comp.id, tenant_id=comp.tenant_id,
        contracts=[CompositionItemDetail(**i) for i in items],
        tools_config=comp.tools_config, observability=comp.observability,
    )


@router.post("", response_model=CompositionDetail, status_code=201)
async def create_composition_endpoint(
    body: CompositionCreateRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> CompositionDetail:
    """Create a new bundle composition."""
    try:
        comp = await create_composition(
            db, auth.tenant_id, body.name, auth.email or auth.user_id or "unknown",
            description=body.description, defaults_mode=body.defaults_mode,
            update_strategy=body.update_strategy, contracts=body.contracts,
            tools_config=body.tools_config, observability=body.observability,
        )
        await db.commit()
    except ValueError as exc:
        status = 409 if "already exists" in str(exc) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    push.push_to_dashboard(auth.tenant_id, {
        "type": "composition_changed", "composition_name": comp.name,
    })
    items = await get_composition_items(db, comp)
    return CompositionDetail(
        name=comp.name, description=comp.description,
        defaults_mode=comp.defaults_mode, update_strategy=comp.update_strategy,
        contract_count=len(items), updated_at=comp.updated_at,
        created_by=comp.created_by, id=comp.id, tenant_id=comp.tenant_id,
        contracts=[CompositionItemDetail(**i) for i in items],
        tools_config=comp.tools_config, observability=comp.observability,
    )


@router.put("/{name}", response_model=CompositionDetail)
async def update_composition_endpoint(
    name: str, body: CompositionUpdateRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> CompositionDetail:
    """Update a composition (add/remove/reorder contracts)."""
    try:
        comp = await update_composition(
            db, auth.tenant_id, name,
            description=body.description, defaults_mode=body.defaults_mode,
            update_strategy=body.update_strategy, contracts=body.contracts,
            tools_config=body.tools_config, observability=body.observability,
        )
        await db.commit()
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    push.push_to_dashboard(auth.tenant_id, {
        "type": "composition_changed", "composition_name": comp.name,
    })
    items = await get_composition_items(db, comp)
    return CompositionDetail(
        name=comp.name, description=comp.description,
        defaults_mode=comp.defaults_mode, update_strategy=comp.update_strategy,
        contract_count=len(items), updated_at=comp.updated_at,
        created_by=comp.created_by, id=comp.id, tenant_id=comp.tenant_id,
        contracts=[CompositionItemDetail(**i) for i in items],
        tools_config=comp.tools_config, observability=comp.observability,
    )


@router.delete("/{name}", status_code=204)
async def delete_composition_endpoint(
    name: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a composition (SET NULL on bundles.composition_id)."""
    try:
        await delete_composition(db, auth.tenant_id, name)
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{name}/preview", response_model=PreviewResponse)
async def preview_endpoint(
    name: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> PreviewResponse:
    """Assemble and return YAML without deploying."""
    comp = await get_composition(db, auth.tenant_id, name)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Composition '{name}' not found")
    result = await preview_composition(db, comp)
    return PreviewResponse(**result)


@router.post("/{name}/deploy", response_model=ComposeDeployResponse, status_code=201)
async def deploy_endpoint(
    name: str, body: ComposeDeployRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
    settings: Settings = Depends(get_settings),
) -> ComposeDeployResponse:
    """Assemble, sign, deploy, and push a composed bundle."""
    comp = await get_composition(db, auth.tenant_id, name)
    if comp is None:
        raise HTTPException(status_code=404, detail=f"Composition '{name}' not found")
    try:
        signing_secret = settings.get_signing_secret()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        result = await deploy_composition(
            db, auth.tenant_id, comp, body.env,
            auth.email or auth.user_id or "unknown", signing_secret, push,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ComposeDeployResponse(**result)
