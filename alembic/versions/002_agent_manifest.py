"""Add manifest column to agent_registrations.

Stores the contract manifest pushed by Gate agents alongside events,
enabling coverage analysis for locally-governed agents.

Revision ID: 002
Revises: 001
Create Date: 2026-03-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_registrations", sa.Column("manifest", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_registrations", "manifest")
