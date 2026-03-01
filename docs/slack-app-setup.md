# Slack App Setup

Connect Slack to Edictum for interactive approval buttons — Approve/Deny directly in Slack, same as Telegram.

## Quick Setup (manifest)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From a manifest**
3. Pick your workspace
4. Paste the contents of [`slack-app-manifest.json`](./slack-app-manifest.json)
5. Replace `YOUR_SERVER` in the request URL with your Edictum server address (e.g. `https://edictum.example.com`)
6. Click **Create**
7. On the **Basic Information** page, copy the **Signing Secret**
8. Go to **OAuth & Permissions**, click **Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-...`)
9. Invite the bot to your channel: type `/invite @edictum` in the Slack channel

## Add the Channel in Edictum

1. Open Edictum dashboard → **Settings** → **Notifications**
2. Click **Add Channel** → select **Slack App**
3. Fill in:
   - **Name**: whatever you like (e.g. "Ops Alerts")
   - **Bot Token**: the `xoxb-...` token from step 8
   - **Signing Secret**: from step 7
   - **Slack Channel**: `#ops-alerts` or the channel ID (e.g. `C01234ABCDE`)
4. Click **Test** — you should see "Slack App connected as @edictum"
5. Save

## What Happens

When an agent requests approval:
- A message appears in your Slack channel with **Approve** and **Deny** buttons
- Click a button → the decision is submitted to Edictum instantly
- The message updates to show the result (no stale buttons)
- The approval is also visible in the Edictum dashboard

If someone decides via the dashboard or Telegram instead, the Slack message updates too.

## Scopes

The manifest requests only `chat:write` — the minimum needed to post messages to channels the bot is invited to. No read access to messages, no access to private channels unless explicitly invited.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot can't post to channel | Invite it: `/invite @edictum` in the channel |
| Test says "invalid_auth" | Bot token is wrong — re-copy from OAuth & Permissions |
| Buttons don't work | Check the Request URL in Interactivity settings matches your server |
| "url_verification_failed" on setup | Your server must be reachable from Slack's servers (not localhost) |
