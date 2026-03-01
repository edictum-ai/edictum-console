# P1: Discord Backend — Channel + Route + Wiring

> **Scope:** `DiscordChannel` notification class, `/api/v1/discord/interactions` route, loader/service/schema wiring.
> **Depends on:** Nothing (first prompt in sequence).
> **Deliverable:** A working Discord channel type — create via API, PING/PONG handshake works, approval requests post embeds, button clicks submit decisions, cross-channel notifications update messages.
> **Estimated files:** 2 new, 4 modified.

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — DDD rules, async everywhere, 200-line limit, tenant isolation, type hints
2. `PROMPT-DISCORD-INTERACTIVE.md` — Full spec (sections 1–6 are in scope for this prompt)
3. `src/edictum_server/notifications/telegram.py` — Gold standard: Redis key pattern, `send_approval_request`, `send_approval_decided`, `update_expired`, `update_decision`, `close()`
4. `src/edictum_server/routes/telegram.py` — Gold standard: signature verification, `_process_callback`, SSE push, `notify_approval_decided` background task
5. `src/edictum_server/notifications/base.py` — `NotificationChannel` ABC, `NotificationManager`
6. `src/edictum_server/notifications/loader.py` — `_build_channel` factory
7. `src/edictum_server/services/notification_service.py` — `REQUIRED_CONFIG`, `_test_http_channel`
8. `src/edictum_server/schemas/notifications.py` — `channel_type` Literal
9. `src/edictum_server/main.py` — Router includes

---

## Shared Modules — Import, Don't Duplicate

| Need | Import from | Do NOT redefine |
|------|------------|-----------------|
| `NotificationChannel` ABC | `notifications.base` | Don't create a new ABC |
| Redis client type | `redis.asyncio.Redis` | — |
| `httpx.AsyncClient` | `httpx` | — |
| `VerifyKey`, `BadSignatureError` | `nacl.signing`, `nacl.exceptions` | — |
| `approval_service.submit_decision` | `services.approval_service` | Don't add decision logic in the route |
| `PushManager` | Use `request.app.state.push_manager` | — |
| `NotificationManager` | Use `request.app.state.notification_manager` | — |

---

## Files to Create

### 1. `src/edictum_server/notifications/discord.py` (~160 lines)

Follow the Telegram pattern exactly. Key differences:

- **Constructor:** `bot_token`, `public_key`, `discord_channel_id`, `base_url`, `channel_name`, `channel_id`, `filters`, `redis`
- **API base:** `https://discord.com/api/v10`
- **Auth header:** `Authorization: Bot {bot_token}` (not in URL path like Telegram)
- **Send:** POST to `/channels/{discord_channel_id}/messages` with embed + ActionRow components
- **Edit:** PATCH to `/channels/{discord_channel_id}/messages/{message_id}`
- **Redis keys:** `discord:tenant:{channel_id}:{approval_id}`, `discord:msg:{channel_id}:{approval_id}`
- **Embed colors:** `0xFFA500` (request/amber), `0x57F287` (approved/green), `0xED4245` (denied/red), `0x99AAB5` (expired/grey)
- **Components:** ActionRow (type 1) with Approve (style 3), Deny (style 4), Dashboard link (style 5)
- **`custom_id` format:** `edictum_approve:{approval_id}`, `edictum_deny:{approval_id}`
- **`update_expired` signature:** `async def update_expired(self, expired_items: list[dict[str, str]]) -> None` — each item has `approval_id`
- **`supports_interactive`:** `True`
- **`close()`:** `await self._client.aclose()`

Must have `from __future__ import annotations` at top.

### 2. `src/edictum_server/routes/discord.py` (~130 lines)

Single endpoint: `POST /api/v1/discord/interactions` — no auth dependency (auth via Ed25519 signature).

**Flow:**
1. `body = await request.body()`
2. Get `X-Signature-Ed25519` and `X-Signature-Timestamp` headers → 401 if missing
3. Query all enabled `discord` channels: `select(NotificationChannel).where(channel_type == "discord", enabled == True)`
4. For each channel, try `verify_discord_signature(config["public_key"], timestamp, body, signature)` — first success identifies the channel → 401 if none match
5. Parse body JSON
6. If `type == 1` → return `JSONResponse({"type": 1})` (PONG)
7. If `type == 3` (MESSAGE_COMPONENT):
   - Parse `custom_id`: split on `:` → action + approval_id
   - Ignore if not `edictum_approve` or `edictum_deny`, or if approval_id is not a valid UUID
   - Redis lookup: `discord:tenant:{channel_id}:{approval_id}` → tenant_id
   - **If tenant key not found:** respond type 7 with expired embed (grey `0x99AAB5`, "Approval Expired", empty components)
   - Extract username: `body_json.get("member", {}).get("user", {}).get("username") or body_json.get("user", {}).get("username", "unknown")`
   - `approval_service.submit_decision(db, tenant_id, approval_id, approved=..., decided_by=f"discord:{username}", decided_via="discord")`
   - Push SSE events via `push_manager`
   - Background task: `notification_mgr.notify_approval_decided(...)`
   - Respond type 7: updated embed + empty components
8. Unknown type → `JSONResponse({"type": 1})`

**Put `verify_discord_signature` as a module-level function**, not in the route handler. Same pattern as Telegram's secret token check being separate from the route.

Must have `from __future__ import annotations` at top.

---

## Files to Modify

### 3. `src/edictum_server/notifications/loader.py`

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

No startup registration needed (unlike Telegram's `_register_webhook_if_telegram`).

### 4. `src/edictum_server/services/notification_service.py`

- Add `REQUIRED_CONFIG["discord"] = ["bot_token", "public_key", "discord_channel_id"]`
- Add `discord` test case in `_test_http_channel`:
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

### 5. `src/edictum_server/schemas/notifications.py`

Update `CreateChannelRequest.channel_type`:
```python
channel_type: Literal["telegram", "slack", "webhook", "email", "discord"]
```

### 6. `src/edictum_server/main.py`

Add router:
```python
from edictum_server.routes import discord
app.include_router(discord.router)
```

No startup hook needed — Discord's Interactions Endpoint URL is configured by the user in the Developer Portal.

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/edictum_server/notifications/discord.py src/edictum_server/routes/discord.py` — passes
- [ ] `python -c "from edictum_server.notifications.discord import DiscordChannel; print('ok')"` — imports clean
- [ ] `python -c "from edictum_server.routes.discord import router; print(router.routes)"` — route registered
- [ ] No file exceeds 200 lines: `wc -l src/edictum_server/notifications/discord.py src/edictum_server/routes/discord.py`

### Code Quality
- [ ] `from __future__ import annotations` in both new files
- [ ] No `Any` types
- [ ] `close()` on httpx client in `DiscordChannel`
- [ ] All methods use explicit params (no `**kwargs`)
- [ ] Services don't import from routes
- [ ] Route handler is thin — delegates to `approval_service` for decision logic
- [ ] Ed25519 verification uses `nacl.signing.VerifyKey` (PyNaCl already in pyproject.toml)

### Functional (via pytest — tested in P2)
- [ ] Creating a discord channel via API returns 201
- [ ] PING/PONG works with valid signature
- [ ] Button click submits decision
- [ ] Expired tenant key returns expired embed
