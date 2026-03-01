"""Discord interactions endpoint — /api/v1/discord/interactions."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.engine import get_db
from edictum_server.db.models import NotificationChannel as ChannelModel
from edictum_server.notifications.base import NotificationManager
from edictum_server.push.manager import PushManager
from edictum_server.services import approval_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/discord", tags=["discord"])


def verify_discord_signature(
    public_key_hex: str,
    timestamp: str,
    body: bytes,
    signature_hex: str,
) -> bool:
    """Verify Discord Ed25519 signature. Returns True if valid."""
    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        message = timestamp.encode() + body
        verify_key.verify(message, bytes.fromhex(signature_hex))
        return True
    except (BadSignatureError, ValueError):
        return False


@router.post("/interactions")
async def discord_interaction(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Handle Discord interactions: PING handshake and component button clicks."""
    body = await request.body()
    signature = request.headers.get("x-signature-ed25519")
    timestamp = request.headers.get("x-signature-timestamp")
    if not signature or not timestamp:
        return Response(status_code=401)

    # Find matching Discord channel by trying each channel's public key
    result = await db.execute(
        select(ChannelModel).where(
            ChannelModel.channel_type == "discord",
            ChannelModel.enabled == True,  # noqa: E712
        )
    )
    db_channels = result.scalars().all()

    matched_channel: ChannelModel | None = None
    for ch in db_channels:
        public_key = ch.config.get("public_key", "")
        if verify_discord_signature(public_key, timestamp, body, signature):
            matched_channel = ch
            break

    if matched_channel is None:
        return Response(status_code=401)

    try:
        body_json: dict = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return Response(status_code=400)

    interaction_type = body_json.get("type")

    # PING — Discord endpoint validation handshake
    if interaction_type == 1:
        return JSONResponse({"type": 1})

    # MESSAGE_COMPONENT — button click
    if interaction_type == 3:
        return await _handle_component(request, db, body_json, matched_channel)

    # Unknown type — safe fallback
    return JSONResponse({"type": 1})


async def _handle_component(
    request: Request,
    db: AsyncSession,
    body_json: dict,
    db_channel: ChannelModel,
) -> Response:
    """Process a Discord component interaction (button click)."""
    channel_id = str(db_channel.id)
    custom_id: str = (body_json.get("data") or {}).get("custom_id", "")

    if ":" not in custom_id:
        return JSONResponse({"type": 1})

    action, approval_id_str = custom_id.split(":", 1)
    if action not in ("edictum_approve", "edictum_deny"):
        return JSONResponse({"type": 1})

    try:
        approval_id = uuid.UUID(approval_id_str)
    except ValueError:
        return JSONResponse({"type": 1})

    redis = request.app.state.redis
    tenant_id_str = await redis.get(f"discord:tenant:{channel_id}:{approval_id}")

    # Expired: Redis key gone — show expired embed, no decision submitted
    if tenant_id_str is None:
        return JSONResponse({
            "type": 7,
            "data": {
                "embeds": [{"title": "Approval Expired", "color": 0x99AAB5}],
                "components": [],
            },
        })

    tenant_id = uuid.UUID(tenant_id_str)
    member = body_json.get("member") or {}
    user = member.get("user") or body_json.get("user") or {}
    username: str = user.get("username", "unknown")
    decided_by = f"discord:{username}"

    approval = await approval_service.submit_decision(
        db,
        tenant_id,
        approval_id,
        approved=(action == "edictum_approve"),
        decided_by=decided_by,
        decided_via="discord",
    )

    if approval is None:
        return JSONResponse({
            "type": 7,
            "data": {
                "embeds": [{"title": "Already Decided", "color": 0x99AAB5}],
                "components": [],
            },
        })

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

    # Notify other channels (background — Discord message updated via type 7 response)
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

    # Type 7 = UPDATE_MESSAGE: update original embed, remove buttons
    color = 0x57F287 if approval.status == "approved" else 0xED4245
    label = "Approved \u2705" if approval.status == "approved" else "Denied \u274c"
    return JSONResponse({
        "type": 7,
        "data": {
            "embeds": [
                {
                    "title": f"Approval {approval.status.capitalize()}",
                    "description": (
                        f"**Decision:** {label}\n**Decided by:** {decided_by}"
                    ),
                    "color": color,
                }
            ],
            "components": [],
        },
    })
