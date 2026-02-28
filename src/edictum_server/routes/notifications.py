"""Notification channel management endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.auth.dependencies import AuthContext, require_dashboard_auth
from edictum_server.db.engine import get_db
from edictum_server.schemas.notifications import (
    ChannelResponse,
    CreateChannelRequest,
    TestResult,
    UpdateChannelRequest,
)
from edictum_server.services import notification_service

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
        created_at=ch.created_at,
        last_test_at=ch.last_test_at,
        last_test_ok=ch.last_test_ok,
    )


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
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    await db.commit()
    await db.refresh(channel)
    return _to_response(channel)


@router.put("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: uuid.UUID,
    body: UpdateChannelRequest,
    auth: AuthContext = Depends(require_dashboard_auth),
    db: AsyncSession = Depends(get_db),
) -> ChannelResponse:
    """Update a notification channel."""
    try:
        channel = await notification_service.update_channel(
            db,
            auth.tenant_id,
            channel_id,
            name=body.name,
            config=body.config,
            enabled=body.enabled,
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
    return _to_response(channel)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: uuid.UUID,
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
