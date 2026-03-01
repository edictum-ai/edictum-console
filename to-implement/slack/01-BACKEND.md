# Prompt: Slack Interactive — P1 Backend

> **Scope:** SlackAppChannel, interaction route, manifest endpoint, service split, loader + schema wiring.
> **Depends on:** Notification channels backend (done). `docs/slack-app-manifest.json` (done).
> **Deliverable:** `slack_app` channel type works end-to-end via API. `GET /api/v1/slack/manifest` returns pre-filled manifest. Interaction endpoint processes button clicks.
> **Budget:** ~6 files new/modified

---

## Required Reading (read ALL before coding)

1. `PROMPT-SLACK-INTERACTIVE.md` — full spec (sections: Config Shape, Redis Key Pattern, Channel Lookup by Signing Secret, Architecture Notes)
2. `src/edictum_server/notifications/telegram.py` — gold standard: constructor, `send_approval_request`, `send_approval_decided`, `update_expired`, Redis keys
3. `src/edictum_server/routes/telegram.py` — gold standard: webhook handler, `_process_callback`, SSE push, cross-channel notify
4. `src/edictum_server/notifications/loader.py` — `_build_channel` factory pattern
5. `src/edictum_server/services/notification_service.py` — `REQUIRED_CONFIG`, `test_channel`, `_test_http_channel` (will be split out)
6. `src/edictum_server/schemas/notifications.py` — `channel_type` Literal
7. `src/edictum_server/main.py` — router includes, timeout worker (`_approval_timeout_worker` uses `hasattr(ch, "update_expired")`)
8. `src/edictum_server/config.py` — `EDICTUM_BASE_URL` access pattern
9. `docs/slack-app-manifest.json` — manifest template to serve from API

---

## Shared Modules — Import, Don't Redefine

| Need | Import from | NOT |
|------|-------------|-----|
| `NotificationChannel` ABC | `notifications.base` | Redefine |
| `NotificationManager` | `notifications.base` | Access channels differently |
| `approval_service.submit_decision` | `services.approval_service` | Inline approval logic |
| `PushManager` | `request.app.state.push_manager` | Create new instance |
| `NotificationManager` | `request.app.state.notification_manager` | Create new instance |
| `get_db` dependency | `db.session` | Create DB sessions manually |
| Redis | Constructor injection (same as Telegram) | Global import |

---

## Step 1: Split `notification_service.py`

**Before adding any slack_app code**, split the file:

### Create: `src/edictum_server/services/channel_test_helpers.py` (~80 lines)

Move these functions out of `notification_service.py`:
- `_test_http_channel(client, channel_type, config)` → rename to `test_http_channel`
- `_test_email(config)` → rename to `test_email`

Both become public (no underscore) since they're now in their own module.

### Modify: `src/edictum_server/services/notification_service.py`

- Remove the moved functions
- Add: `from edictum_server.services.channel_test_helpers import test_http_channel, test_email`
- Update `test_channel` to call `test_http_channel` and `test_email` (same logic, just imported)
- Verify file is under 200 lines after the split

---

## Step 2: Create `SlackAppChannel`

### Create: `src/edictum_server/notifications/slack_app.py` (~150 lines)

```python
from __future__ import annotations
```

**Constructor:** `bot_token`, `signing_secret`, `slack_channel`, `base_url`, `channel_name`, `channel_id`, `filters`, `redis`. Creates persistent `httpx.AsyncClient(timeout=10.0)`.

**`send_approval_request`:**
- POST `https://slack.com/api/chat.postMessage` with `Authorization: Bearer {bot_token}`
- Body: `{"channel": self._slack_channel, "blocks": [...]}`
- Block Kit structure:
  - Header block: `"Approval Requested"`
  - Section with fields: `*Agent:*\n{agent_id}`, `*Tool:*\n{tool_name}`, `*Environment:*\n{environment}`, `*Timeout:*\n{timeout_seconds}s`
  - Section: message text (if present)
  - Actions block: Approve button (`action_id: f"edictum_approve:{approval_id}"`, style `"primary"`) + Deny button (`action_id: f"edictum_deny:{approval_id}"`, style `"danger"`)
  - Context block: `"Or review in dashboard: <{base_url}/dashboard/approvals?id={approval_id}|Open in Edictum>"`
- Extract `ts` from response: `data["ts"]`
- Store Redis keys (both with TTL = `timeout_seconds + 60`):
  - `slack:tenant:{channel_id}:{approval_id}` → `tenant_id`
  - `slack:msg:{channel_id}:{approval_id}` → `json.dumps({"slack_channel": self._slack_channel, "ts": ts})`

**`send_approval_decided`:**
- Read `slack:msg:{channel_id}:{approval_id}` from Redis
- If found: POST `https://slack.com/api/chat.update` with `{"channel": msg_info["slack_channel"], "ts": msg_info["ts"], "blocks": [updated blocks without action buttons]}`
- If not found: POST `chat.postMessage` with plain text fallback (emoji + status + decided_by)

