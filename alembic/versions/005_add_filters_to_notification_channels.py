"""Add filters column to notification_channels.

Revision ID: 005
Revises: 004
Create Date: 2026-03-01

Optional JSON routing filters (environments, agent_patterns, contract_names)
for scoping which approvals trigger a notification channel.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notification_channels",
        sa.Column("filters", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notification_channels", "filters")
