"""Add ai_usage_logs table for tracking AI token usage and costs.

Revision ID: 005
Revises: 004
Create Date: 2026-03-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: str = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_logs",
        sa.Column(
            "id", sa.Uuid(), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id", sa.Uuid(),
            sa.ForeignKey("tenants.id"), nullable=False,
        ),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column(
            "estimated_cost_usd", sa.Numeric(10, 6), nullable=True,
        ),
        sa.Column(
            "request_type", sa.String(), nullable=False,
            server_default="assist",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_ai_usage_logs_tenant", "ai_usage_logs", ["tenant_id"],
    )
    op.create_index(
        "ix_ai_usage_logs_tenant_created",
        "ai_usage_logs",
        ["tenant_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("ai_usage_logs")
