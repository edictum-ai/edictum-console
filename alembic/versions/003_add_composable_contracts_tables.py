"""Add composable contracts tables.

Revision ID: 003
Revises: 002
Create Date: 2026-03-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: str = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("contract_id", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "contract_id", "version", name="uq_contract_tenant_id_version"),
        sa.UniqueConstraint("tenant_id", "id", name="uq_contract_tenant_pk"),
    )
    op.create_index("ix_contracts_contract_id", "contracts", ["contract_id"])

    op.create_table(
        "bundle_compositions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("defaults_mode", sa.String(), nullable=False, server_default="enforce"),
        sa.Column("update_strategy", sa.String(), nullable=False, server_default="manual"),
        sa.Column("tools_config", sa.JSON(), nullable=True),
        sa.Column("observability", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_composition_tenant_name"),
        sa.UniqueConstraint("tenant_id", "id", name="uq_composition_tenant_pk"),
    )
    op.create_index("ix_bundle_compositions_name", "bundle_compositions", ["name"])

    op.create_table(
        "bundle_composition_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("composition_id", sa.Uuid(), nullable=False),
        sa.Column("contract_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("mode_override", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("composition_id", "contract_id", name="uq_item_composition_contract"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "composition_id"],
            ["bundle_compositions.tenant_id", "bundle_compositions.id"],
            ondelete="CASCADE",
            name="fk_item_tenant_composition",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "contract_id"],
            ["contracts.tenant_id", "contracts.id"],
            name="fk_item_tenant_contract",
        ),
    )

    op.create_table(
        "tenant_ai_configs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False, unique=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("api_key_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("base_url", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add columns to bundles — composition_id uses composite FK for tenant isolation
    op.add_column("bundles", sa.Column("composition_id", sa.Uuid(), nullable=True))
    op.add_column("bundles", sa.Column("composition_snapshot", sa.JSON(), nullable=True))
    op.create_foreign_key(
        "fk_bundle_tenant_composition",
        "bundles",
        "bundle_compositions",
        ["tenant_id", "composition_id"],
        ["tenant_id", "id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_bundle_tenant_composition", "bundles", type_="foreignkey")
    op.drop_column("bundles", "composition_snapshot")
    op.drop_column("bundles", "composition_id")
    op.drop_table("bundle_composition_items")
    op.drop_table("tenant_ai_configs")
    op.drop_table("bundle_compositions")
    op.drop_index("ix_contracts_contract_id", table_name="contracts")
    op.drop_table("contracts")
