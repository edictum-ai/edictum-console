"""Bundle deployment service -- sign, record, and push."""

from __future__ import annotations

import base64
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Deployment, SigningKey
from edictum_server.push.manager import PushManager
from edictum_server.services.bundle_service import get_bundle_by_version
from edictum_server.services.signing_service import sign_bundle


async def deploy_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    version: int,
    env: str,
    deployed_by: str,
    signing_secret: bytes,
    push_manager: PushManager,
) -> Deployment:
    """Deploy a bundle version to an environment.

    1. Fetches the bundle and validates it exists.
    2. Signs the bundle YAML if no signature is present.
    3. Creates a deployment record.
    4. Pushes the new bundle to connected agents via SSE.
    """
    bundle = await get_bundle_by_version(db, tenant_id, version)
    if bundle is None:
        raise ValueError(f"Bundle version {version} not found")

    # Sign the bundle if it hasn't been signed yet
    if bundle.signature is None:
        result = await db.execute(
            select(SigningKey)
            .where(
                SigningKey.tenant_id == tenant_id,
                SigningKey.active.is_(True),
            )
            .limit(1)
        )
        signing_key_row = result.scalar_one_or_none()
        if signing_key_row is None:
            raise ValueError("No active signing key for tenant")

        signature = sign_bundle(
            private_key_encrypted=signing_key_row.private_key_encrypted,
            secret=signing_secret,
            data=bundle.yaml_bytes,
        )
        bundle.signature = signature
        await db.flush()

    deployment = Deployment(
        tenant_id=tenant_id,
        env=env,
        bundle_version=version,
        deployed_by=deployed_by,
    )
    db.add(deployment)
    await db.flush()

    # Push to all connected agents for this environment
    # SDK expects event type "contract_update" (not "bundle_deployed")
    contract_data = {
        "type": "contract_update",
        "version": version,
        "revision_hash": bundle.revision_hash,
        "signature": bundle.signature.hex() if bundle.signature else None,
        "yaml_bytes": base64.b64encode(bundle.yaml_bytes).decode(),
    }
    push_manager.push_to_env(env, contract_data)
    push_manager.push_to_dashboard(tenant_id, contract_data)

    return deployment
