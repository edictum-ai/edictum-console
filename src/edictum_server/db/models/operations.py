"""Runtime aggregate — Event and Approval models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Event(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Audit event from an agent tool call evaluation."""

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "call_id",
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
