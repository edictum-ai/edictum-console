"""Bundle composition CRUD — create, update, delete, list, get."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import (
    Bundle,
    BundleComposition,
    BundleCompositionItem,
    Contract,
)


async def resolve_contracts(
    db: AsyncSession, tenant_id: uuid.UUID, items: list,
) -> list[tuple[Contract, int, str | None, bool]]:
    """Resolve contract_id strings → latest Contract rows for this tenant."""
    resolved = []
    for item in items:
        result = await db.execute(
            select(Contract).where(
                Contract.tenant_id == tenant_id,
                Contract.contract_id == item.contract_id,
                Contract.is_latest.is_(True),
            )
        )
        contract = result.scalar_one_or_none()
        if contract is None:
            raise ValueError(f"Contract '{item.contract_id}' not found")
        resolved.append((contract, item.position, item.mode_override, item.enabled))
    return resolved


def _add_items(
    db: AsyncSession, tenant_id: uuid.UUID, comp_id: uuid.UUID,
    resolved: list[tuple[Contract, int, str | None, bool]],
) -> None:
    for contract, position, mode_override, enabled in resolved:
        db.add(BundleCompositionItem(
            tenant_id=tenant_id, composition_id=comp_id,
            contract_id=contract.id, position=position,
            mode_override=mode_override, enabled=enabled,
        ))


async def create_composition(
    db: AsyncSession, tenant_id: uuid.UUID, name: str, created_by: str,
    description: str | None = None, defaults_mode: str = "enforce",
    update_strategy: str = "manual", contracts: list | None = None,
    tools_config: dict | None = None, observability: dict | None = None,
) -> BundleComposition:
    """Create a new bundle composition with optional contract items."""
    resolved = await resolve_contracts(db, tenant_id, contracts or [])
    comp = BundleComposition(
        tenant_id=tenant_id, name=name, description=description,
        defaults_mode=defaults_mode, update_strategy=update_strategy,
        tools_config=tools_config, observability=observability,
        created_by=created_by,
    )
    try:
        async with db.begin_nested():
            db.add(comp)
            await db.flush()
    except IntegrityError as exc:
        raise ValueError(f"Composition '{name}' already exists.") from exc
    _add_items(db, tenant_id, comp.id, resolved)
    await db.flush()
    return comp


async def update_composition(
    db: AsyncSession, tenant_id: uuid.UUID, name: str,
    description: str | None = None, defaults_mode: str | None = None,
    update_strategy: str | None = None, contracts: list | None = None,
    tools_config: dict | None = None, observability: dict | None = None,
) -> BundleComposition:
    """Update a composition. If contracts provided, full replacement."""
    comp = await get_composition(db, tenant_id, name)
    if comp is None:
        raise ValueError(f"Composition '{name}' not found")
    if description is not None:
        comp.description = description
    if defaults_mode is not None:
        comp.defaults_mode = defaults_mode
    if update_strategy is not None:
        comp.update_strategy = update_strategy
    if tools_config is not None:
        comp.tools_config = tools_config
    if observability is not None:
        comp.observability = observability
    if contracts is not None:
        resolved = await resolve_contracts(db, tenant_id, contracts)
        await db.execute(delete(BundleCompositionItem).where(
            BundleCompositionItem.tenant_id == tenant_id,
            BundleCompositionItem.composition_id == comp.id,
        ))
        _add_items(db, tenant_id, comp.id, resolved)
    await db.flush()
    return comp


async def get_composition(
    db: AsyncSession, tenant_id: uuid.UUID, name: str,
) -> BundleComposition | None:
    """Get a composition by (tenant_id, name)."""
    result = await db.execute(
        select(BundleComposition).where(
            BundleComposition.tenant_id == tenant_id,
            BundleComposition.name == name,
        )
    )
    return result.scalar_one_or_none()


async def list_compositions(
    db: AsyncSession, tenant_id: uuid.UUID,
) -> list[dict]:
    """List compositions with contract counts."""
    item_count = (
        select(func.count(BundleCompositionItem.id))
        .where(BundleCompositionItem.composition_id == BundleComposition.id)
        .correlate(BundleComposition)
        .scalar_subquery()
    )
    result = await db.execute(
        select(BundleComposition, item_count.label("contract_count"))
        .where(BundleComposition.tenant_id == tenant_id)
        .order_by(BundleComposition.updated_at.desc())
    )
    return [
        {"composition": comp, "contract_count": count}
        for comp, count in result.all()
    ]


async def delete_composition(
    db: AsyncSession, tenant_id: uuid.UUID, name: str,
) -> None:
    """Delete a composition. SET NULL on bundles.composition_id."""
    comp = await get_composition(db, tenant_id, name)
    if comp is None:
        raise ValueError(f"Composition '{name}' not found")
    result = await db.execute(
        select(Bundle).where(
            Bundle.tenant_id == tenant_id, Bundle.composition_id == comp.id,
        )
    )
    for bundle in result.scalars().all():
        bundle.composition_id = None
    # Explicit item deletion — DB CASCADE works in Postgres but not SQLite
    await db.execute(delete(BundleCompositionItem).where(
        BundleCompositionItem.tenant_id == tenant_id,
        BundleCompositionItem.composition_id == comp.id,
    ))
    await db.delete(comp)
    await db.flush()


async def get_composition_items(
    db: AsyncSession, composition: BundleComposition,
) -> list[dict]:
    """Load composition items with contract details + has_newer_version."""
    result = await db.execute(
        select(BundleCompositionItem, Contract)
        .join(Contract, BundleCompositionItem.contract_id == Contract.id)
        .where(
            BundleCompositionItem.tenant_id == composition.tenant_id,
            BundleCompositionItem.composition_id == composition.id,
        )
        .order_by(BundleCompositionItem.position)
    )
    rows = result.all()
    # Batch: one query for max version per contract_id instead of N
    cids = {contract.contract_id for _, contract in rows}
    max_versions: dict[str, int] = {}
    if cids:
        ver_result = await db.execute(
            select(Contract.contract_id, func.max(Contract.version))
            .where(
                Contract.tenant_id == composition.tenant_id,
                Contract.contract_id.in_(cids),
            )
            .group_by(Contract.contract_id)
        )
        max_versions = dict(ver_result.all())
    return [
        {
            "contract_id": contract.contract_id,
            "contract_name": contract.name,
            "contract_type": contract.type,
            "contract_version": contract.version,
            "position": item.position,
            "mode_override": item.mode_override,
            "enabled": item.enabled,
            "has_newer_version": max_versions.get(contract.contract_id, contract.version) > contract.version,
        }
        for item, contract in rows
    ]
