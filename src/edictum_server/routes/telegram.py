"""Telegram webhook endpoint -- /api/v1/telegram/webhook."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.config import Settings, get_settings
from edictum_server.db.engine import get_db
from edictum_server.notifications.base import NotificationManager
from edictum_server.notifications.telegram import TelegramChannel
from edictum_server.push.manager import PushManager
from edictum_server.services import approval_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


def _get_telegram_channel(request: Request) -> TelegramChannel | None:
    """Extract the TelegramChannel from the notification manager, if present."""
    mgr: NotificationManager | None = getattr(
        request.app.state, "notification_manager", None,
    )
    if mgr is None:
        return None
    for ch in mgr.channels:
        if isinstance(ch, TelegramChannel):
            return ch
    return None


@router.post("/webhook")
async def webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Handle Telegram callback-query webhooks for approval decisions."""
    # Verify the secret token header
    secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not settings.telegram_webhook_secret or secret != settings.telegram_webhook_secret:
        return Response(status_code=403)

    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return Response(status_code=200)

    callback_query = body.get("callback_query")
    if callback_query is None:
        return Response(status_code=200)

    data: str = callback_query.get("data", "")
    if ":" not in data:
        return Response(status_code=200)

    action, approval_id_str = data.split(":", 1)
    if action not in ("approve", "deny"):
        return Response(status_code=200)

    approved = action == "approve"

    try:
        approval_id = uuid.UUID(approval_id_str)
    except ValueError:
        return Response(status_code=200)

    # Resolve tenant from Redis
    redis = request.app.state.redis
    tenant_id_str = await redis.get(f"telegram:tenant:{approval_id}")
    tg_channel = _get_telegram_channel(request)

    if tenant_id_str is None:
        if tg_channel is not None:
            try:
                await tg_channel.client.answer_callback_query(
                    callback_query["id"], "Approval expired or not found.",
                )
            except Exception:
                logger.exception("Failed to answer callback query")
        return Response(status_code=200)

    tenant_id = uuid.UUID(tenant_id_str)
    tg_user = callback_query.get("from", {})
    decided_by = f"telegram:{tg_user.get('username') or tg_user.get('id', 'unknown')}"

    # Submit decision via the service layer
    approval = await approval_service.submit_decision(
        db,
        tenant_id,
        approval_id,
        approved=approved,
        decided_by=decided_by,
    )
    if approval is None:
        if tg_channel is not None:
            try:
                await tg_channel.client.answer_callback_query(
                    callback_query["id"], "Already decided or not found.",
                )
            except Exception:
                logger.exception("Failed to answer callback query")
        return Response(status_code=200)

    await db.commit()

    # Push SSE event to agents
    push: PushManager = request.app.state.push_manager
    push.push_to_env(approval.env, {
        "type": "approval_decided",
        "approval_id": str(approval.id),
        "status": approval.status,
        "decided_by": decided_by,
    })

    # Update the Telegram message and answer callback
    if tg_channel is not None:
        try:
            tg_status = "approved" if approved else "denied"
            await tg_channel.update_decision(str(approval_id), tg_status, decided_by)
        except Exception:
            logger.exception("Failed to update Telegram message")
        try:
            result_text = "Approved \u2705" if approved else "Denied \u274c"
            await tg_channel.client.answer_callback_query(
                callback_query["id"], result_text,
            )
        except Exception:
            logger.exception("Failed to answer callback query")

    return Response(status_code=200)
