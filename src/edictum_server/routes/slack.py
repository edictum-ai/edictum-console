"""Slack App interaction endpoint -- /api/v1/slack/interactions and /manifest."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.config import get_settings
from edictum_server.db.engine import get_db
from edictum_server.db.models import NotificationChannel as ChannelModel
from edictum_server.notifications.base import NotificationManager
from edictum_server.push.manager import PushManager
from edictum_server.services import approval_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/slack", tags=["slack"])


def _verify_slack_signature(
    signing_secret: str,
    timestamp: str,
    body: bytes,
    signature: str,
) -> bool:
    sig_basestring = f"v0:{timestamp}:{body.decode()}"
    expected = "v0=" + hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/interactions")
async def slack_interaction(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Handle Slack interactive component payloads (button clicks)."""
    body = await request.body()

    timestamp = request.headers.get("x-slack-request-timestamp")
    signature = request.headers.get("x-slack-signature")
    if not timestamp or not signature:
        return Response(status_code=403)

    try:
        ts_int = int(timestamp)
    except ValueError:
        return Response(status_code=403)

    if abs(time.time() - ts_int) > 300:
        return Response(status_code=403)

    # Find matching slack_app channel by signing secret
    result = await db.execute(
        select(ChannelModel).where(
            ChannelModel.channel_type == "slack_app",
            ChannelModel.enabled == True,  # noqa: E712
        )
    )
    db_channels = list(result.scalars())

    matched_channel = None
    for ch in db_channels:
        secret = ch.config.get("signing_secret", "")
        if secret and _verify_slack_signature(secret, timestamp, body, signature):
            matched_channel = ch
            break

    if matched_channel is None:
        return Response(status_code=403)

    # Parse payload
    try:
        parsed = parse_qs(body.decode())
        payload = json.loads(parsed["payload"][0])
    except (KeyError, json.JSONDecodeError, UnicodeDecodeError):
        return Response(status_code=200)

    actions = payload.get("actions", [])
    if not actions:
        return Response(status_code=200)

    action = actions[0]
    action_id: str = action.get("action_id", "")
    if not action_id.startswith("edictum_"):
        return Response(status_code=200)

    # Parse action and approval_id
    try:
        _, rest = action_id.split("_", 1)
        decision, approval_id_str = rest.split(":", 1)
    except ValueError:
        return Response(status_code=200)

    if decision not in ("approve", "deny"):
        return Response(status_code=200)

    try:
        approval_id = uuid.UUID(approval_id_str)
    except ValueError:
        return Response(status_code=200)

    channel_id = str(matched_channel.id)

    # Look up tenant from Redis
    redis = request.app.state.redis
    tenant_id_raw = await redis.get(f"slack:tenant:{channel_id}:{approval_id}")
    if tenant_id_raw is None:
        return JSONResponse(
            {
                "replace_original": True,
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "\u23f0 *Approval expired or already handled.*",
                        },
                    }
                ],
            }
        )

    tenant_id = uuid.UUID(tenant_id_raw)
    username = payload.get("user", {}).get("username", "unknown")
    decided_by = f"slack:{username}"

    approval = await approval_service.submit_decision(
        db,
        tenant_id,
        approval_id,
        approved=(decision == "approve"),
        decided_by=decided_by,
        decided_via="slack",
    )

    if approval is None:
        return JSONResponse(
            {
                "replace_original": True,
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "\u26a0\ufe0f Already decided or not found.",
                        },
                    }
                ],
            }
        )

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

    emoji = "\u2705" if decision == "approve" else "\u274c"
    result_text = f"{emoji} *{approval.status.upper()}* by {decided_by}"
    title = f"Approval {approval.status.capitalize()}"
    return JSONResponse(
        {
            "replace_original": True,
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": title},
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": result_text},
                },
            ],
        }
    )


@router.get("/manifest")
async def slack_manifest(request: Request) -> JSONResponse:
    """Return the Slack App manifest with the interactivity URL pre-filled.

    No auth required — the manifest contains no secrets.
    """
    settings = get_settings()
    base_url = settings.base_url.rstrip("/") or str(request.base_url).rstrip("/")
    manifest = {
        "_metadata": {"major_version": 2, "minor_version": 1},
        "display_information": {
            "name": "Edictum Approvals",
            "description": "Interactive approval buttons for Edictum agent governance.",
            "background_color": "#1a1a2e",
        },
        "features": {
            "bot_user": {"display_name": "edictum", "always_online": True},
        },
        "oauth_config": {
            "scopes": {"bot": ["chat:write"]},
        },
        "settings": {
            "interactivity": {
                "is_enabled": True,
                "request_url": f"{base_url}/api/v1/slack/interactions",
            },
        },
    }
    return JSONResponse(manifest)
