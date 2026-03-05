"""Fix event dedup constraint — no-op for partitioned tables.

The original intent was to remove ``created_at`` from the unique constraint
so that ``(tenant_id, call_id)`` alone prevents duplicate events.  However,
PostgreSQL requires all partition key columns in unique constraints on
partitioned tables.  Since ``events`` is partitioned by ``created_at``, we
cannot exclude it from the constraint.

Deduplication is enforced at the application layer instead (upsert with
ON CONFLICT on the full constraint including created_at).

Revision ID: 007
Revises: 006
Create Date: 2026-03-05
"""

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: partitioned table constraint must include created_at.
    # Dedup handled at application layer.
    pass


def downgrade() -> None:
    pass
