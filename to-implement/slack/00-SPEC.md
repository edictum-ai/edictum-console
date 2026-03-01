# Spec: Interactive Slack Approvals (Slack App)

> **Scope:** Add `slack_app` channel type with interactive Approve/Deny buttons in Slack. Single interaction endpoint, manifest-based setup, message editing via stored `ts`.
> **Depends on:** P1 notification channels backend (all channel types, tenant-keyed manager, loader, routing filters — all done).
> **Deliverable:** Admin creates a Slack App channel in the dashboard. When an approval is requested, a Block Kit message with Approve/Deny buttons appears in Slack. Clicking a button submits the decision — same UX as Telegram. The original message updates to show the result.

---

## Required Reading

1. `CLAUDE.md` — DDD rules, async everywhere, 200-line limit, tenant isolation, type hints
2. `src/edictum_server/notifications/slack.py` — current send-only SlackChannel (unchanged by this feature)
3. `src/edictum_server/notifications/telegram.py` — gold standard for interactive channels (Redis key pattern, message editing, `update_decision`, `update_expired`)
4. `src/edictum_server/routes/telegram.py` — gold standard for webhook callback handler (signature verification, tenant lookup from Redis, `_process_callback` pattern, SSE push, cross-channel notification)
5. `src/edictum_server/notifications/base.py` — `NotificationChannel` ABC, tenant-keyed `NotificationManager`, `_matches_filters`
6. `src/edictum_server/notifications/loader.py` — `_build_channel` factory (needs Slack App branch)
7. `src/edictum_server/services/notification_service.py` — `REQUIRED_CONFIG`, `test_channel` (will be split)
8. `src/edictum_server/routes/approvals.py` — where `notify_approval_request` / `notify_approval_decided` are called
9. `src/edictum_server/main.py` — router includes (need to add `slack` router)
10. `docs/slack-app-manifest.json` — manifest template (already created)
11. `docs/slack-app-setup.md` — setup guide (already created)

---

## How Slack Interactive Messages Work

1. Admin creates a Slack App at https://api.slack.com/apps using the manifest from `GET /api/v1/slack/manifest`
2. App has a **Bot Token** (`xoxb-...`) with `chat:write` scope
3. App has a **Signing Secret** for verifying incoming requests
4. The manifest pre-configures **Interactivity Request URL** → `{EDICTUM_BASE_URL}/api/v1/slack/interactions`
5. When an approval is requested, the server posts a Block Kit message via `chat.postMessage` API with Approve/Deny action buttons
6. User clicks a button → Slack POSTs to the interactivity URL
7. Server identifies the channel by trying each `slack_app` channel's signing secret against the request signature
8. Server extracts the action, submits the decision, and responds with an updated message (buttons removed, result shown)

### Slack vs Telegram: Key Differences

| | Telegram | Slack |
|---|---|---|
| **Auth on send** | Bot token in URL path | `Authorization: Bearer xoxb-...` header |
| **Send API** | `POST /bot{token}/sendMessage` | `POST https://slack.com/api/chat.postMessage` |
| **Action buttons** | `callback_data` string | `action_id` string |
| **Callback delivery** | POST to webhook URL with JSON body | POST to interactivity URL with `application/x-www-form-urlencoded` body containing a `payload` JSON field |
| **Callback verification** | `X-Telegram-Bot-Api-Secret-Token` header | HMAC-SHA256 of `v0:{timestamp}:{body}` using signing secret, compared to `X-Slack-Signature` header |
| **Callback routing** | `/{channel_id}` in URL | Single endpoint, match by signing secret |
| **Message update on interaction** | `editMessageText` API | Respond with `replace_original: true` |
| **Message update later** | Stored `message_id` in Redis | Stored `ts` + `slack_channel` in Redis → `chat.update` API |
| **Message identity storage** | `telegram:msg:{channel_id}:{approval_id}` | `slack:msg:{channel_id}:{approval_id}` |

### Slack Signature Verification

