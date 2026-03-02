"""Add env column and timestamp index on events table.

Revision ID: 002
Revises: 001
Create Date: 2026-03-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("env", sa.String(), nullable=True))
    op.create_index("ix_events_env", "events", ["env"])
    op.create_index("ix_events_timestamp", "events", ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_events_timestamp", table_name="events")
    op.drop_index("ix_events_env", table_name="events")
    op.drop_column("events", "env")
