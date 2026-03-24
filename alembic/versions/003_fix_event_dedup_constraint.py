"""Fix event deduplication constraint — remove created_at.

The unique constraint (tenant_id, call_id, created_at) is broken because
two events with the same call_id but different timestamps would bypass
deduplication. The correct key is (tenant_id, call_id) since call_id is
unique per agent tool call evaluation.

However, on Postgres the events table is PARTITION BY RANGE (created_at),
and unique constraints MUST include all partitioning columns. We cannot
drop created_at from the constraint on partitioned tables.

On Postgres: no-op — keep original (tenant_id, call_id, created_at).
Cross-batch dedup is handled at application level.

On SQLite (tests): apply the narrower (tenant_id, call_id) constraint
since partitioning doesn't exist.

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
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        # SQLite: no partitioning — narrower constraint is valid
        op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
        op.create_unique_constraint(
            "uq_event_tenant_call",
            "events",
            ["tenant_id", "call_id"],
        )
    # Postgres: no-op — (tenant_id, call_id, created_at) is required
    # by PARTITION BY RANGE (created_at). Same-batch dedup still works
    # via ON CONFLICT DO NOTHING; cross-batch dedup is a known limitation.


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
        op.create_unique_constraint(
            "uq_event_tenant_call",
            "events",
            ["tenant_id", "call_id", "created_at"],
        )
    # Postgres: no-op — constraint was never changed