```python
import hashlib
import hmac
import time

def verify_slack_signature(signing_secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    # Reject requests older than 5 minutes (replay protection)
    if abs(time.time() - int(timestamp)) > 300:
        return False
    sig_basestring = f"v0:{timestamp}:{body.decode()}"
    expected = "v0=" + hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

### Channel Lookup by Signing Secret

The interaction endpoint does NOT have a `{channel_id}` in the URL. Instead:

1. Query all enabled `slack_app` channels from DB
2. For each channel, compute HMAC-SHA256 using that channel's `signing_secret`
3. Compare to the `X-Slack-Signature` header
4. First match → that's the channel

This is fast (HMAC is ~1μs per computation) and enables a single static interactivity URL in the Slack manifest — no round-trip to create the channel first, then update the URL.

---

## Config Shape

### New: Slack App channel (`channel_type: "slack_app"`)

```json
{
  "bot_token": "xoxb-...",
  "signing_secret": "abc123...",
  "slack_channel": "#ops-alerts or C01234ABCDE"
}
```

**Note:** The config key is `slack_channel` (the Slack channel to post to), NOT `channel_id` (which is the Edictum DB UUID). This avoids naming collision.

**Keep the existing `"slack"` type** as send-only incoming webhook. The new `"slack_app"` type is a separate channel type with interactive support.

### Why a new type instead of upgrading `"slack"`

- Different config shape (`bot_token` + `signing_secret` + `slack_channel` vs `webhook_url`)
- Different `supports_interactive` value (True vs False)
- Admins who set up incoming webhooks shouldn't have their channels break
- The loader factory needs different constructor params
- Clean separation in the UI: "Slack (Webhook)" vs "Slack (Interactive)"

---

## Files to Create/Modify

### 1. New: `src/edictum_server/notifications/slack_app.py` (~150 lines)

Interactive Slack channel using Bot API + action buttons.

```python
from __future__ import annotations

class SlackAppChannel(NotificationChannel):
    def __init__(
        self,
        *,
        bot_token: str,
        signing_secret: str,
        slack_channel: str,  # Slack channel ID or name
        base_url: str,
        channel_name: str = "Slack App",
        channel_id: str = "",  # Edictum DB channel UUID
        filters: dict[str, list[str]] | None = None,
        redis: Redis,
    ) -> None:
```

**`send_approval_request`:**
- POST to `https://slack.com/api/chat.postMessage` with `Authorization: Bearer {bot_token}`
- Block Kit payload with:
  - Header: "Approval Requested"
  - Section fields: agent, tool, env, timeout
  - Section: message
  - Actions block with two buttons:
    - "Approve" button: `action_id: f"edictum_approve:{approval_id}"`, style "primary"
    - "Deny" button: `action_id: f"edictum_deny:{approval_id}"`, style "danger"
  - Context block with deep link: "Or review in dashboard: {deep_link}"
- Store tenant_id in Redis: `slack:tenant:{channel_id}:{approval_id}` with TTL = timeout_seconds + 60
- Store message info in Redis: `slack:msg:{channel_id}:{approval_id}` → `{"slack_channel": "...", "ts": "..."}` with same TTL
  - `ts` comes from the `chat.postMessage` response (`data["ts"]`)

**`send_approval_decided`:**
- Read message info from Redis: `slack:msg:{channel_id}:{approval_id}`
- If found: call `chat.update` to edit the original message (remove buttons, show result) — same UX as Telegram
- If not found (key expired): POST `chat.postMessage` with a plain text status message as fallback

