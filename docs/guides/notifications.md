# Set Up Notifications

Configure alerts and approval requests via Slack, Telegram, Discord, or webhooks.

## Overview

Notification channels let you:

- Receive alerts when agents are denied
- Get approval requests for sensitive actions
- Respond to approvals directly from chat

## Supported Channels

| Channel | Alerts | Approvals | Interactive |
|---------|--------|-----------|-------------|
| Telegram | ✅ | ✅ | ✅ (buttons) |
| Slack | ✅ | ✅ | ✅ (buttons) |
| Discord | ✅ | ✅ | ✅ (buttons) |
| Webhook | ✅ | ❌ | ❌ |
| Email | ✅ | ❌ | ❌ |

## Telegram Setup

### 1. Create a Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Follow the prompts to name your bot
4. Save the bot token: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. Get Chat ID

```bash
# Add bot to group/channel or start a direct chat
# Then visit:
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates

# Send a message, then refresh the URL
# Look for "chat":{"id": -1001234567890}
```

### 3. Configure in Console

1. Navigate to **Settings** → **Notifications**
2. Click **Add Channel**
3. Select **Telegram**
4. Enter:
   - Name: "Team Alerts"
   - Bot Token: `123456789:ABCdef...`
   - Chat ID: `-1001234567890`
5. Click **Test** to verify
6. Save

### 4. Webhook (Required for Interactive Approvals)

Console automatically registers the webhook when you save:

```
https://console.example.com/api/v1/telegram/webhook/{channel_id}
```

Ensure `EDICTUM_BASE_URL` is configured correctly.

## Slack Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From manifest**
4. Use the manifest below:

```json
{
  "display_information": {
    "name": "Edictum Console"
  },
  "features": {
    "bot_user": {
      "display_name": "Edictum",
      "always_online": true
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": ["chat:write", "im:history", "incoming-webhook"]
    }
  },
  "settings": {
    "interactivity": {
      "is_enabled": true
    }
  }
}
```

### 2. Install to Workspace

1. Click **Install to Workspace**
2. Authorize the app
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 3. Configure in Console

1. Navigate to **Settings** → **Notifications**
2. Click **Add Channel**
3. Select **Slack**
4. Enter:
   - Name: "Engineering Slack"
   - Webhook URL: Your webhook URL
   - (Optional) Bot Token for interactive
5. Test and save

## Discord Setup

### 1. Create a Webhook

1. Open your Discord server
2. Go to channel settings → **Integrations** → **Webhooks**
3. Click **Create Webhook**
4. Name it "Edictum Console"
5. Copy the webhook URL

### 2. Configure in Console

1. Navigate to **Settings** → **Notifications**
2. Click **Add Channel**
3. Select **Discord**
4. Enter:
   - Name: "Discord Alerts"
   - Webhook URL: `https://discord.com/api/webhooks/...`
5. Test and save

## Webhook Setup

For custom integrations:

```json
POST /api/v1/notifications/channels
{
    "name": "Custom Webhook",
    "channel_type": "webhook",
    "config": {
        "url": "https://your-server.com/edictum-webhook"
    }
}
```

Payload format:

```json
{
    "event": "tool_denied",
    "timestamp": "2026-03-01T12:00:00Z",
    "tenant_id": "uuid",
    "agent_id": "agent-1",
    "tool_name": "delete_file",
    "args": {"path": "/production/data.db"},
    "reason": "Contract: protect-production-db"
}
```

## Routing Filters

Send only specific events to each channel:

```json
{
    "name": "Critical Only",
    "channel_type": "slack",
    "config": {...},
    "filters": {
        "environments": ["production"],
        "agent_patterns": ["prod-*"],
        "contract_names": ["critical-*"]
    }
}
```

## Testing Channels

```bash
# Via API
POST /api/v1/notifications/channels/{id}/test

# Via Dashboard
# Click "Test" button on channel card
```

Test sends a sample notification:

```
🔔 Test Notification
This is a test from Edictum Console.
If you see this, the channel is working!
```

## Security

### SSRF Protection

Webhook URLs are validated to prevent SSRF attacks:

- Only HTTP/HTTPS schemes allowed
- Internal IPs blocked (10.x, 172.16-31.x, 192.168.x, 127.x)
- Cloud metadata blocked (169.254.x.x)
- DNS resolution checked before allowing

If you need to use internal webhooks:

```bash
# ONLY for development/internal networks
EDICTUM_ALLOW_LOCALHOST_WEBHOOKS=true
```

### Webhook Secrets

Each Telegram channel generates a random `webhook_secret`:

```python
# Webhook verification
if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != channel.config.get("webhook_secret"):
    raise HTTPException(401)
```

Verify webhooks come from Edictum Console, not attackers.

## Rate Limiting

Notification channels respect rate limits:

- Max 1 notification per second per channel
- Burst of 5 allowed
- Queue for overflow (not dropped)

## Troubleshooting

### Telegram Bot Not Responding

1. Check bot token is correct
2. Verify chat ID (negative for groups)
3. Ensure bot is added to group
4. Check webhook is registered

### Slack Buttons Not Working

1. Verify interactivity is enabled
2. Check request URL matches your Console URL
3. Ensure bot has `chat:write` scope

### Webhook Failing

1. Check URL is accessible from Console
2. Verify HTTPS certificate is valid
3. Check server returns 200 OK
4. Review Console logs for errors
