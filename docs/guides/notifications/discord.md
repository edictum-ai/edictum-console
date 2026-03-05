# Discord Bot Setup

Connect Discord to Edictum for interactive approval buttons -- Approve/Deny directly in Discord.

## 1. Create the Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** > give it a name (e.g. "Edictum")
3. On **General Information**, copy the **Public Key** -- you'll need this later

## 2. Create the Bot

1. Left sidebar > **Bot**
2. Click **Reset Token** > copy the token (`MTQ...`) -- shown once, save it now
3. This is your `bot_token`

## 3. Set Up Interactions Endpoint

1. Left sidebar > **General Information**
2. Set **Interactions Endpoint URL** to: `https://your-server.com/api/v1/discord/interactions`
3. Discord sends a PING to verify -- your console must be running and reachable via HTTPS
4. Click **Save Changes**

## 4. Invite the Bot to Your Server

1. Left sidebar > **OAuth2** > **URL Generator**
2. Scopes: check `bot`
3. Bot Permissions: check `Send Messages`
4. Copy the generated URL > open it in your browser > select your server > **Authorize**

## 5. Get the Channel ID

1. In Discord > **User Settings** > **Advanced** > enable **Developer Mode**
2. Right-click the channel where approvals should be posted > **Copy Channel ID**

## 6. Add the Channel in Edictum

1. Dashboard > **Settings** > **Notifications** > **Add Channel** > **Discord**
2. Fill in:
   - **Bot Token**: from step 2
   - **Public Key**: from step 1
   - **Channel ID**: from step 5
3. Click **Test** -- a test message should appear in the channel

## What Happens

When an agent requests approval:

1. A message appears in your Discord channel with **Approve** and **Deny** buttons
2. Click a button > decision submitted to Edictum instantly
3. The message updates to show the result
4. The approval is also visible in the Edictum dashboard

Interactive buttons require the server to be reachable via HTTPS. Sending notifications works without it; button interactions do not.

## Interaction Verification

The console verifies every Discord interaction using:

- **Ed25519 signature verification** -- Discord signs each interaction request with your application's public key. The console verifies the signature before processing.
- **PING handshake** -- Discord sends a PING request to your interactions endpoint during setup. The console responds with a PONG to confirm the endpoint is valid.

This ensures button clicks genuinely come from Discord.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test says `Missing Access` (code 50001) | Bot hasn't been invited to the server -- open the OAuth URL and authorize it |
| Test says `Missing Permissions` | Bot lacks `Send Messages` in that channel -- check channel-level permission overrides |
| Buttons don't work | `EDICTUM_BASE_URL` must be a public HTTPS URL; localhost won't receive Discord interaction callbacks |
| Bot token stopped working | You may have reset it -- copy the new token from the Bot page and update it in Edictum |
| Interactions endpoint won't verify | Your server must respond to Discord's PING within 3 seconds. Check that `EDICTUM_BASE_URL` is correct and the server is running. |
| `Invalid interaction` errors in logs | The public key in Edictum doesn't match the one in Discord Developer Portal. Re-copy it. |

## Security Note

Treat the bot token like a password. If you accidentally share it (e.g. in a screenshot or chat):

1. Go to Discord Developer Portal > **Bot** > **Reset Token**
2. Copy the new token
3. Update it in Edictum dashboard

The bot token is encrypted at rest in the console database.

## Next Steps

- [Notification Overview](overview.md) -- routing filters and channel management
- [Telegram Setup](telegram.md) -- add Telegram as another channel
- [Slack App Setup](slack.md) -- add Slack as another channel
