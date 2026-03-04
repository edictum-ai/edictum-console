"""Contract library CRUD — create, version, list, delete, import from YAML."""

from __future__ import annotations

import logging
import re
import uuid

import yaml
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import (
    BundleComposition,
    BundleCompositionItem,
    Contract,
)

logger = logging.getLogger(__name__)

_CONTRACT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
_VALID_TYPES = {"pre", "post", "session", "sandbox"}
_MAX_VERSION_RETRIES = 5


async def create_contract(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
    name: str,
    type: str,
    definition: dict,
    created_by: str,
    description: str | None = None,
    tags: list[str] | None = None,
) -> Contract:
    """Create a new contract (version 1). Raises ValueError if contract_id exists."""
    if not _CONTRACT_ID_RE.match(contract_id):
        raise ValueError(
            "contract_id must match [a-z0-9][a-z0-9_-]*"
        )
    if type not in _VALID_TYPES:
        raise ValueError(f"type must be one of {sorted(_VALID_TYPES)}")

    # Use savepoint so a concurrent create of the same contract_id
    # hits the unique constraint gracefully instead of causing a 500.
    contract = Contract(
        tenant_id=tenant_id,
        contract_id=contract_id,
        version=1,
        type=type,
        name=name,
        description=description,
        definition=definition,
        tags=tags or [],
        is_latest=True,
        created_by=created_by,
    )
    try:
        async with db.begin_nested():
            db.add(contract)
            await db.flush()
    except IntegrityError as exc:
        raise ValueError(
            f"Contract '{contract_id}' already exists. Use PUT to create a new version."
        ) from exc
    return contract


async def update_contract(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
    created_by: str,
    name: str | None = None,
    description: str | None = None,
    definition: dict | None = None,
    tags: list[str] | None = None,
) -> Contract:
    """Create a new version of an existing contract. Uses savepoint retry for races."""
    if all(v is None for v in (name, description, definition, tags)):
        raise ValueError("At least one field must be provided for update")

    for attempt in range(_MAX_VERSION_RETRIES):
        result = await db.execute(
            select(Contract).where(
                Contract.tenant_id == tenant_id,
                Contract.contract_id == contract_id,
                Contract.is_latest.is_(True),
            )
        )
        latest = result.scalar_one_or_none()
        if latest is None:
            raise ValueError(f"Contract '{contract_id}' not found")

        next_version = latest.version + 1
        new_contract = Contract(
            tenant_id=tenant_id,
            contract_id=contract_id,
            version=next_version,
            type=latest.type,
            name=name if name is not None else latest.name,
            description=description if description is not None else latest.description,
            definition=definition if definition is not None else latest.definition,
            tags=tags if tags is not None else latest.tags,
            is_latest=True,
            created_by=created_by,
        )

        try:
            async with db.begin_nested():
                latest.is_latest = False
                db.add(new_contract)
                await db.flush()
            return new_contract
        except IntegrityError:
            logger.warning(
                "Contract version conflict: %s v%d (attempt %d/%d)",
                contract_id, next_version, attempt + 1, _MAX_VERSION_RETRIES,
            )
            await db.expire_all()
            continue

    raise RuntimeError(
        f"Failed to assign version for contract '{contract_id}' "
        f"after {_MAX_VERSION_RETRIES} attempts."
    )


async def get_contract(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
    version: int | None = None,
) -> Contract | None:
    """Get a contract by contract_id. Latest version if version is None."""
    query = select(Contract).where(
        Contract.tenant_id == tenant_id,
        Contract.contract_id == contract_id,
    )
    if version is not None:
        query = query.where(Contract.version == version)
    else:
        query = query.where(Contract.is_latest.is_(True))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_contract_versions(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
) -> list[Contract]:
    """Return all versions of a contract, newest first."""
    result = await db.execute(
        select(Contract).where(
            Contract.tenant_id == tenant_id,
            Contract.contract_id == contract_id,
        ).order_by(Contract.version.desc())
    )
    return list(result.scalars().all())


async def list_contracts(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    type_filter: str | None = None,
    tag_filter: str | None = None,
    search: str | None = None,
) -> list[Contract]:
    """List latest versions of all contracts, with optional filters."""
    query = select(Contract).where(
        Contract.tenant_id == tenant_id,
        Contract.is_latest.is_(True),
    )
    if type_filter:
        query = query.where(Contract.type == type_filter)
    if search:
        # Escape LIKE wildcards in user input to prevent wildcard injection
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            Contract.name.ilike(pattern)
            | Contract.description.ilike(pattern)
            | Contract.contract_id.ilike(pattern)
        )
    query = query.order_by(Contract.created_at.desc())
    result = await db.execute(query)
    contracts = list(result.scalars().all())

    # Tag filter — applied in Python since JSON contains varies by DB
    if tag_filter:
        contracts = [c for c in contracts if tag_filter in (c.tags or [])]

    return contracts


