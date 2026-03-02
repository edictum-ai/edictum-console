"""SQLAlchemy ORM models for edictum-console."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, LargeBinary, String, UniqueConstraint
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
    """Configuration for a notification channel (e.g. Telegram, Slack)."""

    __tablename__ = "notification_channels"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    channel_type: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_test_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)
