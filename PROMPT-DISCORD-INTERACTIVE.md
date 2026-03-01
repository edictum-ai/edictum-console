# Spec: Interactive Discord Approvals (Discord Bot)

> **Scope:** Add `discord` channel type with interactive Approve/Deny buttons in Discord. Single interaction endpoint, Ed25519 signature verification, embed-based messages with component buttons.
> **Depends on:** P1 notification channels backend (all channel types, tenant-keyed manager, loader, routing filters — all done).
> **Deliverable:** Admin creates a Discord channel in the dashboard. When an approval is requested, an embed message with Approve/Deny buttons appears in Discord. Clicking a button submits the decision — same UX as Telegram. The original message updates to show the result.

---

## Required Reading

1. `CLAUDE.md` — DDD rules, async everywhere, 200-line limit, tenant isolation, type hints
2. `src/edictum_server/notifications/telegram.py` — gold standard for interactive channels (Redis key pattern, message editing, `update_decision`, `update_expired`)
3. `src/edictum_server/routes/telegram.py` — gold standard for webhook callback handler (signature verification, tenant lookup from Redis, `_process_callback` pattern, SSE push, cross-channel notification)
4. `src/edictum_server/notifications/base.py` — `NotificationChannel` ABC, tenant-keyed `NotificationManager`, `_matches_filters`
5. `src/edictum_server/notifications/loader.py` — `_build_channel` factory (needs Discord branch)
6. `src/edictum_server/services/notification_service.py` — `REQUIRED_CONFIG`, `test_channel`
7. `src/edictum_server/routes/approvals.py` — where `notify_approval_request` / `notify_approval_decided` are called
8. `src/edictum_server/main.py` — router includes (need to add `discord` router)
9. `src/edictum_server/schemas/notifications.py` — `channel_type` Literal (need to add `"discord"`)

---

## How Discord Interactive Messages Work

1. Admin creates a Discord Application at https://discord.com/developers/applications
2. Under **Bot**, creates a bot and copies the **Bot Token**
3. Under **General Information**, copies the **Public Key** (hex-encoded Ed25519 key)
4. Under **General Information**, sets the **Interactions Endpoint URL** → `{EDICTUM_BASE_URL}/api/v1/discord/interactions`
5. Discord validates the endpoint by sending a PING (type 1) — server must respond with PONG (type 1)
6. Admin invites the bot to their server with the `Send Messages` permission
7. When an approval is requested, the server posts an embed + button components via `POST /channels/{channel_id}/messages`
8. User clicks a button → Discord POSTs to the interactions endpoint with Ed25519-signed payload
9. Server verifies signature, identifies the channel by trying each `discord` channel's public key against the request signature
10. Server extracts the action, submits the decision, and responds with type 7 (UPDATE_MESSAGE) — buttons removed, result shown

### Discord vs Telegram vs Slack: Key Differences

| | Telegram | Slack | Discord |
|---|---|---|---|
| **Auth on send** | Bot token in URL path | `Authorization: Bearer xoxb-...` | `Authorization: Bot {token}` |
| **Send API** | `POST /bot{token}/sendMessage` | `POST slack.com/api/chat.postMessage` | `POST discord.com/api/v10/channels/{id}/messages` |
| **Rich messages** | HTML text | Block Kit | Embeds + Components (ActionRows) |
| **Action buttons** | `callback_data` string | `action_id` string | `custom_id` string in ActionRow → Button |
| **Callback delivery** | POST to webhook URL (JSON body) | POST to interactivity URL (form-encoded `payload`) | POST to Interactions Endpoint URL (JSON body) |
| **Callback verification** | `X-Telegram-Bot-Api-Secret-Token` header | HMAC-SHA256 (`X-Slack-Signature`) | **Ed25519** (`X-Signature-Ed25519` + `X-Signature-Timestamp`) |
| **Callback routing** | `/{channel_id}` in URL path | Single endpoint, match by signing secret | Single endpoint, match by public key |
| **Message update on click** | `editMessageText` API | Respond with `replace_original: true` | Respond with type `7` (UPDATE_MESSAGE) |
| **Message update later** | Stored `message_id` → `editMessageText` | Stored `ts` + `slack_channel` → `chat.update` | Stored `message_id` + `discord_channel_id` → `PATCH /channels/{id}/messages/{id}` |
| **Message identity storage** | `telegram:msg:{channel_id}:{approval_id}` | `slack:msg:{channel_id}:{approval_id}` | `discord:msg:{channel_id}:{approval_id}` |
| **Handshake on setup** | `setWebhook` API call | URL verification challenge | PING (type 1) → PONG (type 1) |
| **Response deadline** | None | None | **3 seconds** (token invalidated if exceeded) |
| **Dependencies** | None (httpx only) | None (httpx only) | `PyNaCl` (already in pyproject.toml) |