async def delete_contract(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
) -> None:
    """Delete all versions of a contract. Raises ValueError if referenced."""
    # Get all version UUIDs for this contract_id
    result = await db.execute(
        select(Contract.id).where(
            Contract.tenant_id == tenant_id,
            Contract.contract_id == contract_id,
        )
    )
    contract_uuids = list(result.scalars().all())
    if not contract_uuids:
        raise ValueError(f"Contract '{contract_id}' not found")

    # Check if any BundleCompositionItem references any version
    ref_result = await db.execute(
        select(BundleComposition.name).join(
            BundleCompositionItem,
            BundleCompositionItem.composition_id == BundleComposition.id,
        ).where(
            BundleCompositionItem.contract_id.in_(contract_uuids),
            BundleComposition.tenant_id == tenant_id,
        ).distinct()
    )
    composition_names = list(ref_result.scalars().all())
    if composition_names:
        raise ValueError(
            f"Contract '{contract_id}' is referenced by compositions: "
            f"{', '.join(composition_names)}. Remove it from those first."
        )

    # Delete all versions
    for cid in contract_uuids:
        obj = await db.get(Contract, cid)
        if obj:
            await db.delete(obj)
    await db.flush()


async def get_contract_usage(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    contract_id: str,
) -> list[dict]:
    """Return compositions that reference any version of this contract."""
    result = await db.execute(
        select(Contract.id).where(
            Contract.tenant_id == tenant_id,
            Contract.contract_id == contract_id,
        )
    )
    contract_uuids = list(result.scalars().all())
    if not contract_uuids:
        return []

    comp_result = await db.execute(
        select(
            BundleComposition.id.label("composition_id"),
            BundleComposition.name.label("composition_name"),
        ).join(
            BundleCompositionItem,
            BundleCompositionItem.composition_id == BundleComposition.id,
        ).where(
            BundleCompositionItem.contract_id.in_(contract_uuids),
            BundleComposition.tenant_id == tenant_id,
        ).distinct()
    )
    return [
        {"composition_id": row.composition_id, "composition_name": row.composition_name}
        for row in comp_result.all()
    ]


async def import_from_yaml(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    yaml_content: str,
    created_by: str,
) -> dict:
    """Import contracts from a YAML bundle. Returns created/updated lists."""
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("Invalid YAML: expected a mapping at the top level")

    api_version = parsed.get("apiVersion")
    kind = parsed.get("kind")
    if api_version != "edictum/v1":
        raise ValueError(
            f"Unsupported apiVersion: {api_version!r} (expected 'edictum/v1')"
        )
    if kind != "ContractBundle":
        raise ValueError(
            f"Unsupported kind: {kind!r} (expected 'ContractBundle')"
        )

    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict) or not metadata.get("name"):
        raise ValueError("Missing required field: metadata.name")
    bundle_name: str = metadata["name"]

    contracts_list = parsed.get("contracts")
    if not isinstance(contracts_list, list) or not contracts_list:
        raise ValueError("No contracts found in YAML")

    created: list[str] = []
    updated: list[str] = []

    for entry in contracts_list:
        if not isinstance(entry, dict):
            raise ValueError("Each contract must be a mapping")
        cid = entry.get("id")
        if not cid or not isinstance(cid, str):
            raise ValueError("Each contract must have an 'id' field")

        contract_type = entry.get("type", "pre")
        # Build definition from the contract body minus the 'id' field
        definition = {k: v for k, v in entry.items() if k != "id"}

        # Humanize name from id
        display_name = cid.replace("-", " ").replace("_", " ").title()

        # Check if this contract_id already exists
        existing = await get_contract(db, tenant_id, cid)
        if existing:
            await update_contract(
                db, tenant_id, cid, created_by,
                definition=definition,
            )
            updated.append(cid)
        else:
            await create_contract(
                db, tenant_id,
                contract_id=cid,
                name=display_name,
                type=contract_type,
                definition=definition,
                created_by=created_by,
            )
            created.append(cid)

    # Auto-create a BundleComposition referencing the imported contracts
    composition_name: str | None = None
    existing_comp = await db.execute(
        select(BundleComposition).where(
            BundleComposition.tenant_id == tenant_id,
            BundleComposition.name == bundle_name,
        )
    )
    if existing_comp.scalar_one_or_none() is None:
        comp = BundleComposition(
            tenant_id=tenant_id,
            name=bundle_name,
            description="Auto-created from YAML import",
            defaults_mode="enforce",
            update_strategy="manual",
            created_by=created_by,
        )
        db.add(comp)
        await db.flush()

        # Add items referencing latest version of each imported contract
        # Deduplicate: a contract_id that appears twice in YAML ends up in
        # both created+updated — adding two items for the same UUID violates
        # the UNIQUE constraint on (composition_id, contract_id).
        all_cids = list(dict.fromkeys(created + updated))
        for position, cid in enumerate(all_cids):
            contract = await get_contract(db, tenant_id, cid)
            if contract:
                item = BundleCompositionItem(
                    tenant_id=tenant_id,
                    composition_id=comp.id,
                    contract_id=contract.id,
                    position=(position + 1) * 10,
                    enabled=True,
                )
                db.add(item)

        await db.flush()
        composition_name = bundle_name

    return {
        "contracts_created": created,
        "contracts_updated": updated,
        "bundle_composition_created": composition_name,
    }
