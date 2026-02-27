"""Add contract provenance and decision channel fields to approvals.

Revision ID: 002
Revises: 001
Create Date: 2026-02-27

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("approvals", sa.Column("decision_source", sa.String(), nullable=True))
    op.add_column("approvals", sa.Column("contract_name", sa.String(), nullable=True))
    op.add_column("approvals", sa.Column("decided_via", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("approvals", "decided_via")
    op.drop_column("approvals", "contract_name")
    op.drop_column("approvals", "decision_source")
