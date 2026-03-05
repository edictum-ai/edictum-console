# Slack App Setup

Connect Slack to Edictum for interactive approval buttons -- Approve/Deny directly in Slack.

## Quick Setup (Manifest)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From a manifest**
3. Pick your workspace
4. Paste the app manifest -- you can fetch it from your console:
   ```
   GET /api/v1/slack/manifest
   ```
   Or use the [`slack-app-manifest.json`](../../slack-app-manifest.json) file from the repo.
5. Replace `YOUR_SERVER` in the request URL with your Edictum server address (e.g. `https://edictum.example.com`)
6. Click **Create**
7. On the **Basic Information** page, copy the **Signing Secret**
8. Go to **OAuth & Permissions**, click **Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-...`)
9. Invite the bot to your channel: type `/invite @edictum` in the Slack channel

## Add the Channel in Edictum

1. Dashboard > **Settings** > **Notifications** > **Add Channel** > **Slack App**
2. Fill in:
   - **Name**: whatever you like (e.g. "Ops Alerts")
   - **Bot Token**: the `xoxb-...` token from step 8
   - **Signing Secret**: from step 7
   - **Slack Channel**: `#ops-alerts` or the channel ID (e.g. `C01234ABCDE`)
3. Click **Test** -- you should see a test message in the channel
4. Save

## What Happens

When an agent requests approval:

1. A message appears in your Slack channel with approval details (agent, tool, arguments, environment)
2. Two Block Kit action buttons: **Approve** and **Deny**
3. Click a button -- the decision is submitted to Edictum instantly
4. The message updates to show the result (no stale buttons)
5. The approval is also visible in the Edictum dashboard

If someone decides via the dashboard or Telegram instead, the Slack message updates too.

## Interaction Verification

The console verifies every Slack interaction request:

- **HMAC-SHA256 signature** -- Slack signs each request with your signing secret. The console verifies the signature before processing.
- **5-minute replay window** -- requests older than 5 minutes are rejected, preventing replay attacks.

This ensures that button clicks genuinely come from Slack, not from an attacker.

## Scopes

The manifest requests only `chat:write` -- the minimum needed to post messages to channels the bot is invited to. No read access to messages, no access to private channels unless explicitly invited.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test says `not_in_channel` | Invite the bot: `/invite @edictum` in the channel, then test again |
| Test says `missing_scope` | Go to OAuth & Permissions > Bot Token Scopes > add the scope shown > **Reinstall to Workspace** > copy new token and update in Edictum |
| Test says `invalid_auth` | Bot token is wrong or expired. Re-copy from OAuth & Permissions after reinstalling. |
| Buttons don't work | The Request URL in Interactivity & Shortcuts must be an HTTPS endpoint reachable by Slack. Localhost won't work -- use ngrok for local dev. |
| `url_verification_failed` on setup | Your server must be reachable from Slack's servers (not localhost) |
| Notifications send but buttons do nothing | Check that `EDICTUM_BASE_URL` is set to your public HTTPS URL |

## Next Steps

- [Notification Overview](overview.md) -- routing filters and channel management
- [Telegram Setup](telegram.md) -- add Telegram as another channel
- [Discord Bot Setup](discord.md) -- add Discord as another channel
