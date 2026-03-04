"""Bundle composition assembly, preview, and deploy."""

from __future__ import annotations

import base64
import hashlib
import logging
import uuid

import yaml
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import (
    Bundle,
    BundleComposition,
    BundleCompositionItem,
    Contract,
    Deployment,
    SigningKey,
)
from edictum_server.push.manager import PushManager
from edictum_server.services.signing_service import sign_bundle

logger = logging.getLogger(__name__)
_MAX_VERSION_RETRIES = 5


async def assemble_bundle(
    db: AsyncSession, composition: BundleComposition,
) -> tuple[bytes, list[dict]]:
    """Assemble a BundleComposition into valid ContractBundle YAML."""
    result = await db.execute(
        select(BundleCompositionItem, Contract)
        .join(Contract, BundleCompositionItem.contract_id == Contract.id)
        .where(
            BundleCompositionItem.composition_id == composition.id,
            BundleCompositionItem.enabled.is_(True),
            Contract.tenant_id == composition.tenant_id,
        )
        .order_by(BundleCompositionItem.position)
    )
    contracts_yaml: list[dict] = []
    snapshot: list[dict] = []
    seen_ids: set[str] = set()

    for item, contract in result.all():
        if contract.tenant_id != composition.tenant_id:
            raise ValueError(
                f"Contract {contract.contract_id} belongs to a different tenant"
            )
        cid = contract.contract_id
        if cid in seen_ids:
            cid = f"{cid}.obs"
        seen_ids.add(contract.contract_id)

        contract_def = dict(contract.definition)
        contract_def["id"] = cid
        # Mode: item override > contract definition > composition default
        if item.mode_override:
            contract_def["mode"] = item.mode_override
        elif "mode" not in contract_def:
            contract_def["mode"] = composition.defaults_mode
        contracts_yaml.append(contract_def)
        snapshot.append({
            "contract_id": contract.contract_id, "version": contract.version,
            "mode": contract_def.get("mode"),
            "shadow": cid != contract.contract_id,
        })

    if not contracts_yaml:
        raise ValueError("Composition has no enabled contracts")

    bundle_doc: dict = {
        "apiVersion": "edictum/v1", "kind": "ContractBundle",
        "metadata": {"name": composition.name},
        "defaults": {"mode": composition.defaults_mode},
        "contracts": contracts_yaml,
    }
    if composition.description:
        bundle_doc["metadata"]["description"] = composition.description
    if composition.tools_config:
        bundle_doc["tools"] = composition.tools_config
    if composition.observability:
        bundle_doc["observability"] = composition.observability

    yaml_bytes = yaml.safe_dump(bundle_doc, sort_keys=False).encode()
    return yaml_bytes, snapshot


async def preview_composition(
    db: AsyncSession, composition: BundleComposition,
) -> dict:
    """Assemble and return YAML without creating any rows."""
    validation_errors: list[str] = []
    try:
        yaml_bytes, snapshot = await assemble_bundle(db, composition)
    except ValueError as exc:
        return {"yaml_content": "", "contracts_count": 0,
                "validation_errors": [str(exc)]}
    try:
        from edictum import load_bundle_string  # type: ignore[import-untyped]
        load_bundle_string(yaml_bytes.decode())
    except ImportError:
        pass
    except Exception as exc:
        validation_errors.append(str(exc))
    return {
        "yaml_content": yaml_bytes.decode(),
        "contracts_count": len(snapshot),
        "validation_errors": validation_errors,
    }


async def deploy_composition(
    db: AsyncSession, tenant_id: uuid.UUID, composition: BundleComposition,
    env: str, deployed_by: str, signing_secret: bytes,
    push_manager: PushManager,
) -> dict:
    """Assemble, sign, create Bundle + Deployment, and push SSE."""
    yaml_bytes, snapshot = await assemble_bundle(db, composition)
    revision_hash = hashlib.sha256(yaml_bytes).hexdigest()

    key_result = await db.execute(
        select(SigningKey).where(
            SigningKey.tenant_id == tenant_id, SigningKey.active.is_(True),
        ).limit(1)
    )
    signing_key_row = key_result.scalar_one_or_none()
    if signing_key_row is None:
        raise ValueError("No active signing key for tenant")

    signature = sign_bundle(
        private_key_encrypted=signing_key_row.private_key_encrypted,
        secret=signing_secret, data=yaml_bytes,
    )

    for attempt in range(_MAX_VERSION_RETRIES):
        result = await db.execute(
            select(Bundle.version)
            .where(Bundle.tenant_id == tenant_id, Bundle.name == composition.name)
            .order_by(Bundle.version.desc()).limit(1)
        )
        next_version = (result.scalar_one_or_none() or 0) + 1
        bundle = Bundle(
            tenant_id=tenant_id, name=composition.name, version=next_version,
            revision_hash=revision_hash, yaml_bytes=yaml_bytes,
            signature=signature, uploaded_by=deployed_by,
            composition_id=composition.id, composition_snapshot=snapshot,
        )
        try:
            async with db.begin_nested():
                db.add(bundle)
                await db.flush()
            break
        except IntegrityError:
            logger.warning("Bundle version conflict: %s v%d (%d/%d)",
                           composition.name, next_version, attempt + 1,
                           _MAX_VERSION_RETRIES)
            await db.expire_all()
    else:
        raise RuntimeError(
            f"Failed to assign version for '{composition.name}' "
            f"after {_MAX_VERSION_RETRIES} attempts."
        )

    deployment = Deployment(
        tenant_id=tenant_id, env=env, bundle_name=composition.name,
        bundle_version=next_version, deployed_by=deployed_by,
    )
    db.add(deployment)
    await db.flush()

    public_key_hex = signing_key_row.public_key.hex()
    contract_data = {
        "type": "contract_update", "bundle_name": composition.name,
        "version": next_version, "revision_hash": revision_hash,
        "signature": signature.hex(), "public_key": public_key_hex,
        "yaml_bytes": base64.b64encode(yaml_bytes).decode(),
    }
    push_manager.push_to_env(env, contract_data, tenant_id=tenant_id)
    push_manager.push_to_dashboard(tenant_id, contract_data)
    push_manager.push_to_dashboard(tenant_id, {
        "type": "composition_changed",
        "composition_name": composition.name,
        "bundle_version": next_version,
    })
    return {
        "bundle_name": composition.name, "bundle_version": next_version,
        "contracts_assembled": snapshot, "deployment_id": deployment.id,
    }
