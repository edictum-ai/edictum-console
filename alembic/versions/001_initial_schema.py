"""Initial schema — all tables for edictum-console.

Revision ID: 001
Revises:
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- tenants ---------------------------------------------------------------
    op.create_table(
        "tenants",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("external_auth_id", sa.String(), nullable=True, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_tenants_external_auth_id", "tenants", ["external_auth_id"])

    # -- users -----------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # -- api_keys --------------------------------------------------------------
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("key_prefix", sa.String(32), nullable=False, index=True),
        sa.Column("key_hash", sa.String(), nullable=False),
        sa.Column("env", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # -- signing_keys ----------------------------------------------------------
    op.create_table(
        "signing_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("private_key_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # -- bundles ---------------------------------------------------------------
    op.create_table(
        "bundles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("revision_hash", sa.String(64), nullable=False),
        sa.Column("yaml_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("signature", sa.LargeBinary(), nullable=True),
        sa.Column("source_hub_slug", sa.String(), nullable=True),
        sa.Column("source_hub_revision", sa.String(), nullable=True),
        sa.Column("uploaded_by", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("tenant_id", "name", "version", name="uq_bundle_tenant_name_version"),
    )
    op.create_index("ix_bundles_name", "bundles", ["name"])
    op.create_index("ix_bundles_revision_hash", "bundles", ["revision_hash"])

    # -- deployments -----------------------------------------------------------
    op.create_table(
        "deployments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("env", sa.String(), nullable=False),
        sa.Column("bundle_name", sa.String(), nullable=False),
        sa.Column("bundle_version", sa.Integer(), nullable=False),
        sa.Column("deployed_by", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_deployments_bundle_name", "deployments", ["bundle_name"])

    # -- events (partitioned by month) -----------------------------------------
    op.execute(
        """
        CREATE TABLE events (
            id              UUID            NOT NULL,
            tenant_id       UUID            NOT NULL REFERENCES tenants(id),
            call_id         VARCHAR         NOT NULL,
            agent_id        VARCHAR         NOT NULL,
            tool_name       VARCHAR         NOT NULL,
            verdict         VARCHAR         NOT NULL,
            mode            VARCHAR         NOT NULL,
            timestamp       TIMESTAMPTZ     NOT NULL,
            payload         JSONB,
            created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
            PRIMARY KEY (id, created_at),
            CONSTRAINT uq_event_tenant_call UNIQUE (tenant_id, call_id, created_at)
        ) PARTITION BY RANGE (created_at)
        """
    )

    # -- approvals -------------------------------------------------------------
    op.create_table(
        "approvals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("tool_name", sa.String(), nullable=False),
        sa.Column("tool_args", sa.JSON(), nullable=True),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("env", sa.String(), nullable=False, server_default="production"),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("timeout_effect", sa.String(), nullable=False, server_default="deny"),
        sa.Column("decision_source", sa.String(), nullable=True),
        sa.Column("contract_name", sa.String(), nullable=True),
        sa.Column("decided_by", sa.String(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_reason", sa.String(), nullable=True),
        sa.Column("decided_via", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_approvals_tenant_id", "approvals", ["tenant_id"])
    op.create_index("ix_approvals_status", "approvals", ["status"])

    # -- notification_channels -------------------------------------------------
    op.create_table(
        "notification_channels",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("channel_type", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_notification_channels_tenant_id", "notification_channels", ["tenant_id"]
    )

    # -- Auto-partition helpers ------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION create_event_partition_if_needed(ts timestamptz)
        RETURNS void LANGUAGE plpgsql AS $$
        DECLARE
            partition_name text;
            start_date     date;
            end_date       date;
        BEGIN
            start_date     := date_trunc('month', ts)::date;
            end_date       := (date_trunc('month', ts) + interval '1 month')::date;
            partition_name := 'events_' || to_char(ts, 'YYYY_MM');
            IF EXISTS (
                SELECT 1 FROM pg_class WHERE relname = partition_name AND relkind = 'r'
            ) THEN RETURN; END IF;
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION ensure_event_partitions(months_ahead int DEFAULT 3)
        RETURNS void LANGUAGE plpgsql AS $$
        DECLARE i int;
        BEGIN
            FOR i IN 0..months_ahead LOOP
                PERFORM create_event_partition_if_needed(
                    date_trunc('month', now()) + (i || ' months')::interval
                );
            END LOOP;
        END;
        $$
        """
    )
    op.execute("SELECT ensure_event_partitions(6)")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS ensure_event_partitions(int)")
    op.execute("DROP FUNCTION IF EXISTS create_event_partition_if_needed(timestamptz)")
    op.drop_index("ix_notification_channels_tenant_id", table_name="notification_channels")
    op.drop_table("notification_channels")
    op.drop_index("ix_approvals_status", table_name="approvals")
    op.drop_index("ix_approvals_tenant_id", table_name="approvals")
    op.drop_table("approvals")
    op.execute("DROP TABLE IF EXISTS events CASCADE")
    op.drop_index("ix_deployments_bundle_name", table_name="deployments")
    op.drop_table("deployments")
    op.drop_index("ix_bundles_revision_hash", table_name="bundles")
    op.drop_index("ix_bundles_name", table_name="bundles")
    op.drop_table("bundles")
    op.drop_table("signing_keys")
    op.drop_table("api_keys")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_tenants_external_auth_id", table_name="tenants")
    op.drop_table("tenants")
