"""Fix event dedup constraint — remove created_at.

The original constraint included ``created_at`` which is auto-generated
by ``TimestampMixin`` (server_default=func.now()), so every insert got a
unique timestamp and dedup never fired.  Drop the old constraint and
recreate with just ``tenant_id`` + ``call_id``.

Revision ID: 007
Revises: 006
Create Date: 2026-03-05
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
    op.create_unique_constraint("uq_event_tenant_call", "events", ["tenant_id", "call_id"])


def downgrade() -> None:
    op.drop_constraint("uq_event_tenant_call", "events", type_="unique")
    op.create_unique_constraint(
        "uq_event_tenant_call", "events", ["tenant_id", "call_id", "created_at"]
    )
