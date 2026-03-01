# Discord Bot Setup

Connect Discord to Edictum for interactive approval buttons — Approve/Deny directly in Discord.

## 1. Create the Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name (e.g. "Edictum")
3. On **General Information**, copy the **Public Key** — you'll need this later

## 2. Create the Bot

1. Left sidebar → **Bot**
2. Click **Reset Token** → copy the token (`MTQ...`) — shown once, save it now
3. This is your `bot_token`

## 3. Invite the Bot to Your Server

1. Left sidebar → **OAuth2** → **URL Generator**
2. Scopes: check `bot`
3. Bot Permissions: check `Send Messages`
4. Copy the generated URL → open it in your browser → select your server → **Authorize**

## 4. Get the Channel ID

1. In Discord → **User Settings** → **Advanced** → enable **Developer Mode**
2. Right-click the channel where approvals should be posted → **Copy Channel ID**

## 5. Add the Channel in Edictum

1. Dashboard → **Settings** → **Notifications** → **Add Channel** → **Discord**
2. Fill in:
   - **Bot Token**: from step 2
   - **Public Key**: from step 1
   - **Channel ID**: from step 4
3. Click **Test** — a test message should appear in the channel

## What Happens

When an agent requests approval:
- A message appears in your Discord channel with **Approve** and **Deny** buttons
- Click a button → decision submitted to Edictum instantly
- The message updates to show the result
- The approval is also visible in the Edictum dashboard

Interactive buttons require the server to be reachable via HTTPS. Sending notifications works without it; button interactions do not.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test says `Missing Access` (code 50001) | Bot hasn't been invited to the server — open the OAuth URL and authorize it |
| Test says `Missing Permissions` | Bot lacks `Send Messages` in that channel — check channel-level permission overrides |
| Buttons don't work | `EDICTUM_BASE_URL` must be a public HTTPS URL; localhost won't receive Discord interaction callbacks |
| Bot token stopped working | You may have reset it — copy the new token from the Bot page and update it in Edictum |

## Security Note

Treat the bot token like a password. If you accidentally share it (e.g. in a screenshot or chat), reset it immediately in the Discord Developer Portal → **Bot** → **Reset Token**, then update it in Edictum.
