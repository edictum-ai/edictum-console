"""Telegram webhook endpoints -- /api/v1/telegram/webhook/{channel_id}."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.engine import get_db
from edictum_server.db.models import NotificationChannel as ChannelModel
from edictum_server.notifications.base import NotificationManager
from edictum_server.notifications.telegram import TelegramChannel
from edictum_server.push.manager import PushManager
from edictum_server.services import approval_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


def _find_telegram_channel(
    mgr: NotificationManager, channel_id: str
) -> TelegramChannel | None:
    """Find a TelegramChannel in the manager by its channel_id."""
    for ch in mgr.channels:
        if isinstance(ch, TelegramChannel) and ch.channel_id == channel_id:
            return ch
    return None


async def _process_callback(
    request: Request,
    db: AsyncSession,
    callback_query: dict,
    tg_channel: TelegramChannel,
    channel_id: str,
) -> Response:
    """Shared logic for processing a Telegram callback query."""
    data: str = callback_query.get("data", "")
    if ":" not in data:
        return Response(status_code=200)

    action, approval_id_str = data.split(":", 1)
    if action not in ("approve", "deny"):
        return Response(status_code=200)

    try:
        approval_id = uuid.UUID(approval_id_str)
    except ValueError:
        return Response(status_code=200)

    # Resolve tenant from Redis (namespaced by channel_id)
    redis = request.app.state.redis
    tenant_id_str = await redis.get(
        f"telegram:tenant:{channel_id}:{approval_id}"
    )

    if tenant_id_str is None:
        try:
            await tg_channel.client.answer_callback_query(
                callback_query["id"],
                "Approval expired or not found.",
            )
        except Exception:
            logger.exception("Failed to answer callback query")
        return Response(status_code=200)

    tenant_id = uuid.UUID(tenant_id_str)
    tg_user = callback_query.get("from", {})
    decided_by = (
        f"telegram:{tg_user.get('username') or tg_user.get('id', 'unknown')}"
    )

    approval = await approval_service.submit_decision(
        db,
        tenant_id,
        approval_id,
        approved=(action == "approve"),
        decided_by=decided_by,
        decided_via="telegram",
    )
    if approval is None:
        try:
            await tg_channel.client.answer_callback_query(
                callback_query["id"],
                "Already decided or not found.",
            )
        except Exception:
            logger.exception("Failed to answer callback query")
        return Response(status_code=200)

    await db.commit()

    # Push SSE events
    push: PushManager = request.app.state.push_manager
    decided_data = {
        "type": "approval_decided",
        "approval_id": str(approval.id),
        "status": approval.status,
        "decided_by": decided_by,
    }
    push.push_to_env(approval.env, decided_data, tenant_id=tenant_id)
    push.push_to_dashboard(tenant_id, decided_data)

    # Notify other channels
    notification_mgr: NotificationManager = request.app.state.notification_manager
    asyncio.create_task(
        notification_mgr.notify_approval_decided(
            approval_id=str(approval.id),
            status=approval.status,
            decided_by=decided_by,
            reason=None,
            tenant_id=str(tenant_id),
        )
    )

    # Update the Telegram message and answer callback
    try:
        tg_status = "approved" if action == "approve" else "denied"
        await tg_channel.update_decision(str(approval_id), tg_status, decided_by)
    except Exception:
        logger.exception("Failed to update Telegram message")
    try:
        result_text = "Approved \u2705" if action == "approve" else "Denied \u274c"
        await tg_channel.client.answer_callback_query(
            callback_query["id"], result_text
        )
    except Exception:
        logger.exception("Failed to answer callback query")

    return Response(status_code=200)


@router.post("/webhook/{channel_id}")
async def db_channel_webhook(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Handle Telegram callback webhooks for DB-configured channels."""
    # Look up the channel in DB
    try:
        ch_uuid = uuid.UUID(channel_id)
    except ValueError:
        return Response(status_code=404)

    result = await db.execute(
        select(ChannelModel).where(
            ChannelModel.id == ch_uuid,
            ChannelModel.channel_type == "telegram",
            ChannelModel.enabled == True,  # noqa: E712
        )
    )
    db_channel = result.scalar_one_or_none()
    if db_channel is None:
        return Response(status_code=404)

    # Validate the secret token header
    expected_secret = db_channel.config.get("webhook_secret", "")
    actual_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not expected_secret or actual_secret != expected_secret:
        return Response(status_code=403)

    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return Response(status_code=200)

    callback_query = body.get("callback_query")
    if callback_query is None:
        return Response(status_code=200)

    # Find the live TelegramChannel instance in the manager.
    # Normalize UUID to lowercase to match str(row.id) used in the loader.
    normalized_id = str(ch_uuid)
    mgr: NotificationManager = request.app.state.notification_manager
    tg_channel = _find_telegram_channel(mgr, normalized_id)
    if tg_channel is None:
        return Response(status_code=200)

    return await _process_callback(
        request, db, callback_query, tg_channel, normalized_id
    )