### Discord Ed25519 Signature Verification

Discord uses Ed25519 (not HMAC-SHA256 like Slack). The public key is a hex string from the Developer Portal.

```python
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

def verify_discord_signature(public_key_hex: str, timestamp: str, body: bytes, signature_hex: str) -> bool:
    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        message = timestamp.encode() + body
        verify_key.verify(message, bytes.fromhex(signature_hex))
        return True
    except (BadSignatureError, ValueError):
        return False
```

**Headers:**
- `X-Signature-Ed25519` — hex-encoded Ed25519 signature
- `X-Signature-Timestamp` — timestamp string

**Verification:** Concatenate `timestamp + raw_body`, verify against signature using the public key.

**Important:** Discord actively tests signature verification. It sends requests with invalid signatures — if verification fails to reject them, Discord removes the endpoint URL.

### Channel Lookup by Public Key

The interaction endpoint does NOT have a `{channel_id}` in the URL. Instead:

1. Query all enabled `discord` channels from DB
2. For each channel, attempt Ed25519 verification using that channel's `public_key`
3. First successful verification → that's the channel
4. If no channel verifies → 401

Ed25519 verification is fast (~80μs per attempt). A single static interactions URL means the admin doesn't need to create the Edictum channel before configuring the Discord app.

### Discord Message Components

Buttons must be inside an ActionRow. Component types and button styles:

```
Component types:
  1 = ActionRow (container)
  2 = Button

Button styles:
  1 = Primary (blurple)
  2 = Secondary (grey)
  3 = Success (green)
  4 = Danger (red)
  5 = Link (grey, opens URL, no interaction event)
```

Example components payload:
```json
{
  "components": [
    {
      "type": 1,
      "components": [
        {
          "type": 2,
          "style": 3,
          "label": "Approve",
          "custom_id": "edictum_approve:abc-123"
        },
        {
          "type": 2,
          "style": 4,
          "label": "Deny",
          "custom_id": "edictum_deny:abc-123"
        },
        {
          "type": 2,
          "style": 5,
          "label": "View in Dashboard",
          "url": "https://edictum.example.com/dashboard/approvals?id=abc-123"
        }
      ]
    }
  ]
}
```

### Discord Interaction Response Types

| Type | Name | Use Case |
|------|------|----------|
| 1 | PONG | ACK a PING (handshake) |
| 4 | CHANNEL_MESSAGE_WITH_SOURCE | Send a new message |
| 6 | DEFERRED_UPDATE_MESSAGE | ACK component interaction (no visible loading) |
| 7 | UPDATE_MESSAGE | Edit the message the button was on |

We use **type 7** for button clicks — edit the original message to show the result and remove buttons.

---

## Config Shape

### New: Discord channel (`channel_type: "discord"`)

```json
{
  "bot_token": "MTIzNDU2Nzg5MDEy...",
  "public_key": "abc123def456...",
  "discord_channel_id": "1234567890123456789"
}
```

