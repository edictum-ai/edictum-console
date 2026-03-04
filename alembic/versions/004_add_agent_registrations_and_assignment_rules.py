"""Add agent registrations and assignment rules tables.

Revision ID: 004
Revises: 003
Create Date: 2026-03-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: str = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_registrations",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("bundle_name", sa.String(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "agent_id", name="uq_agent_reg_tenant_agent"),
    )
    op.create_index("ix_agent_registrations_tenant", "agent_registrations", ["tenant_id"])
    op.create_index("ix_agent_registrations_agent_id", "agent_registrations", ["agent_id"])

    op.create_table(
        "assignment_rules",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("pattern", sa.String(), nullable=False),
        sa.Column("tag_match", sa.JSON(), nullable=True),
        sa.Column("bundle_name", sa.String(), nullable=False),
        sa.Column("env", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "priority", name="uq_assignment_rule_tenant_priority"),
    )
    op.create_index("ix_assignment_rules_tenant", "assignment_rules", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("assignment_rules")
    op.drop_table("agent_registrations")