**`update_expired`:**
- Same pattern as Telegram's `update_expired`
- Iterate expired items, read Redis for message info, call `chat.update` to show "EXPIRED" and remove buttons
- Exception per-item (don't abort batch)

**`update_decision`:**
- Thin wrapper around `send_approval_decided` (same as Telegram pattern)

**`supports_interactive`:** `True`

**`close`:** Close the httpx client.

### 2. New: `src/edictum_server/routes/slack.py` (~140 lines)

```python
from __future__ import annotations

router = APIRouter(prefix="/api/v1/slack", tags=["slack"])

@router.post("/interactions")
async def slack_interaction(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
```

**Interaction flow:**
1. Read raw body: `body = await request.body()`
2. Get `X-Slack-Request-Timestamp` and `X-Slack-Signature` headers (return 403 if missing)
3. Check timestamp freshness (return 403 if > 5 minutes old)
4. Query all enabled `slack_app` channels from DB
5. For each channel, compute HMAC and compare — first match wins (return 403 if no match)
6. Parse body: check if this is a `url_verification` challenge → respond with `{"challenge": "..."}` if so
7. Parse payload: `payload = json.loads(parse_qs(body.decode())["payload"][0])`
8. Extract action: `action_id` is `"edictum_approve:{approval_id}"` or `"edictum_deny:{approval_id}"`
9. Look up tenant from Redis: `slack:tenant:{channel_id}:{approval_id}`
10. Submit decision via `approval_service.submit_decision` with `decided_via="slack"`, `decided_by=f"slack:{payload['user']['username']}"`
11. Push SSE events (same as Telegram handler)
12. Notify other channels via `notification_mgr.notify_approval_decided`
13. Respond with JSON to update the original message (`replace_original: true`, buttons removed, result shown)

**Manifest endpoint:**
```python
@router.get("/manifest")
async def slack_manifest(request: Request) -> JSONResponse:
```
- Read `EDICTUM_BASE_URL` from config
- Return the manifest JSON with `request_url` pre-filled: `{base_url}/api/v1/slack/interactions`
- No auth required (the manifest contains no secrets)

**URL verification:**
- Slack sends `{"type": "url_verification", "challenge": "..."}` when the interactivity URL is first configured
- Respond with `{"challenge": "..."}` immediately (before signature check, as Slack does this before the app has been installed)

### 3. Modify: `src/edictum_server/notifications/loader.py`

Add `slack_app` branch in `_build_channel`:

```python
if row.channel_type == "slack_app":
    from edictum_server.notifications.slack_app import SlackAppChannel

    return SlackAppChannel(
        bot_token=config["bot_token"],
        signing_secret=config["signing_secret"],
        slack_channel=config["slack_channel"],
        base_url=base_url,
        channel_name=row.name,
        channel_id=channel_id,
        filters=filters,
        redis=redis,
    )
```

### 4. Modify: `src/edictum_server/services/notification_service.py`

**Split first:** Extract `_test_http_channel` and `_test_email` into `src/edictum_server/services/channel_test_helpers.py` (~80 lines). The main file imports and calls them. This brings `notification_service.py` under 200 lines.

Then add:
- `REQUIRED_CONFIG["slack_app"] = ["bot_token", "signing_secret", "slack_channel"]`
- `slack_app` test case in the extracted test helper:
```python
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
```

### 5. Modify: `src/edictum_server/schemas/notifications.py`

Add `"slack_app"` to the `channel_type` Literal:
```python
channel_type: Literal["telegram", "slack", "webhook", "email", "slack_app"]
```

### 6. Modify: `src/edictum_server/main.py`

Add router import and include:
```python
from edictum_server.routes import slack  # add to existing imports
app.include_router(slack.router)
```

### 7. Modify: `dashboard/src/lib/api/settings.ts`

Add `"slack_app"` to `ChannelType`:
```typescript
export type ChannelType = "telegram" | "slack" | "webhook" | "email" | "slack_app"
```

### 8. Modify: `dashboard/src/pages/settings/notifications/config-fields.tsx`

Add `slack_app` entry to `EMPTY_CONFIG`:
```typescript
slack_app: { bot_token: "", signing_secret: "", slack_channel: "" },
```

Add `slack_app` branch in `ConfigFields`:
```typescript
if (type === "slack_app")
  return (
    <>
      <Field id="cfg-bot-token" label="Bot Token" type="password" value={config.bot_token} onChange={(v) => f("bot_token", v)} placeholder="xoxb-..." />
      <Field id="cfg-signing-secret" label="Signing Secret" type="password" value={config.signing_secret} onChange={(v) => f("signing_secret", v)} />
      <Field id="cfg-slack-channel" label="Slack Channel" value={config.slack_channel} onChange={(v) => f("slack_channel", v)} placeholder="#ops-alerts or C01234ABCDE" />
    </>
  )
```

### 9. Modify: `dashboard/src/pages/settings/notifications/channel-dialog.tsx`

Update the `<Select>` dropdown and `isValid` function:

**Dropdown labels with descriptions:**
- `slack` → "Slack (Webhook)" — sends notifications with deep links to the approval
- `slack_app` → "Slack (Interactive)" — sends notifications with Approve/Deny buttons

**Validation:**
```typescript
if (type === "slack_app") return !!config.bot_token && !!config.signing_secret && !!config.slack_channel
```

---

## Redis Key Pattern

Same pattern as Telegram, different prefix:

- `slack:tenant:{channel_id}:{approval_id}` → tenant_id string, TTL = timeout_seconds + 60
- `slack:msg:{channel_id}:{approval_id}` → `{"slack_channel": "...", "ts": "..."}`, TTL = timeout_seconds + 60

Both keys are set during `send_approval_request`. The `ts` comes from the `chat.postMessage` response and is used by `send_approval_decided` and `update_expired` to edit the original message via `chat.update`.

---

## Tests to Create

### `tests/test_notifications/test_slack_app_channel.py` (~80 lines)

- Mock httpx, verify `chat.postMessage` is called with correct `Authorization: Bearer` header
- Verify Block Kit payload has Approve/Deny buttons with correct `action_id` format
- Verify Redis keys set: both `slack:tenant:...` and `slack:msg:...` with correct TTL
- Verify `send_approval_decided` reads Redis, calls `chat.update` to edit original message
- Verify `send_approval_decided` falls back to `chat.postMessage` when Redis key expired
- Verify `update_expired` edits messages and removes buttons
- Verify `supports_interactive` is True
- Verify `close()` calls `aclose()`

### `tests/test_notifications/test_slack_interactions.py` (~90 lines)

Integration tests using the `client` fixture:
- Create a `slack_app` channel via API → verify 201
- POST valid interaction payload to `/api/v1/slack/interactions` → verify 200, response has `replace_original: true`
- Verify the approval status was updated in DB
- `GET /api/v1/slack/manifest` → verify 200, response has correct `request_url` with base URL
- URL verification challenge → verify correct response

### `tests/test_adversarial/test_slack_interaction_security.py` (~80 lines)

Mark all with `@pytest.mark.security`:
- Wrong signature → 403
- Expired timestamp (> 5 min old) → 403
- Missing `X-Slack-Signature` header → 403
- Missing `X-Slack-Request-Timestamp` header → 403
- No matching channel (no `slack_app` channels in DB) → 403
- Disabled channel → 403 (signing secret won't match any enabled channel)
- Cross-tenant: approval from tenant A, interaction routed to tenant B's channel → blocked (Redis key `slack:tenant:...` returns tenant A, channel belongs to tenant B — decision rejected or key not found)
- Replay: same interaction payload sent twice → second one fails (approval already decided)
- Already-decided approval → appropriate error response

---

## Verification Checklist

### Functional
- [ ] Create `slack_app` channel via API with bot_token + signing_secret + slack_channel
- [ ] Test channel → calls `auth.test` and confirms bot identity
- [ ] `GET /api/v1/slack/manifest` → returns manifest with pre-filled request URL
- [ ] Approval requested → Block Kit message posted to Slack channel with Approve/Deny buttons
- [ ] Click Approve in Slack → decision submitted, original message updated (buttons removed, result shown)
- [ ] Click Deny → same flow, denied status
- [ ] Decision from elsewhere (dashboard, Telegram) → original Slack message edited (buttons removed, result shown)
- [ ] Expired approval → original Slack message edited (shows EXPIRED, buttons removed)
- [ ] Deep link in context block → opens correct approval in dashboard
- [ ] Multiple Slack App channels (different teams/channels) → each works independently
- [ ] Routing filters → Slack App channel respects env/agent/contract filters
- [ ] Existing `slack` (incoming webhook) channels still work unchanged
- [ ] URL verification challenge → correct response

### Security
- [ ] Invalid Slack signature → 403
- [ ] Expired timestamp → 403
- [ ] No matching channel → 403
- [ ] Cross-tenant: approval from tenant A, channel from tenant B → blocked
- [ ] Replay: same payload twice → second fails
- [ ] Already-decided approval → error

### Code Quality
- [ ] `from __future__ import annotations` in all new files
- [ ] `ruff check src/` passes
- [ ] `pytest tests/` — all pass, no regressions
- [ ] No file exceeds 200 lines
- [ ] No `Any` types unless unavoidable
- [ ] `close()` on httpx client
- [ ] Services don't import from routes
- [ ] All channel methods use explicit params (no `**kwargs`)

### Frontend
- [ ] "Slack (Webhook)" and "Slack (Interactive)" appear in channel type dropdown with descriptions
- [ ] Slack (Interactive) shows bot_token, signing_secret, slack_channel fields
- [ ] Validation: all three fields required for slack_app
- [ ] Existing Slack (Webhook) channels display correctly
- [ ] Both dark and light mode tested

---

## Slack App Setup (for users)

See `docs/slack-app-setup.md` for the full guide. Summary:

1. In Edictum dashboard: copy the manifest URL from `GET /api/v1/slack/manifest`
2. Go to https://api.slack.com/apps → "Create New App" → "From a manifest" → paste manifest
3. Install to Workspace → copy Bot Token + Signing Secret
4. In Edictum dashboard → Settings → Notifications → Add Channel → Slack (Interactive)
5. Invite bot to channel: `/invite @edictum`
6. Test → done

---

## Architecture Notes

### Single endpoint vs per-channel URL

Unlike Telegram (`/api/v1/telegram/webhook/{channel_id}`), Slack uses a single endpoint (`/api/v1/slack/interactions`). This is because:
- Slack requires the interactivity URL to be set during app creation (in the manifest)
- Users shouldn't have to create the Edictum channel first, then go back to Slack to update the URL
- Signing secret lookup across all `slack_app` channels is negligible (~1μs per HMAC)

### Message editing

Unlike the original spec, we store message `ts` (Slack's message identifier) in Redis — same pattern as Telegram stores `message_id`. This enables:
- `send_approval_decided`: edit original message when decision made elsewhere
- `update_expired`: edit original message when approval times out
- Consistent UX: buttons always removed after resolution

### Service file split

`notification_service.py` (237 lines) is over the 200-line limit. As part of this feature, extract `_test_http_channel` and `_test_email` into `services/channel_test_helpers.py`. This is a prerequisite, not optional.
