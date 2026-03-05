# Notification Channels

Get notified when agents request approval. Six channel types, three with interactive approve/deny buttons.

## Channel Types

| Channel | Interactive | Notes |
|---------|:-----------:|-------|
| [Telegram](telegram.md) | Yes | Bot token + chat_id. Inline keyboard buttons. |
| [Slack App](slack.md) | Yes | Bot token + signing secret. Block Kit action buttons. |
| Slack Webhook | No | Incoming webhook URL. One-way notification with dashboard link. |
| [Discord](discord.md) | Yes | Bot token + public key. Component buttons. |
| [Webhook](webhook.md) | No | Generic HTTP POST. Optional HMAC-SHA256 signature. |
| [Email](email.md) | No | SMTP. HTML email with dashboard deep link. |

**Interactive** channels let you approve or deny directly from the notification (click a button in Telegram, Slack, or Discord). Non-interactive channels send a notification with a link to the dashboard where you can decide.

## Adding a Channel

Dashboard > **Settings** > **Notifications** > **Add Channel**.

Select the channel type, fill in the configuration fields, and click **Test** to verify.

## Routing Filters

Each channel can have routing filters that control which approval requests it receives:

| Filter | Format | Example |
|--------|--------|---------|
| `environments` | List of environment names | `["production", "staging"]` |
| `agent_patterns` | Glob patterns on agent_id | `["prod-*", "ops-agent"]` |
| `contract_names` | Glob patterns on contract name | `["block-*", "require-approval-*"]` |

**AND logic** -- all non-empty filters must match. If you set both `environments: ["production"]` and `agent_patterns: ["prod-*"]`, the channel only receives approvals from agents matching `prod-*` in the `production` environment.

**Empty filter = receive everything** for that dimension. A channel with no filters receives all approval requests.

### Examples

| Goal | Filters |
|------|---------|
| Production alerts only | `environments: ["production"]` |
| One team's agents | `agent_patterns: ["platform-*"]` |
| Specific contract alerts | `contract_names: ["require-human-approval"]` |
| Everything | Leave all filters empty |

## Security

### Secrets Encrypted at Rest

Channel configuration secrets (bot tokens, signing secrets, API keys, SMTP passwords) are encrypted at rest using NaCl SecretBox. In API responses, secrets are masked (e.g. `edk_••••mHz`).

### HTTPS Requirement

Interactive channels (Telegram, Slack App, Discord) require `EDICTUM_BASE_URL` to be set to a public HTTPS URL. The console must be reachable from the internet for button callbacks to work.

Sending notifications works without HTTPS. Receiving button clicks does not.

### Test Button

Every channel has a test button:

```
POST /api/v1/notifications/channels/{id}/test
```

Or click **Test** in the dashboard. A test message is sent to verify the configuration is correct.

## Channel Lifecycle

1. **Add** a channel in Settings > Notifications
2. **Test** to verify configuration
3. **Enable/disable** with the toggle -- disabled channels don't send notifications
4. **Edit** to update configuration or filters
5. **Delete** to remove permanently

## Next Steps

- [Telegram Setup](telegram.md)
- [Slack App Setup](slack.md)
- [Discord Bot Setup](discord.md)
- [Webhook Setup](webhook.md)
- [Email Setup](email.md)
