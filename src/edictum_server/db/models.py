"""SQLAlchemy ORM models for edictum-console."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A customer organisation."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String, unique=True)
    external_auth_id: Mapped[str | None] = mapped_column(
        String,
        unique=True,
        nullable=True,
        index=True,
    )

    # Relationships
    api_keys: Mapped[list[ApiKey]] = relationship(back_populates="tenant")
    signing_keys: Mapped[list[SigningKey]] = relationship(back_populates="tenant")
    bundles: Mapped[list[Bundle]] = relationship(back_populates="tenant")
    deployments: Mapped[list[Deployment]] = relationship(back_populates="tenant")
    users: Mapped[list[User]] = relationship(back_populates="tenant")


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A local user account."""

    __tablename__ = "users"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(default=False)

    tenant: Mapped[Tenant] = relationship(back_populates="users")


class ApiKey(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Hashed API key for agent authentication."""

    __tablename__ = "api_keys"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    key_prefix: Mapped[str] = mapped_column(String(32), index=True)
    key_hash: Mapped[str] = mapped_column(String)
    env: Mapped[str] = mapped_column(String)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    tenant: Mapped[Tenant] = relationship(back_populates="api_keys")


class SigningKey(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Ed25519 key pair for bundle signing."""

    __tablename__ = "signing_keys"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    private_key_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    active: Mapped[bool] = mapped_column(default=True)

    tenant: Mapped[Tenant] = relationship(back_populates="signing_keys")


class Bundle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A versioned contract bundle."""

    __tablename__ = "bundles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "version", name="uq_bundle_tenant_name_version"),
        ForeignKeyConstraint(
            ["tenant_id", "composition_id"],
            ["bundle_compositions.tenant_id", "bundle_compositions.id"],
            ondelete="SET NULL",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String, index=True)
    version: Mapped[int]
    revision_hash: Mapped[str] = mapped_column(String(64), index=True)
    yaml_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    signature: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    source_hub_slug: Mapped[str | None] = mapped_column(String, nullable=True)
    source_hub_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String)
    composition_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    composition_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="bundles")


class Deployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Record of a bundle version being deployed to an environment."""

    __tablename__ = "deployments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    env: Mapped[str] = mapped_column(String)
    bundle_name: Mapped[str] = mapped_column(String, index=True)
    bundle_version: Mapped[int]
    deployed_by: Mapped[str] = mapped_column(String)

    tenant: Mapped[Tenant] = relationship(back_populates="deployments")


class Event(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Audit event from an agent tool call evaluation."""

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "call_id",
            "created_at",
            name="uq_event_tenant_call",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    call_id: Mapped[str] = mapped_column(String)
    agent_id: Mapped[str] = mapped_column(String)
    tool_name: Mapped[str] = mapped_column(String)
    verdict: Mapped[str] = mapped_column(String)
    mode: Mapped[str] = mapped_column(String)
    env: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)


class Approval(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """HITL approval request for a tool call requiring human authorization."""

    __tablename__ = "approvals"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    agent_id: Mapped[str] = mapped_column(String)
    tool_name: Mapped[str] = mapped_column(String)
    tool_args: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    message: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    env: Mapped[str] = mapped_column(String, default="production")
    timeout_seconds: Mapped[int] = mapped_column(default=300)
    timeout_effect: Mapped[str] = mapped_column(String, default="deny")
    decision_source: Mapped[str | None] = mapped_column(String, nullable=True)
    contract_name: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    decision_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_via: Mapped[str | None] = mapped_column(String, nullable=True)


class NotificationChannel(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Configuration for a notification channel (e.g. Telegram, Slack).

    The ``config`` dict is encrypted at rest in ``config_encrypted`` using
    NaCl SecretBox (same pattern as ``SigningKey.private_key_encrypted``
    and ``TenantAiConfig.api_key_encrypted``).

    After migration 006, new rows store secrets in ``config_encrypted``
    only; the ``config`` JSON column is NULL.  Pre-migration rows may
    still have plain-text config until the migration runs.

    Encryption/decryption is handled by the service layer — see
    ``notification_service.encrypt_config()`` / ``decrypt_config()``.
    """

    __tablename__ = "notification_channels"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    channel_type: Mapped[str] = mapped_column(String)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    config_encrypted: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_test_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Contract(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single reusable governance rule in the contract library."""
    __tablename__ = "contracts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "contract_id", "version", name="uq_contract_tenant_id_version"),
        UniqueConstraint("tenant_id", "id", name="uq_contract_tenant_pk"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    contract_id: Mapped[str] = mapped_column(String, index=True)
    version: Mapped[int]
    type: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    definition: Mapped[dict] = mapped_column(JSON)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String)


class BundleComposition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Defines which contracts compose a bundle, with mode and ordering."""
    __tablename__ = "bundle_compositions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_composition_tenant_name"),
        UniqueConstraint("tenant_id", "id", name="uq_composition_tenant_pk"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    defaults_mode: Mapped[str] = mapped_column(String, default="enforce")
    update_strategy: Mapped[str] = mapped_column(String, default="manual")
    tools_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    observability: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BundleCompositionItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Join table: contract membership within a bundle composition."""
    __tablename__ = "bundle_composition_items"
    __table_args__ = (
        UniqueConstraint("composition_id", "contract_id", name="uq_item_composition_contract"),
        ForeignKeyConstraint(
            ["tenant_id", "composition_id"],
            ["bundle_compositions.tenant_id", "bundle_compositions.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "contract_id"],
            ["contracts.tenant_id", "contracts.id"],
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    composition_id: Mapped[uuid.UUID] = mapped_column()
    contract_id: Mapped[uuid.UUID] = mapped_column()
    position: Mapped[int]
    mode_override: Mapped[str | None] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class AgentRegistration(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Persistent agent identity — auto-created on first SSE connect."""
    __tablename__ = "agent_registrations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "agent_id", name="uq_agent_reg_tenant_agent"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[dict] = mapped_column(JSON, default=dict)
    bundle_name: Mapped[str | None] = mapped_column(String, nullable=True)
    manifest: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssignmentRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Pattern-based bundle assignment rule — lower priority = evaluated first."""
    __tablename__ = "assignment_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "priority", name="uq_assignment_rule_tenant_priority"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), index=True)
    priority: Mapped[int] = mapped_column(Integer)
    pattern: Mapped[str] = mapped_column(String)
    tag_match: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    bundle_name: Mapped[str] = mapped_column(String)
    env: Mapped[str] = mapped_column(String)


class TenantAiConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Per-tenant AI provider configuration for the contract assistant."""
    __tablename__ = "tenant_ai_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), unique=True)
    provider: Mapped[str] = mapped_column(String)
    api_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[str] = mapped_column(String)


class AiUsageLog(UUIDPrimaryKeyMixin, Base):
    """Tracks AI token usage and estimated costs per request."""
    __tablename__ = "ai_usage_logs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), index=True)
    provider: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    total_tokens: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    request_type: Mapped[str] = mapped_column(String, default="assist")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
