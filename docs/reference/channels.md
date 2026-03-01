# Notification Channels

Reference for all supported notification channels.

## Overview

Notification channels deliver alerts and approval requests to your team. Each channel type has different capabilities.

## Channel Comparison

| Channel | Alerts | Approvals | Interactive | Setup |
|---------|--------|-----------|-------------|-------|
| Telegram | ✅ | ✅ | ✅ (buttons) | Bot token + Chat ID |
| Slack | ✅ | ✅ | ✅ (buttons) | Webhook URL or Bot token |
| Discord | ✅ | ✅ | ✅ (buttons) | Webhook URL |
| Webhook | ✅ | ❌ | ❌ | URL |
| Email | ✅ | ❌ | ❌ | SMTP config |

## Telegram

### Capabilities

- Send alerts and approval requests
- Interactive approve/deny buttons
- Edit messages on decision

### Configuration

```json
{
    "name": "Team Telegram",
    "channel_type": "telegram",
    "config": {
        "bot_token": "123456789:ABCdefGHIjkl...",
        "chat_id": "-1001234567890",
        "webhook_secret": "auto-generated"
    }
}
```

### Requirements

- Bot token from @BotFather
- Chat ID (negative for groups)
- Public URL for webhook (Console auto-registers)

### Interactive Approvals

```
🔔 Approval Request
Agent: agent-1
Tool: delete_file
Path: /production/old-logs.txt

[✅ Approve] [❌ Deny]
```

## Slack

### Capabilities

- Send alerts and approval requests
- Interactive approve/deny buttons
- Rich formatting (blocks)

### Configuration

```json
{
    "name": "Engineering Slack",
    "channel_type": "slack",
    "config": {
        "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx"
    }
}
```

For interactive approvals, also include bot token:

```json
{
    "channel_type": "slack",
    "config": {
        "webhook_url": "https://hooks.slack.com/services/...",
        "bot_token": "xoxb-1234567890-..."
    }
}
```

### Requirements

- Incoming webhook URL
- (Optional) Bot token for interactive

### Interactive Approvals

```
🔔 Approval Request
Agent: agent-1
Tool: delete_file

[Approve] [Deny]
```

## Discord

### Capabilities

- Send alerts and approval requests
- Interactive approve/deny buttons
- Embeds with rich formatting

### Configuration

```json
{
    "name": "Discord Alerts",
    "channel_type": "discord",
    "config": {
        "webhook_url": "https://discord.com/api/webhooks/123456/abc123..."
    }
}
```

For interactive approvals, include channel ID and bot token:

```json
{
    "channel_type": "discord",
    "config": {
        "webhook_url": "https://discord.com/api/webhooks/...",
        "discord_channel_id": "1234567890123456789",
        "bot_token": "MTk4NjIyNDgzNDc..."
    }
}
```

### Requirements

- Webhook URL
- (Optional) Bot token + Channel ID for interactive

### Interactive Approvals

Same as Slack with approve/deny buttons.

## Webhook

### Capabilities

- Send alerts only (no interactive)
- POST to any HTTP endpoint

### Configuration

```json
{
    "name": "Custom Webhook",
    "channel_type": "webhook",
    "config": {
        "url": "https://your-server.com/webhook"
    }
}
```

### Payload

```json
POST https://your-server.com/webhook
Content-Type: application/json

{
    "event": "tool_denied",
    "timestamp": "2026-03-01T12:00:00Z",
    "tenant_id": "uuid",
    "agent_id": "agent-1",
    "tool_name": "delete_file",
    "args": {"path": "/production/data.db"},
    "reason": "Contract: protect-production-db",
    "details": {...}
}
```

### Response

Your server should return `200 OK`. Non-2xx responses are logged as failures.

### Security

- URLs validated for SSRF (internal IPs blocked)
- Only HTTP/HTTPS schemes allowed
- DNS resolution checked

## Email

### Capabilities

- Send alerts only (no interactive)
- Plain text or HTML

### Configuration

```json
{
    "name": "Email Alerts",
    "channel_type": "email",
    "config": {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "alerts@example.com",
        "smtp_password": "app-password",
        "from_address": "alerts@example.com",
        "to_addresses": ["team@example.com"]
    }
}
```

### Requirements

- SMTP server access
- App password (if using Gmail)

## Routing Filters

All channels support filters:

```json
{
    "name": "Production Only",
    "channel_type": "slack",
    "config": {...},
    "filters": {
        "environments": ["production"],
        "agent_patterns": ["prod-*"],
        "contract_names": ["critical-*"]
    }
}
```

### Filter Options

| Filter | Description |
|--------|-------------|
| `environments` | Only send for these envs |
| `agent_patterns` | Glob patterns for agent IDs |
| `contract_names` | Only for these contracts |

## Rate Limiting

Channels are rate-limited:

- Max 1 message per second per channel
- Burst of 5 allowed
- Overflow queued (not dropped)

## Testing

```bash
POST /api/v1/notifications/channels/{id}/test
```

Sends a test message:

```
🔔 Test Notification
This is a test from Edictum Console.
If you see this, the channel is working!
```

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Telegram not sending | Check bot is in group, verify chat ID |
| Slack buttons not working | Verify interactivity enabled, check bot token |
| Webhook 404 | Verify URL is correct and accessible |
| Email not delivered | Check SMTP credentials, check spam folder |

### Debug Logs

```bash
# View notification logs
docker compose logs server | grep notification
```
