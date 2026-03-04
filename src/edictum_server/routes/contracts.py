"""Contract library CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.push.manager import PushManager, get_push_manager
from edictum_server.schemas.contracts import (
    ContractCreateRequest,
    ContractDetail,
    ContractSummary,
    ContractUpdateRequest,
    ContractUsageItem,
    ContractVersionInfo,
    ImportRequest,
    ImportResult,
)
from edictum_server.services.contract_service import (
    create_contract,
    delete_contract,
    get_contract,
    get_contract_usage,
    get_contract_versions,
    import_from_yaml,
    list_contracts,
    update_contract,
)

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


def _contract_to_summary(c: object) -> ContractSummary:
    return ContractSummary.model_validate(c)


def _contract_to_detail(
    c: object, versions: list[object] | None = None,
) -> ContractDetail:
    detail = ContractDetail.model_validate(c)
    if versions:
        detail.versions = [
            ContractVersionInfo(
                version=v.version,  # type: ignore[attr-defined]
                created_at=v.created_at,  # type: ignore[attr-defined]
                created_by=v.created_by,  # type: ignore[attr-defined]
            )
            for v in versions
        ]
    return detail


# --- Import must be registered BEFORE /{contract_id} to avoid path conflicts ---

@router.post("/import", response_model=ImportResult, status_code=201)
async def import_contracts(
    body: ImportRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> ImportResult:
    """Import contracts from a YAML bundle (top-down decomposition)."""
    try:
        result = await import_from_yaml(
            db, auth.tenant_id, body.yaml_content, auth.user_id or "unknown",
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Push events for each created/updated contract
    for cid in result["contracts_created"]:
        push.push_to_dashboard(auth.tenant_id, {
            "type": "contract_created",
            "contract_id": cid,
        })
    for cid in result["contracts_updated"]:
        push.push_to_dashboard(auth.tenant_id, {
            "type": "contract_updated",
            "contract_id": cid,
        })

    return ImportResult(**result)


@router.get("", response_model=list[ContractSummary])
async def list_contracts_endpoint(
    type: str | None = Query(None, description="Filter by type"),
    tag: str | None = Query(None, description="Filter by tag"),
    search: str | None = Query(None, description="Search name/description"),
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ContractSummary]:
    """List contracts in the library (latest versions only)."""
    contracts = await list_contracts(
        db, auth.tenant_id,
        type_filter=type, tag_filter=tag, search=search,
    )
    return [_contract_to_summary(c) for c in contracts]


@router.post("", response_model=ContractDetail, status_code=201)
async def create_contract_endpoint(
    body: ContractCreateRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> ContractDetail:
    """Create a new contract in the library."""
    try:
        contract = await create_contract(
            db, auth.tenant_id,
            contract_id=body.contract_id,
            name=body.name,
            type=body.type,
            definition=body.definition,
            created_by=auth.user_id or "unknown",
            description=body.description,
            tags=body.tags,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    push.push_to_dashboard(auth.tenant_id, {
        "type": "contract_created",
        "contract_id": contract.contract_id,
        "version": contract.version,
    })

    return _contract_to_detail(contract)


@router.get("/{contract_id}", response_model=ContractDetail)
async def get_contract_endpoint(
    contract_id: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ContractDetail:
    """Get contract details (latest version + version history)."""
    contract = await get_contract(db, auth.tenant_id, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail=f"Contract '{contract_id}' not found")

    versions = await get_contract_versions(db, auth.tenant_id, contract_id)
    return _contract_to_detail(contract, versions)


@router.get("/{contract_id}/versions/{version}", response_model=ContractDetail)
async def get_contract_version_endpoint(
    contract_id: str,
    version: int,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ContractDetail:
    """Get a specific version of a contract."""
    contract = await get_contract(db, auth.tenant_id, contract_id, version=version)
    if contract is None:
        raise HTTPException(
            status_code=404,
            detail=f"Contract '{contract_id}' v{version} not found",
        )
    return _contract_to_detail(contract)


@router.put("/{contract_id}", response_model=ContractDetail, status_code=200)
async def update_contract_endpoint(
    contract_id: str,
    body: ContractUpdateRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
    push: PushManager = Depends(get_push_manager),
) -> ContractDetail:
    """Update a contract (creates a new version)."""
    try:
        contract = await update_contract(
            db, auth.tenant_id, contract_id,
            created_by=auth.user_id or "unknown",
            name=body.name,
            description=body.description,
            definition=body.definition,
            tags=body.tags,
        )
        await db.commit()
    except ValueError as exc:
        detail = str(exc)
        status = 422 if "at least one field" in detail.lower() else 404
        raise HTTPException(status_code=status, detail=detail) from exc

    push.push_to_dashboard(auth.tenant_id, {
        "type": "contract_updated",
        "contract_id": contract.contract_id,
        "version": contract.version,
    })

    versions = await get_contract_versions(db, auth.tenant_id, contract_id)
    return _contract_to_detail(contract, versions)


@router.delete("/{contract_id}", status_code=204)
async def delete_contract_endpoint(
    contract_id: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a contract (all versions). Fails if referenced by a composition."""
    try:
        await delete_contract(db, auth.tenant_id, contract_id)
        await db.commit()
    except ValueError as exc:
        status = 409 if "referenced" in str(exc) else 404
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.get("/{contract_id}/usage", response_model=list[ContractUsageItem])
async def get_contract_usage_endpoint(
    contract_id: str,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ContractUsageItem]:
    """List bundle compositions that use this contract."""
    items = await get_contract_usage(db, auth.tenant_id, contract_id)
    return [ContractUsageItem(**item) for item in items]