- `bot_token` — from Discord Developer Portal → Bot → Token
- `public_key` — from Discord Developer Portal → General Information → Public Key (hex-encoded)
- `discord_channel_id` — the Discord channel snowflake ID to post messages into

**Note:** The config key is `discord_channel_id` (the Discord channel to post to), NOT `channel_id` (which is the Edictum DB UUID). This avoids naming collision.

---

## Files to Create/Modify

### 1. New: `src/edictum_server/notifications/discord.py` (~160 lines)

Interactive Discord channel using Bot API + button components.

```python
from __future__ import annotations

class DiscordChannel(NotificationChannel):
    def __init__(
        self,
        *,
        bot_token: str,
        public_key: str,
        discord_channel_id: str,  # Discord channel snowflake ID
        base_url: str,
        channel_name: str = "Discord",
        channel_id: str = "",  # Edictum DB channel UUID
        filters: dict[str, list[str]] | None = None,
        redis: Redis,
    ) -> None:
```

**`send_approval_request`:**
- POST to `https://discord.com/api/v10/channels/{discord_channel_id}/messages`
- Headers: `Authorization: Bot {bot_token}`, `Content-Type: application/json`
- Body with embed + components:
  - Embed: title "Approval Requested", fields for agent/tool/env/timeout, description with message, color `0xFFA500` (amber)
  - ActionRow with three buttons:
    - "Approve" button: style 3 (Success/green), `custom_id: f"edictum_approve:{approval_id}"`
    - "Deny" button: style 4 (Danger/red), `custom_id: f"edictum_deny:{approval_id}"`
    - "Dashboard" button: style 5 (Link), `url: f"{base_url}/dashboard/approvals?id={approval_id}"`
- Store tenant_id in Redis: `discord:tenant:{channel_id}:{approval_id}` with TTL = timeout_seconds + 60
- Store message info in Redis: `discord:msg:{channel_id}:{approval_id}` → `{"discord_channel_id": "...", "message_id": "..."}` with same TTL
  - `message_id` (snowflake string) comes from the create message response (`data["id"]`)

**`send_approval_decided`:**
- Read message info from Redis: `discord:msg:{channel_id}:{approval_id}`
- If found: PATCH `https://discord.com/api/v10/channels/{discord_channel_id}/messages/{message_id}` to edit the original message (update embed color + title to show result, remove button components)
- If not found (key expired): POST a new message in the channel as a plain text fallback

