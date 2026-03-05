# Telegram Setup

Connect Telegram to Edictum for interactive approval buttons -- Approve/Deny directly in Telegram.

## 1. Create a Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name and username for your bot
4. BotFather gives you a **bot token** (e.g. `7123456789:AAH...`) -- copy it, you'll need it next

## 2. Get Your Chat ID

1. Send any message to your new bot in Telegram
2. Open this URL in your browser (replace `{token}` with your bot token):
   ```
   https://api.telegram.org/bot{token}/getUpdates
   ```
3. Find the `chat.id` in the JSON response:
   ```json
   {
     "result": [{
       "message": {
         "chat": {
           "id": 123456789
         }
       }
     }]
   }
   ```
4. Copy the `chat.id` number -- this is your **chat_id**

**Tip:** For group chats, add the bot to the group first, then send a message in the group. The chat ID for groups is negative (e.g. `-1001234567890`).

## 3. Add the Channel in Edictum

1. Dashboard > **Settings** > **Notifications** > **Add Channel** > **Telegram**
2. Fill in:
   - **Bot Token**: the token from step 1
   - **Chat ID**: the chat ID from step 2
3. Click **Test** -- a test message should appear in your Telegram chat
4. Save

## 4. Webhook Registration

The console automatically registers a webhook with Telegram when you save the channel. This is how Telegram sends button clicks back to the console.

**Requirement:** `EDICTUM_BASE_URL` must be set to a public HTTPS URL for interactive buttons to work. The console must be reachable from Telegram's servers.

## What Happens

When an agent requests approval:

1. A message appears in your Telegram chat with the approval details (agent, tool, arguments, environment)
2. Two inline keyboard buttons: **Approve** and **Deny**
3. Click a button -- the decision is submitted to Edictum instantly
4. The message updates to show the result (who decided, when, via which channel)
5. The agent receives the decision and proceeds (or stops)

If someone decides via the dashboard or another channel instead, the Telegram message updates too -- no stale buttons.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test message not appearing | Verify the bot token and chat_id are correct. Make sure you messaged the bot first (bots can't initiate conversations). |
| `chat not found` error | The chat_id is wrong, or the bot was removed from the group. Re-add the bot and get a fresh chat_id. |
| Buttons don't work | `EDICTUM_BASE_URL` must be a public HTTPS URL. Localhost won't receive Telegram callbacks. |
| Bot token stopped working | You may have regenerated it in BotFather. Copy the new token and update it in Edictum. |
| Messages to group chat fail | Add the bot to the group, then send a message in the group to get the correct (negative) chat_id. |

## Security

Treat the bot token like a password. If you accidentally share it:

1. Message @BotFather > `/revoke` > select your bot
2. Copy the new token
3. Update it in Edictum dashboard

The bot token is encrypted at rest in the console database. It's masked in API responses.

## Next Steps

- [Notification Overview](overview.md) -- routing filters and channel management
- [Slack App Setup](slack.md) -- add Slack as another channel
- [Discord Bot Setup](discord.md) -- add Discord as another channel
