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
            "https://slack.com/api/auth.test",
            headers={"Authorization": f"Bearer {config['bot_token']}"},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            return False, f"Slack API error: {data.get('error', 'unknown')}"
        return True, f"Slack App connected as @{data.get('user', 'unknown')}."

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

    msg = EmailMessage()
    msg["Subject"] = "[Edictum] Test Notification"
    msg["From"] = config["from_address"]
    msg["To"] = ", ".join(config["to_addresses"])
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