**`update_expired`:**
- Same pattern as Telegram's `update_expired`
- Signature: `async def update_expired(self, expired_items: list[dict[str, str]]) -> None` — each item has `approval_id` key
- Iterate expired items, read Redis for message info (`discord:msg:{channel_id}:{approval_id}`), PATCH to update embed (grey color `0x99AAB5`, title "Approval Expired", remove buttons via empty `components: []`)
- Exception per-item (don't abort batch) — log warning and continue

**`update_decision`:**
- Thin wrapper around `send_approval_decided` (same as Telegram pattern)

**`supports_interactive`:** `True`

**`close`:** Close the httpx client.

**Embed colors:**
- Request: `0xFFA500` (amber)
- Approved: `0x57F287` (Discord green)
- Denied: `0xED4245` (Discord red)
- Expired: `0x99AAB5` (Discord grey)

### 2. New: `src/edictum_server/routes/discord.py` (~130 lines)

```python
from __future__ import annotations

router = APIRouter(prefix="/api/v1/discord", tags=["discord"])

@router.post("/interactions")
async def discord_interaction(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
```

**Interaction flow:**
1. Read raw body: `body = await request.body()`
2. Get `X-Signature-Ed25519` and `X-Signature-Timestamp` headers (return 401 if missing)
3. Query all enabled `discord` channels from DB
4. For each channel, attempt Ed25519 verification with that channel's `public_key` — first success wins (return 401 if no match)
5. Parse body as JSON
6. **PING handling:** If `body_json["type"] == 1` → return `JSONResponse({"type": 1})` (PONG)
7. **Component interaction:** If `body_json["type"] == 3` (MESSAGE_COMPONENT):
   - Extract `custom_id` from `body_json["data"]["custom_id"]`
   - Parse action: `"edictum_approve:{approval_id}"` or `"edictum_deny:{approval_id}"`
   - Look up tenant from Redis: `discord:tenant:{channel_id}:{approval_id}`
   - **If tenant key not found (expired):** respond with type 7 (UPDATE_MESSAGE) showing an expired embed (grey color `0x99AAB5`, title "Approval Expired", empty `components: []`). Do NOT proceed with decision submission.
   - Extract username gracefully: `username = body_json.get("member", {}).get("user", {}).get("username") or body_json.get("user", {}).get("username", "unknown")` (guild interactions have `member.user`, DM interactions have `user` — bots post to guild channels so `member` is expected, but handle both)
   - Submit decision via `approval_service.submit_decision` with `decided_via="discord"`, `decided_by=f"discord:{username}"`
   - Push SSE events (same as Telegram handler)
   - Notify other channels via `notification_mgr.notify_approval_decided` (background task — updates ALL tenant channels including Telegram, Slack, etc. The Discord message was already updated by the type 7 response below, so the subsequent `send_approval_decided` PATCH on the same Discord message is idempotent/harmless)
   - Respond with type 7 (UPDATE_MESSAGE): updated embed (result shown, color changed) + empty components (buttons removed)
8. Unknown interaction type → return `JSONResponse({"type": 1})` (safe fallback)

**Important: 3-second deadline.** Discord invalidates the interaction token if the response takes longer than 3 seconds. Our flow (Redis lookup → DB update → JSON response) is well under this. Do NOT add any long-running operations before the response.

**PING must be verified.** Unlike Slack's `url_verification` (which can skip verification), Discord's PING must pass Ed25519 verification. The verification happens in step 4 before the PING check in step 6.

### 3. Modify: `src/edictum_server/notifications/loader.py`

Add `discord` branch in `_build_channel`:

```python
if row.channel_type == "discord":
    from edictum_server.notifications.discord import DiscordChannel

    return DiscordChannel(
        bot_token=config["bot_token"],
        public_key=config["public_key"],
        discord_channel_id=config["discord_channel_id"],
        base_url=base_url,
        channel_name=row.name,
        channel_id=channel_id,
        filters=filters,
        redis=redis,
    )
```

### 4. Modify: `src/edictum_server/services/notification_service.py`

Add:
- `REQUIRED_CONFIG["discord"] = ["bot_token", "public_key", "discord_channel_id"]`
- `discord` test case in `_test_http_channel`:
```python
if channel_type == "discord":
    resp = await client.get(
        "https://discord.com/api/v10/users/@me",
        headers={"Authorization": f"Bot {config['bot_token']}"},
    )
    resp.raise_for_status()
    data = resp.json()
    return True, f"Discord bot connected as @{data.get('username', 'unknown')}."
```

**Note:** `GET /users/@me` with the bot token is the simplest way to validate credentials. It returns the bot's user object. No additional scopes needed.

### 5. Modify: `src/edictum_server/schemas/notifications.py`

Add `"discord"` to the `channel_type` Literal:
```python
channel_type: Literal["telegram", "slack", "webhook", "email", "discord"]
```

### 6. Modify: `src/edictum_server/main.py`

Add router import and include:
```python
from edictum_server.routes import discord  # add to existing imports
app.include_router(discord.router)
```

**No startup registration needed.** Unlike Telegram (which calls `setWebhook` at startup and after channel creation), Discord's Interactions Endpoint URL is configured by the user in the Discord Developer Portal. No `_register_webhook_if_discord()` equivalent is needed.

### 7. Modify: `dashboard/src/lib/api/settings.ts`

Add `"discord"` to `ChannelType`:
```typescript
export type ChannelType = "telegram" | "slack" | "webhook" | "email" | "discord"
```

### 8. Modify: `dashboard/src/pages/settings/notifications/config-fields.tsx`

Add `discord` entry to `EMPTY_CONFIG`:
```typescript
discord: { bot_token: "", public_key: "", discord_channel_id: "" },
```

Add `discord` branch in `ConfigFields`:
```typescript
if (type === "discord")
  return (
    <>
      <Field id="cfg-bot-token" label="Bot Token" type="password" value={config.bot_token} onChange={(v) => f("bot_token", v)} placeholder="MTIzNDU2Nzg5MDEy..." />
      <Field id="cfg-public-key" label="Public Key" value={config.public_key} onChange={(v) => f("public_key", v)} placeholder="Hex-encoded Ed25519 key from General Information" hint="Found in Discord Developer Portal → General Information → Public Key." />
      <Field id="cfg-discord-channel" label="Channel ID" value={config.discord_channel_id} onChange={(v) => f("discord_channel_id", v)} placeholder="1234567890123456789" hint="Right-click channel → Copy Channel ID (enable Developer Mode in Discord settings)." />
    </>
  )
```

### 9. Modify: `dashboard/src/pages/settings/notifications/channel-table.tsx`

Add Discord entry to `TYPE_META`:
```typescript
import { Send, Hash, Webhook, Mail, Gamepad2, ... } from "lucide-react"

const TYPE_META: Record<string, { icon: typeof Send; label: string }> = {
  telegram: { icon: Send, label: "Telegram" },
  slack: { icon: Hash, label: "Slack" },
  webhook: { icon: Webhook, label: "Webhook" },
  email: { icon: Mail, label: "Email" },
  discord: { icon: Gamepad2, label: "Discord" },
}
```

### 10. Modify: `dashboard/src/pages/settings/notifications/channel-dialog.tsx`

Update the `<Select>` dropdown:
```typescript
<SelectItem value="discord">Discord</SelectItem>
```

Update the `isValid` function:
```typescript
if (type === "discord") return !!config.bot_token && !!config.public_key && !!config.discord_channel_id
```

---

## Redis Key Pattern

Same pattern as Telegram, different prefix:

- `discord:tenant:{channel_id}:{approval_id}` → tenant_id string, TTL = timeout_seconds + 60
- `discord:msg:{channel_id}:{approval_id}` → `{"discord_channel_id": "...", "message_id": "..."}`, TTL = timeout_seconds + 60

Both keys are set during `send_approval_request`. The `message_id` (snowflake string) comes from the create message response (`data["id"]`) and is used by `send_approval_decided` and `update_expired` to edit the original message via `PATCH /channels/{discord_channel_id}/messages/{message_id}`.

---

## Discord API Endpoints Used

| Operation | Method | URL | Auth Header |
|-----------|--------|-----|-------------|
| Send message | POST | `https://discord.com/api/v10/channels/{channel_id}/messages` | `Bot {token}` |
| Edit message | PATCH | `https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}` | `Bot {token}` |
| Get current user | GET | `https://discord.com/api/v10/users/@me` | `Bot {token}` |

All requests require `Content-Type: application/json` and `Authorization: Bot {bot_token}`.

---

## Tests to Create

### `tests/test_notifications/test_discord_channel.py` (~80 lines)

- Mock httpx, verify create message is called with correct `Authorization: Bot` header
- Verify embed has correct fields (agent, tool, env, timeout) and amber color
- Verify ActionRow has Approve (style 3), Deny (style 4), and Dashboard (style 5/Link) buttons
- Verify `custom_id` format: `edictum_approve:{approval_id}` / `edictum_deny:{approval_id}`
- Verify Redis keys set: both `discord:tenant:...` and `discord:msg:...` with correct TTL
- Verify `send_approval_decided` reads Redis, calls PATCH to edit original message
- Verify `send_approval_decided` falls back to POST new message when Redis key expired
- Verify edit changes embed color (green for approved, red for denied) and removes components
- Verify `update_expired` edits messages with grey embed and removes buttons
- Verify `supports_interactive` is True
- Verify `close()` calls `aclose()`

### `tests/test_notifications/test_discord_interactions.py` (~90 lines)

**Ed25519 Test Fixture Pattern:**
```python
from nacl.signing import SigningKey

@pytest.fixture
def discord_keypair():
    """Generate a fresh Ed25519 keypair for test Discord interactions."""
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode().hex()
    return signing_key, public_key_hex

def sign_discord_payload(signing_key: SigningKey, timestamp: str, body: bytes) -> str:
    """Sign a Discord interaction payload, returning hex-encoded signature."""
    message = timestamp.encode() + body
    signed = signing_key.sign(message)
    return signed.signature.hex()
```

Use `discord_keypair` fixture to create the channel with the test `public_key_hex`, then `sign_discord_payload` to sign interaction payloads before POSTing.

Integration tests using the `client` fixture:
- Create a `discord` channel via API with `public_key_hex` from fixture → verify 201
- POST valid PING interaction to `/api/v1/discord/interactions` (signed with `signing_key`) → verify 200, response is `{"type": 1}`
- POST valid button interaction (signed) → verify 200, response type is 7 (UPDATE_MESSAGE)
- Verify the approval status was updated in DB
- Verify response embed shows correct result + buttons removed (empty components)
- Verify SSE events were pushed

### `tests/test_adversarial/test_discord_interaction_security.py` (~80 lines)

Mark all with `@pytest.mark.security`:
- Wrong Ed25519 signature → 401
- Missing `X-Signature-Ed25519` header → 401
- Missing `X-Signature-Timestamp` header → 401
- Malformed signature (not valid hex) → 401
- Malformed public key in DB (not valid hex) → skip that channel, try next
- No matching channel (no `discord` channels in DB) → 401
- Disabled channel → 401 (public key won't match any enabled channel)
- Cross-tenant: approval from tenant A, interaction routed to tenant B's channel → blocked (Redis key `discord:tenant:...` returns tenant A, channel belongs to tenant B — decision rejected or key not found)
- Replay: same interaction payload sent twice → second one fails (approval already decided)
- Already-decided approval → appropriate error response
- Expired Redis tenant key → type 7 response with expired embed (grey, buttons removed), no decision submitted
- Invalid `custom_id` format (no `edictum_` prefix, no colon) → ignored gracefully
- Invalid `approval_id` (not a UUID) → ignored gracefully

---

## Verification Checklist

### Functional
- [ ] Create `discord` channel via API with bot_token + public_key + discord_channel_id
- [ ] Test channel → calls `GET /users/@me` and confirms bot identity
- [ ] Approval requested → embed message posted to Discord channel with Approve/Deny buttons + Dashboard link
- [ ] Click Approve in Discord → decision submitted, original message updated (embed color changed, buttons removed, result shown)
- [ ] Click Deny → same flow, denied status
- [ ] Decision from elsewhere (dashboard, Telegram) → original Discord message edited (buttons removed, result shown)
- [ ] Expired approval → original Discord message edited (grey embed, shows EXPIRED, buttons removed)
- [ ] Dashboard link button → opens correct approval in dashboard
- [ ] PING/PONG → Discord endpoint validation succeeds
- [ ] Multiple Discord channels (different servers/channels) → each works independently
- [ ] Routing filters → Discord channel respects env/agent/contract filters

### Security
- [ ] Invalid Ed25519 signature → 401
- [ ] Missing signature headers → 401
- [ ] No matching channel → 401
- [ ] Cross-tenant: approval from tenant A, channel from tenant B → blocked
- [ ] Replay: same payload twice → second fails
- [ ] Already-decided approval → error
- [ ] PING only accepted with valid signature

### Code Quality
- [ ] `from __future__ import annotations` in all new files
- [ ] `ruff check src/` passes
- [ ] `pytest tests/` — all pass, no regressions
- [ ] No file exceeds 200 lines
- [ ] No `Any` types unless unavoidable
- [ ] `close()` on httpx client
- [ ] Services don't import from routes
- [ ] All channel methods use explicit params (no `**kwargs`)
- [ ] `PyNaCl` import uses `nacl.signing.VerifyKey` (already in pyproject.toml)

### Frontend
- [ ] "Discord" appears in channel type dropdown
- [ ] Discord shows bot_token (password), public_key, discord_channel_id fields
- [ ] Hints explain where to find public key and channel ID
- [ ] Validation: all three fields required
- [ ] Channel table shows `Gamepad2` icon + "Discord" label for discord channels
- [ ] Both dark and light mode tested

---

## Discord Bot Setup (for users)

Summary of the setup flow for end users:

1. Go to https://discord.com/developers/applications → "New Application" → name it (e.g. "Edictum")
2. **General Information** → copy the **Public Key** (hex string)
3. **General Information** → set **Interactions Endpoint URL** to `{EDICTUM_BASE_URL}/api/v1/discord/interactions`
   - Discord will send a PING to validate — the server must be running and reachable
4. **Bot** → click "Reset Token" → copy the **Bot Token**
5. **Bot** → under Privileged Gateway Intents, no intents are needed (we use HTTP interactions only)
6. **OAuth2** → URL Generator → select `bot` scope → select `Send Messages` permission → copy invite URL → open in browser → invite to server
7. In Edictum dashboard → Settings → Notifications → Add Channel → Discord
8. Paste bot_token, public_key, discord_channel_id → Test → done

**Getting the Channel ID:** Users must enable Developer Mode in Discord (User Settings → App Settings → Advanced → Developer Mode). Then right-click any channel → "Copy Channel ID".

---

## Architecture Notes

### Single endpoint vs per-channel URL

Like Slack and unlike Telegram, Discord uses a single endpoint (`/api/v1/discord/interactions`). This is because:
- Discord requires the Interactions Endpoint URL to be set in the Developer Portal during app creation
- Users shouldn't have to create the Edictum channel first, then go back to Discord to update the URL
- Ed25519 verification across all `discord` channels is fast (~80μs per attempt)

### Ed25519 vs HMAC

Discord chose Ed25519 over HMAC because the public key can be freely shared — it only verifies, never signs. This means:
- The `public_key` in our config is NOT a secret (unlike Slack's `signing_secret`)
- We don't need to worry about it leaking — it's already public in the Discord Developer Portal
- The `bot_token` IS the secret — treat it like any other credential

### Message editing

We store `message_id` (Discord snowflake) + `discord_channel_id` in Redis — same pattern as Telegram stores `chat_id` + `message_id`. This enables:
- `send_approval_decided`: edit original message when decision made elsewhere
- `update_expired`: edit original message when approval times out
- Consistent UX: buttons always removed after resolution

Editing uses `PATCH /channels/{discord_channel_id}/messages/{message_id}` with the bot token, not the interaction token (which expires after 15 minutes).

### 3-second response deadline

Discord invalidates interaction tokens after 3 seconds without a response. Our handler does: Redis get → DB update → JSON response — comfortably under 3 seconds. If future requirements add slow operations, use type 6 (DEFERRED_UPDATE_MESSAGE) to ACK immediately, then follow up via the webhook endpoint `PATCH /webhooks/{app_id}/{interaction_token}/messages/@original`. But for now, a direct type 7 response is simpler and sufficient.

### No gateway connection needed

Unlike most Discord bots, we don't use the WebSocket Gateway at all. We only use:
1. REST API to send/edit messages (outbound)
2. HTTP Interactions Endpoint to receive button clicks (inbound)

This means no `discord.py` library dependency, no persistent WebSocket connection, no heartbeat management. Just `httpx` + `PyNaCl`.
