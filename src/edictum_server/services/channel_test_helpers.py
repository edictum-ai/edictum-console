"""HTTP and email channel test helpers, extracted from notification_service."""

from __future__ import annotations

import httpx


async def test_http_channel(
    client: httpx.AsyncClient,
    channel_type: str,
    config: dict,  # noqa: ANN001
) -> tuple[bool, str]:
    """Test HTTP-based channels (telegram, slack, slack_app, webhook)."""
    if channel_type == "telegram":
        resp = await client.post(
            f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
            json={
                "chat_id": config["chat_id"],
                "text": "Edictum test notification — channel is working.",
            },
        )
        resp.raise_for_status()
        return True, "Telegram message sent successfully."

    if channel_type == "slack":
        resp = await client.post(
            config["webhook_url"],
            json={"text": "Edictum test notification — channel is working."},
        )
        resp.raise_for_status()
        return True, "Slack message sent successfully."

    if channel_type == "slack_app":
        resp = await client.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {config['bot_token']}"},
            json={
                "channel": config["slack_channel"],
                "text": "Edictum test notification — Slack App channel is working.",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            error = data.get("error", "unknown")
            needed = data.get("needed")
            if needed:
                return False, f"Slack API error: {error} (add '{needed}' scope in OAuth & Permissions, then reinstall the app)"
            return False, f"Slack API error: {error}"
        return True, "Slack App message sent successfully."

    if channel_type == "discord":
        resp = await client.post(
            f"https://discord.com/api/v10/channels/{config['discord_channel_id']}/messages",
            headers={"Authorization": f"Bot {config['bot_token']}"},
            json={"content": "Edictum test notification — Discord channel is working."},
        )
        resp.raise_for_status()
        return True, "Discord message sent successfully."

    if channel_type == "webhook":
        resp = await client.post(
            config["url"],
            json={
                "event": "test",
                "message": "Edictum test notification — channel is working.",
            },
        )
        resp.raise_for_status()
        return True, "Webhook delivered successfully."

    return False, f"Unknown channel type: {channel_type}"


async def test_email(config: dict) -> tuple[bool, str]:  # noqa: ANN001
    """Test email channel via aiosmtplib."""
    from email.message import EmailMessage

    import aiosmtplib

    raw_to = config["to_addresses"]
    to_list = (
        [a.strip() for a in raw_to.split(",") if a.strip()]
        if isinstance(raw_to, str)
        else list(raw_to)
    )

    msg = EmailMessage()
    msg["Subject"] = "[Edictum] Test Notification"
    msg["From"] = config["from_address"]
    msg["To"] = ", ".join(to_list)
    msg.set_content("Edictum test notification — email channel is working.")

    await aiosmtplib.send(
        msg,
        hostname=config["smtp_host"],
        port=int(config["smtp_port"]),
        username=config["smtp_user"],
        password=config["smtp_password"],
        start_tls=True,
    )
    return True, "Email sent successfully."
