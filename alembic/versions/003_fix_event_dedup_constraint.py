"""Fix event deduplication constraint — remove created_at.

The unique constraint (tenant_id, call_id, created_at) is broken because
two events with the same call_id but different timestamps would bypass
deduplication. The correct key is (tenant_id, call_id) since call_id is
unique per agent tool call evaluation.

Revision ID: 003
Revises: 002
Create Date: 2026-03-19
"""

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
    op.create_unique_constraint(
        "uq_event_tenant_call",
        "events",
        ["tenant_id", "call_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
    op.create_unique_constraint(
        "uq_event_tenant_call",
        "events",
        ["tenant_id", "call_id", "created_at"],
    )