**`update_expired(expired_items)`:**
- For each `(approval_id, ...)` in items:
  - Read `slack:msg:{channel_id}:{approval_id}` from Redis
  - If found: `chat.update` with "EXPIRED" header, no buttons
  - Catch exceptions per-item, log and continue

**`update_decision(approval_id, status, decided_by)`:**
- Thin wrapper: calls `send_approval_decided`

**Properties:** `name`, `supports_interactive` (True), `filters`, `channel_id`, `signing_secret` (exposed for route lookup)

**`close`:** `await self._client.aclose()`

---

## Step 3: Create interaction route

### Create: `src/edictum_server/routes/slack.py` (~140 lines)

```python
from __future__ import annotations
```

**`POST /api/v1/slack/interactions`:**

1. `body = await request.body()`
2. Get headers: `timestamp = request.headers.get("x-slack-request-timestamp")`, `signature = request.headers.get("x-slack-signature")`
3. If either header missing → 403
4. If `abs(time.time() - int(timestamp)) > 300` → 403 (replay protection)
5. Query DB: `SELECT * FROM notification_channels WHERE channel_type = 'slack_app' AND enabled = true`
6. For each channel: compute `sig_basestring = f"v0:{timestamp}:{body.decode()}"`, then `expected = "v0=" + hmac.new(signing_secret.encode(), sig_basestring.encode(), hashlib.sha256).hexdigest()`. If `hmac.compare_digest(expected, signature)` → match found.
7. If no match → 403
8. Decode body: `decoded = parse_qs(body.decode())`
9. **URL verification**: if `"challenge"` in decoded or body starts with `{` and contains `"type": "url_verification"` → parse JSON, return `{"challenge": payload["challenge"]}`
10. Parse payload: `payload = json.loads(decoded["payload"][0])`
11. Extract action: `action = payload["actions"][0]`, parse `action_id` as `f"edictum_{decision}:{approval_id}"`
12. Validate: decision must be `"approve"` or `"deny"`, approval_id must be valid UUID
13. Get tenant from Redis: `slack:tenant:{channel_id}:{approval_id}` (channel_id = str(db_channel.id))
14. If no tenant → return 200 with error text (approval expired or already handled)
15. `decided_by = f"slack:{payload['user']['username']}"`
16. Call `approval_service.submit_decision(db, tenant_id, approval_id, decision, decided_by, decided_via="slack")`
17. Commit, push SSE events (approval_decided to env + dashboard channels)
18. `asyncio.create_task(notification_mgr.notify_approval_decided(...))`
19. Respond with `JSONResponse({"replace_original": True, "blocks": [result blocks]})`

**`GET /api/v1/slack/manifest`:**

1. Read `EDICTUM_BASE_URL` from config (or `request.base_url` as fallback)
2. Build manifest dict (copy structure from `docs/slack-app-manifest.json`)
3. Set `settings.interactivity.request_url` to `f"{base_url}/api/v1/slack/interactions"`
4. Return `JSONResponse(manifest)`
5. No auth required

---

## Step 4: Wire everything

### Modify: `src/edictum_server/notifications/loader.py`

Add `slack_app` branch in `_build_channel` (after existing `slack` branch):

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

### Modify: `src/edictum_server/services/notification_service.py`

Add to `REQUIRED_CONFIG`:
```python
REQUIRED_CONFIG["slack_app"] = ["bot_token", "signing_secret", "slack_channel"]
```

### Modify: `src/edictum_server/services/channel_test_helpers.py` (the new file from Step 1)

Add `slack_app` branch in `test_http_channel`:
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

### Modify: `src/edictum_server/schemas/notifications.py`

Add `"slack_app"` to every `channel_type` Literal in the file:
```python
Literal["telegram", "slack", "webhook", "email", "slack_app"]
```

### Modify: `src/edictum_server/main.py`

Add router:
```python
from edictum_server.routes import slack
app.include_router(slack.router)
```

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/` passes
- [ ] `pytest tests/` — all existing tests still pass (no regressions)
- [ ] `notification_service.py` is under 200 lines
- [ ] `slack_app.py` is under 200 lines
- [ ] `routes/slack.py` is under 200 lines
- [ ] `channel_test_helpers.py` is under 200 lines
- [ ] All new files have `from __future__ import annotations`

### API (curl or test client)
- [ ] `POST /api/v1/notifications` with `channel_type: "slack_app"` + valid config → 201
- [ ] `POST /api/v1/notifications` with `channel_type: "slack_app"` + missing `signing_secret` → 422
- [ ] `GET /api/v1/slack/manifest` → 200, JSON with correct `request_url` containing base URL
- [ ] Existing `slack` webhook channels still create/work (no regression)

### Code Quality
- [ ] No `Any` types
- [ ] `close()` called on httpx client
- [ ] Services don't import from routes
- [ ] No duplicated utility functions
