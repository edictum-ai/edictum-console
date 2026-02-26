"""Bundle upload, versioning, and retrieval service."""

from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment


async def upload_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    yaml_content: bytes,
    uploaded_by: str,
    source_hub_slug: str | None = None,
    source_hub_revision: str | None = None,
) -> Bundle:
    """Validate YAML, compute revision hash, auto-version, and persist.

    Args:
        db: Active async database session.
        tenant_id: Owning tenant UUID.
        yaml_content: Raw YAML bytes.
        uploaded_by: Identity of the uploader (Clerk user id).
        source_hub_slug: Optional hub bundle slug this was copied from.
        source_hub_revision: Optional hub revision hash.

    Returns:
        The newly created Bundle row.

    Raises:
        ValueError: If the YAML is unparseable.
    """
    # Validate YAML parses cleanly
    try:
        yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    revision_hash = hashlib.sha256(yaml_content).hexdigest()

    # Determine next version number for this tenant
    result = await db.execute(
        select(Bundle.version)
        .where(Bundle.tenant_id == tenant_id)
        .order_by(Bundle.version.desc())
        .limit(1)
    )
    latest_version = result.scalar_one_or_none()
    next_version = (latest_version or 0) + 1

    bundle = Bundle(
        tenant_id=tenant_id,
        version=next_version,
        revision_hash=revision_hash,
        yaml_bytes=yaml_content,
        uploaded_by=uploaded_by,
        source_hub_slug=source_hub_slug,
        source_hub_revision=source_hub_revision,
    )
    db.add(bundle)
    await db.flush()
    return bundle


async def get_current_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    env: str,
) -> Bundle | None:
    """Return the latest deployed bundle for a given environment.

    Joins bundles with deployments and returns the most recently
    deployed bundle for the specified tenant + environment.
    """
    result = await db.execute(
        select(Bundle)
        .join(
            Deployment,
            (Deployment.tenant_id == Bundle.tenant_id)
            & (Deployment.bundle_version == Bundle.version),
        )
        .where(Deployment.tenant_id == tenant_id, Deployment.env == env)
        .order_by(Deployment.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_tenant_bundles(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[Bundle]:
    """Return all bundles for a tenant, ordered by version DESC."""
    result = await db.execute(
        select(Bundle)
        .where(Bundle.tenant_id == tenant_id)
        .order_by(Bundle.version.desc())
    )
    return list(result.scalars().all())


async def get_deployed_envs_map(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> dict[int, list[str]]:
    """Return a mapping of bundle_version -> list of deployed env names.

    For each environment, only the most recent deployment counts as
    the "current" deployment. Uses a single query with a window function.
    """
    # Subquery: rank deployments per env by recency
    ranked = (
        select(
            Deployment.env,
            Deployment.bundle_version,
            func.row_number()
            .over(
                partition_by=Deployment.env,
                order_by=Deployment.created_at.desc(),
            )
            .label("rn"),
        )
        .where(Deployment.tenant_id == tenant_id)
        .subquery()
    )

    result = await db.execute(
        select(ranked.c.bundle_version, ranked.c.env).where(
            ranked.c.rn == 1
        )
    )

    mapping: dict[int, list[str]] = defaultdict(list)
    for version, env in result.all():
        mapping[version].append(env)
    # Sort env lists for deterministic output
    for envs in mapping.values():
        envs.sort()
    return dict(mapping)


async def get_bundle_by_version(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    version: int,
) -> Bundle | None:
    """Return a specific bundle version for a tenant."""
    result = await db.execute(
        select(Bundle).where(
            Bundle.tenant_id == tenant_id,
            Bundle.version == version,
        )
    )
    return result.scalar_one_or_none()
