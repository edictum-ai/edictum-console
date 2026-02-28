"""Add bundle name column to bundles and deployments.

Revision ID: 003
Revises: 002
Create Date: 2026-02-28

Adds `name` to bundles (scoping versions per bundle name) and
`bundle_name` to deployments. Backfills from existing YAML metadata
and joined bundle rows.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import yaml

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add nullable columns
    op.add_column("bundles", sa.Column("name", sa.String(), nullable=True))
    op.add_column("deployments", sa.Column("bundle_name", sa.String(), nullable=True))

    # 2. Backfill bundles.name from yaml_bytes metadata.name
    conn = op.get_bind()
    bundles = conn.execute(sa.text("SELECT id, yaml_bytes FROM bundles"))
    for row in bundles:
        bundle_id = row[0]
        yaml_bytes = row[1]
        name = "unnamed"
        try:
            parsed = yaml.safe_load(yaml_bytes)
            if isinstance(parsed, dict):
                metadata = parsed.get("metadata", {})
                if isinstance(metadata, dict) and metadata.get("name"):
                    name = metadata["name"]
        except Exception:  # noqa: BLE001
            pass
        conn.execute(
            sa.text("UPDATE bundles SET name = :name WHERE id = :id"),
            {"name": name, "id": bundle_id},
        )

    # 3. Backfill deployments.bundle_name from joined bundle
    conn.execute(
        sa.text(
            """
            UPDATE deployments
            SET bundle_name = (
                SELECT b.name FROM bundles b
                WHERE b.tenant_id = deployments.tenant_id
                  AND b.version = deployments.bundle_version
                LIMIT 1
            )
            """
        )
    )
    # Any deployments with no matching bundle get "unnamed"
    conn.execute(
        sa.text(
            "UPDATE deployments SET bundle_name = 'unnamed' WHERE bundle_name IS NULL"
        )
    )

    # 4. Make columns non-nullable
    op.alter_column("bundles", "name", nullable=False)
    op.alter_column("deployments", "bundle_name", nullable=False)

    # 5. Swap unique constraint
    op.drop_constraint("uq_bundle_tenant_version", "bundles", type_="unique")
    op.create_unique_constraint(
        "uq_bundle_tenant_name_version", "bundles", ["tenant_id", "name", "version"]
    )

    # 6. Add indexes
    op.create_index("ix_bundles_name", "bundles", ["name"])
    op.create_index("ix_deployments_bundle_name", "deployments", ["bundle_name"])
    op.create_index("ix_bundles_revision_hash", "bundles", ["revision_hash"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_bundles_revision_hash", table_name="bundles")
    op.drop_index("ix_deployments_bundle_name", table_name="deployments")
    op.drop_index("ix_bundles_name", table_name="bundles")

    # Restore old constraint
    op.drop_constraint("uq_bundle_tenant_name_version", "bundles", type_="unique")
    op.create_unique_constraint(
        "uq_bundle_tenant_version", "bundles", ["tenant_id", "version"]
    )

    # Drop columns
    op.drop_column("deployments", "bundle_name")
    op.drop_column("bundles", "name")
