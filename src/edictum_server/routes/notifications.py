"""Notification channel management endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.config import get_settings
from edictum_server.db.engine import get_db
from edictum_server.notifications.base import NotificationManager
from edictum_server.notifications.loader import load_db_channels
from edictum_server.schemas.notifications import (
    ChannelResponse,
    CreateChannelRequest,
    TestResult,
    UpdateChannelRequest,
)
from edictum_server.services import notification_service
from edictum_server.services.notification_service import get_channel_config

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/notifications/channels",
    tags=["notifications"],
)


def _get_secret() -> bytes | None:
    """Return the signing secret for config encryption, or None if not set."""
    try:
        return get_settings().get_signing_secret()
    except ValueError:
        return None


# Fields that contain secrets and must be masked per channel type.
# Any field NOT listed here is returned as-is (e.g. chat_id, url, from_address).
_SECRET_FIELDS: dict[str, set[str]] = {
    "telegram": {"bot_token", "webhook_secret"},
    "slack": {"webhook_url"},  # Slack webhook URLs are bearer-equivalent
    "slack_app": {"bot_token", "signing_secret"},
    "webhook": {"secret"},
    "email": {"smtp_password"},
    "discord": {"bot_token"},
}


def _mask_value(value: str) -> str:
    """Mask a secret value for display: prefix...suffix or just ***."""
    if not isinstance(value, str) or len(value) <= 8:
        return "••••••••"
    return f"{value[:4]}••••{value[-4:]}"


def _redact_config(channel_type: str, config: dict) -> dict:
    """Return a copy of config with secret fields masked."""
    secret_keys = _SECRET_FIELDS.get(channel_type, set())
    redacted: dict = {}
    for key, value in config.items():
        if key in secret_keys:
            redacted[key] = _mask_value(str(value)) if value else ""
        else:
            redacted[key] = value
    return redacted


def _to_response(ch, *, secret: bytes | None = None) -> ChannelResponse:  # noqa: ANN001
    """Map ORM model to response schema with redacted secrets."""
    config = get_channel_config(ch, secret) if secret else (ch.config or {})
    return ChannelResponse(
        id=ch.id,
        name=ch.name,
        channel_type=ch.channel_type,
        config=_redact_config(ch.channel_type, config),
        enabled=ch.enabled,
        filters=ch.filters,
        created_at=ch.created_at,
        last_test_at=ch.last_test_at,
        last_test_ok=ch.last_test_ok,
    )


async def _reload_manager(request: Request, db: AsyncSession) -> None:
    """Reload notification manager with fresh DB channels."""
    mgr: NotificationManager = request.app.state.notification_manager
    settings = get_settings()
    secret = _get_secret()
    channels_by_tenant = await load_db_channels(
        db, request.app.state.redis, settings.base_url, secret=secret,
    )
    await mgr.reload(channels_by_tenant)



@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ChannelResponse]:
    """List all notification channels for the authenticated tenant."""
    secret = _get_secret()
    channels = await notification_service.list_channels(db, auth.tenant_id)
    return [_to_response(ch, secret=secret) for ch in channels]


@router.post(
    "",
    response_model=ChannelResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_channel(
    body: CreateChannelRequest,
    request: Request,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    """Create a new notification channel."""
    secret = _get_secret()
    try:
        channel = await notification_service.create_channel(
            db,
            auth.tenant_id,
            name=body.name,
            channel_type=body.channel_type,
            config=body.config,
            filters=body.filters.model_dump() if body.filters else None,
            secret=secret,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    await db.commit()
    await db.refresh(channel)
    await _reload_manager(request, db)
    return _to_response(channel, secret=secret)


@router.put("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: uuid.UUID,
    body: UpdateChannelRequest,
    request: Request,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    """Update a notification channel."""
    secret = _get_secret()
    kwargs: dict = {}
    if body.name is not None:
        kwargs["name"] = body.name
    if body.config is not None:
        kwargs["config"] = body.config
    if body.enabled is not None:
        kwargs["enabled"] = body.enabled
    if "filters" in body.model_fields_set:
        kwargs["filters"] = body.filters.model_dump() if body.filters else None

    try:
        channel = await notification_service.update_channel(
            db, auth.tenant_id, channel_id, secret=secret, **kwargs
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found.",
        )
    await db.commit()
    await db.refresh(channel)
    await _reload_manager(request, db)
    return _to_response(channel, secret=secret)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: uuid.UUID,
    request: Request,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a notification channel."""
    deleted = await notification_service.delete_channel(db, auth.tenant_id, channel_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification channel not found.",
        )
    await db.commit()
    await _reload_manager(request, db)


@router.post("/{channel_id}/test", response_model=TestResult)
async def test_channel(
    channel_id: uuid.UUID,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> TestResult:
    """Send a test message through a notification channel."""
    secret = _get_secret()
    try:
        success, message = await notification_service.test_channel(
            db, auth.tenant_id, channel_id, secret=secret,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    await db.commit()
    return TestResult(success=success, message=message)
