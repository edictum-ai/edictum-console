"""Bundle upload, versioning, and retrieval service."""

from __future__ import annotations

import hashlib
import logging
import uuid
from collections import defaultdict

import yaml
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle, Deployment

logger = logging.getLogger(__name__)

_MAX_VERSION_RETRIES = 5


async def upload_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    yaml_content: bytes,
    uploaded_by: str,
    source_hub_slug: str | None = None,
    source_hub_revision: str | None = None,
) -> Bundle:
    """Validate YAML, extract name, compute revision hash, auto-version, and persist.

    Raises:
        ValueError: If the YAML is unparseable or missing metadata.name.
    """
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    # Extract bundle name from metadata
    if not isinstance(parsed, dict):
        raise ValueError("Invalid YAML: expected a mapping at the top level")
    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict) or not metadata.get("name"):
        raise ValueError("Missing required field: metadata.name")
    bundle_name: str = metadata["name"]

    revision_hash = hashlib.sha256(yaml_content).hexdigest()

    # Retry loop: concurrent uploads of the same bundle name can race to claim
    # the same version number, hitting the unique constraint on (tenant_id, name, version).
    # Each attempt uses a savepoint so an IntegrityError rolls back only that attempt,
    # not the whole session. We re-query the latest version and try the next one.
    for attempt in range(_MAX_VERSION_RETRIES):
        result = await db.execute(
            select(Bundle.version)
            .where(Bundle.tenant_id == tenant_id, Bundle.name == bundle_name)
            .order_by(Bundle.version.desc())
            .limit(1)
        )
        latest_version = result.scalar_one_or_none()
        next_version = (latest_version or 0) + 1

        bundle = Bundle(
            tenant_id=tenant_id,
            name=bundle_name,
            version=next_version,
            revision_hash=revision_hash,
            yaml_bytes=yaml_content,
            uploaded_by=uploaded_by,
            source_hub_slug=source_hub_slug,
            source_hub_revision=source_hub_revision,
        )

        try:
            async with db.begin_nested():
                db.add(bundle)
                await db.flush()
            return bundle
        except IntegrityError:
            logger.warning(
                "Bundle version conflict: %s v%d (attempt %d/%d)",
                bundle_name,
                next_version,
                attempt + 1,
                _MAX_VERSION_RETRIES,
            )
            await db.expire_all()
            continue

    raise RuntimeError(
        f"Failed to assign a version for bundle '{bundle_name}' after "
        f"{_MAX_VERSION_RETRIES} attempts. Please retry."
    )


async def get_current_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    env: str,
    bundle_name: str | None = None,
) -> Bundle | None:
    """Return the latest deployed bundle for a given environment.

    If bundle_name is provided, scopes to that bundle name.
    """
    query = (
        select(Bundle)
        .join(
            Deployment,
            (Deployment.tenant_id == Bundle.tenant_id)
            & (Deployment.bundle_name == Bundle.name)
            & (Deployment.bundle_version == Bundle.version),
        )
        .where(Deployment.tenant_id == tenant_id, Deployment.env == env)
    )
    if bundle_name is not None:
        query = query.where(Bundle.name == bundle_name)
    query = query.order_by(Deployment.created_at.desc()).limit(1)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_tenant_bundles(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[Bundle]:
    """Return all bundles for a tenant, ordered by version DESC."""
    result = await db.execute(
        select(Bundle).where(Bundle.tenant_id == tenant_id).order_by(Bundle.version.desc())
    )
    return list(result.scalars().all())


async def list_bundle_names(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[dict[str, object]]:
    """Return distinct bundle names with aggregates (version_count, latest_version)."""
    result = await db.execute(
        select(
            Bundle.name,
            func.count(Bundle.id).label("version_count"),
            func.max(Bundle.version).label("latest_version"),
            func.max(Bundle.created_at).label("last_updated"),
        )
        .where(Bundle.tenant_id == tenant_id)
        .group_by(Bundle.name)
        .order_by(func.max(Bundle.created_at).desc())
    )
    return [
        {
            "name": row.name,
            "version_count": row.version_count,
            "latest_version": row.latest_version,
            "last_updated": row.last_updated,
        }
        for row in result.all()
    ]


async def list_bundle_versions(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str,
) -> list[Bundle]:
    """Return all versions for a specific bundle name, ordered by version DESC."""
    result = await db.execute(
        select(Bundle)
        .where(Bundle.tenant_id == tenant_id, Bundle.name == bundle_name)
        .order_by(Bundle.version.desc())
    )
    return list(result.scalars().all())


async def get_deployed_envs_map(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str | None = None,
) -> dict[int, list[str]]:
    """Return mapping of bundle_version -> deployed env names (current only)."""
    filters = [Deployment.tenant_id == tenant_id]
    if bundle_name is not None:
        filters.append(Deployment.bundle_name == bundle_name)

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
        .where(*filters)
        .subquery()
    )

    result = await db.execute(
        select(ranked.c.bundle_version, ranked.c.env).where(ranked.c.rn == 1)
    )

    mapping: dict[int, list[str]] = defaultdict(list)
    for version, env in result.all():
        mapping[version].append(env)
    for envs in mapping.values():
        envs.sort()
    return dict(mapping)


async def get_deployed_envs_by_bundle_name(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> dict[str, list[str]]:
    """Return mapping of bundle_name -> list of currently deployed env names.

    Single query for all bundles — avoids the N+1 problem of calling
    ``get_deployed_envs_map`` per bundle name.
    """
    ranked = (
        select(
            Deployment.bundle_name,
            Deployment.env,
            func.row_number()
            .over(
                partition_by=[Deployment.bundle_name, Deployment.env],
                order_by=Deployment.created_at.desc(),
            )
            .label("rn"),
        )
        .where(Deployment.tenant_id == tenant_id)
        .subquery()
    )

    result = await db.execute(
        select(ranked.c.bundle_name, ranked.c.env).where(ranked.c.rn == 1)
    )

    mapping: dict[str, list[str]] = defaultdict(list)
    for name, env in result.all():
        mapping[name].append(env)
    for envs in mapping.values():
        envs.sort()
    return dict(mapping)


async def get_bundle_by_version(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    version: int,
    bundle_name: str | None = None,
) -> Bundle | None:
    """Return a specific bundle version for a tenant."""
    filters = [Bundle.tenant_id == tenant_id, Bundle.version == version]
    if bundle_name is not None:
        filters.append(Bundle.name == bundle_name)
    result = await db.execute(select(Bundle).where(*filters))
    return result.scalar_one_or_none()
