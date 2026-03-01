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

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/notifications/channels",
    tags=["notifications"],
)


def _to_response(ch) -> ChannelResponse:  # noqa: ANN001
    """Map ORM model to response schema."""
    return ChannelResponse(
        id=ch.id,
        name=ch.name,
        channel_type=ch.channel_type,
        config=ch.config,
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
    channels_by_tenant = await load_db_channels(
        db, request.app.state.redis, settings.base_url
    )
    await mgr.reload(channels_by_tenant)


async def _register_telegram_webhook(
    request: Request, channel_id: str
) -> None:
    """Find the just-loaded Telegram channel and register its webhook."""
    from edictum_server.notifications.telegram import TelegramChannel

    mgr: NotificationManager = request.app.state.notification_manager
    settings = get_settings()
    for ch in mgr.channels:
        if isinstance(ch, TelegramChannel) and ch.channel_id == channel_id:
            try:
                await ch.register_webhook(settings.base_url)
            except Exception:
                logger.exception(
                    "Failed to register Telegram webhook for %s", channel_id
                )
            break


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> list[ChannelResponse]:
    """List all notification channels for the authenticated tenant."""
    channels = await notification_service.list_channels(db, auth.tenant_id)
    return [_to_response(ch) for ch in channels]


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
    try:
        channel = await notification_service.create_channel(
            db,
            auth.tenant_id,
            name=body.name,
            channel_type=body.channel_type,
            config=body.config,
            filters=body.filters.model_dump() if body.filters else None,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    await db.commit()
    await db.refresh(channel)
    await _reload_manager(request, db)

    # Register Telegram webhook for new channel
    if body.channel_type == "telegram":
        await _register_telegram_webhook(request, str(channel.id))

    return _to_response(channel)


@router.put("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: uuid.UUID,
    body: UpdateChannelRequest,
    request: Request,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    """Update a notification channel."""
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
            db, auth.tenant_id, channel_id, **kwargs
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
    return _to_response(channel)


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
    try:
        success, message = await notification_service.test_channel(
            db, auth.tenant_id, channel_id
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    await db.commit()
    return TestResult(success=success, message=message)
