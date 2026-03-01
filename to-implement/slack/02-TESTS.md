# Prompt: Slack Interactive — P2 Tests

> **Scope:** Unit tests for SlackAppChannel, integration tests for interaction endpoint + manifest, adversarial security tests.
> **Depends on:** P1 Backend (SlackAppChannel, routes/slack.py, service wiring — all done).
> **Deliverable:** All Slack App tests pass. `pytest tests/ -v` green. `pytest -m security` includes new adversarial tests.
> **Budget:** 3 test files

---

## Required Reading (read ALL before coding)

1. `PROMPT-SLACK-INTERACTIVE.md` — full spec (sections: Redis Key Pattern, Verification Checklist, Tests to Create)
2. `src/edictum_server/notifications/slack_app.py` — the channel being tested
3. `src/edictum_server/routes/slack.py` — the route being tested
4. `tests/conftest.py` — fixtures: `client`, `db_session`, `fake_redis`, `push_manager`, `TENANT_A_ID`, `TENANT_B_ID`, `set_auth_tenant_b`
5. `tests/test_notifications/test_slack_channel.py` — existing Slack webhook channel tests (pattern reference for mocking httpx)
6. `tests/test_adversarial/test_telegram_webhook_db.py` — pattern reference for adversarial webhook tests (signature, disabled channel, etc.)
7. `tests/test_notifications/test_slack_interactions.py` — if already exists from P1, read for context

---

## Shared Test Patterns — Follow These

| Pattern | How | Reference |
|---------|-----|-----------|
| Mock httpx POST | `AsyncMock` on `channel._client.post`, return `MagicMock(json=lambda: {"ok": True, "ts": "123.456"}, raise_for_status=MagicMock())` — **must include `"ok": True`**, `send_approval_request` raises `RuntimeError` if `ok` is falsy | `test_slack_channel.py` |
| Fake Redis | `fake_redis` fixture from conftest (fakeredis) | `conftest.py` |
| Create channel in DB | `POST /api/v1/notifications` via `client` fixture | `test_telegram_webhook_db.py` |
| Slack interaction payload | Build `application/x-www-form-urlencoded` body with `payload` field containing JSON | Slack docs (see template below) |
| HMAC signature | Compute `v0:{timestamp}:{body}` with the channel's signing secret | `PROMPT-SLACK-INTERACTIVE.md` |
| `@pytest.mark.security` | Required on ALL adversarial tests | `test_telegram_webhook_db.py` |
| `from __future__ import annotations` | Required in ALL new test files | `CONVENTIONS.md` |

---

## File 1: `tests/test_notifications/test_slack_app_channel.py` (~90 lines)

Unit tests for `SlackAppChannel`. Mock httpx — no real network calls.

### Setup

```python
@pytest.fixture
def channel(fake_redis):
    ch = SlackAppChannel(
        bot_token="xoxb-test-token",
        signing_secret="test-secret",
        slack_channel="#test-channel",
        base_url="http://localhost:8000",
        channel_name="Test Slack App",
        channel_id="ch-uuid-123",
        redis=fake_redis,
    )
    ch._client = AsyncMock()
    return ch
```

### Tests

1. **`test_send_approval_request_posts_block_kit`**
   - Call `send_approval_request(...)` with mock approval data
   - Assert `_client.post` called with URL `https://slack.com/api/chat.postMessage`
   - Assert `Authorization: Bearer xoxb-test-token` header
   - Assert payload has `"channel": "#test-channel"`
   - Assert blocks contain Approve button with `action_id` matching `edictum_approve:{approval_id}`
   - Assert blocks contain Deny button with `action_id` matching `edictum_deny:{approval_id}`
   - Assert deep link in context block

2. **`test_send_approval_request_stores_redis_keys`**
   - Call `send_approval_request(...)` with `timeout_seconds=120`
   - Assert `slack:tenant:ch-uuid-123:{approval_id}` exists in Redis with value = tenant_id
   - Assert `slack:msg:ch-uuid-123:{approval_id}` exists in Redis with JSON containing `slack_channel` and `ts`
   - Assert TTL on both keys is ~180 (120 + 60)

3. **`test_send_approval_decided_edits_message`**
   - Pre-set Redis key `slack:msg:ch-uuid-123:{approval_id}` with `{"slack_channel": "#test", "ts": "123.456"}`
   - Call `send_approval_decided(...)`
   - Assert `_client.post` called with URL `https://slack.com/api/chat.update`
   - Assert payload has `"channel": "#test"`, `"ts": "123.456"`
   - Assert no action buttons in updated blocks

4. **`test_send_approval_decided_falls_back_to_new_message`**
   - Do NOT set Redis key (simulates expired key)
   - Call `send_approval_decided(...)`
   - Assert `_client.post` called with URL `https://slack.com/api/chat.postMessage` (not `chat.update`)

5. **`test_update_expired_edits_messages`**
   - Pre-set Redis key for an approval
   - Call `update_expired([{"id": approval_id, "agent_id": "agent-1", "tool_name": "some_tool"}])` — list of dicts with `"id"` key, NOT tuples
   - Assert `chat.update` called with "EXPIRED" in blocks

6. **`test_supports_interactive`**
   - Assert `channel.supports_interactive is True`

7. **`test_close`**
   - Call `await channel.close()`
   - Assert `_client.aclose` was called

---

## File 2: `tests/test_notifications/test_slack_interactions.py` (~100 lines)

Integration tests using the `client` fixture. Tests the full route handler.

> **Before writing:** Read `tests/conftest.py` to understand how Redis is wired into the test app state. The integration tests need to pre-seed `slack:tenant:{channel_id}:{approval_id}` before POSTing an interaction. Check whether the test app uses `app.state.redis` (fakeredis injected via lifespan override) or a separate `fake_redis` fixture — the seeding approach differs.

### Helpers

```python
def build_interaction_body(approval_id: str, action: str = "approve", username: str = "testuser") -> tuple[bytes, str]:
    """Build a Slack interaction payload and compute its signature."""
    payload = {
        "type": "block_actions",
        "user": {"id": "U123", "username": username},
        "actions": [{"action_id": f"edictum_{action}:{approval_id}"}],
        "response_url": "https://hooks.slack.com/actions/...",
    }
    body = urlencode({"payload": json.dumps(payload)}).encode()
    return body

def sign_body(signing_secret: str, body: bytes, timestamp: str | None = None) -> tuple[str, str]:
    """Compute Slack signature headers."""
    ts = timestamp or str(int(time.time()))
    sig_base = f"v0:{ts}:{body.decode()}"
    sig = "v0=" + hmac.new(signing_secret.encode(), sig_base.encode(), hashlib.sha256).hexdigest()
    return ts, sig
```

### Tests

1. **`test_slack_interaction_approve`**
   - Create `slack_app` channel via API (store the signing_secret in config)
   - Create an approval via API
   - Set Redis key `slack:tenant:{channel_id}:{approval_id}` → tenant_id
   - Build interaction body + sign it
   - POST to `/api/v1/slack/interactions` with correct headers
   - Assert 200 with `replace_original: true`
   - Verify approval status changed to "approved" in DB

2. **`test_slack_interaction_deny`**
   - Same as above but with `action: "deny"`
   - Verify approval status changed to "denied"

3. **`test_manifest_endpoint`**
   - `GET /api/v1/slack/manifest`
   - Assert 200
   - Assert response JSON has `settings.interactivity.request_url` ending with `/api/v1/slack/interactions`
   - Assert `oauth_config.scopes.bot` contains `"chat:write"`
   - Assert `display_information.name` is `"Edictum Approvals"`

> **Note:** `test_url_verification_challenge` was removed. The `url_verification` challenge is only sent to Events API subscription URLs, not to Interactivity Request URLs. The handler was removed from `routes/slack.py` as dead code.

---

## File 3: `tests/test_adversarial/test_slack_interaction_security.py` (~90 lines)

All tests marked with `@pytest.mark.security`.

### Setup

Each test that needs a channel: create a `slack_app` channel via API first, extract its `signing_secret` from config.

### Tests

1. **`test_wrong_signature_rejected`**
   - Create channel
   - Build valid body but sign with wrong secret
   - POST → assert 403

2. **`test_expired_timestamp_rejected`**
   - Create channel
   - Build valid body, sign correctly, but use timestamp from 10 minutes ago
   - POST → assert 403

3. **`test_missing_signature_header_rejected`**
   - Create channel
   - POST without `X-Slack-Signature` header → assert 403

4. **`test_missing_timestamp_header_rejected`**
   - Create channel
   - POST without `X-Slack-Request-Timestamp` header → assert 403

5. **`test_no_slack_app_channels_rejects`**
   - Don't create any channels
   - POST with arbitrary signature → assert 403

6. **`test_disabled_channel_not_matched`**
   - Create channel, then disable it via API
   - Sign with that channel's secret
   - POST → assert 403 (disabled channels excluded from lookup)

7. **`test_cross_tenant_blocked`**
   - Create channel in tenant A
   - Create approval in tenant A, set Redis key with tenant A
   - Switch to tenant B auth
   - Verify the approval cannot be actioned through tenant B's context
   - (The signing secret lookup finds tenant A's channel, Redis returns tenant A, decision goes to tenant A's approval — this is actually correct behavior. The real cross-tenant risk is if tenant B could CREATE a channel with a known signing secret to intercept tenant A's interactions — but signing secrets are unique per Slack App, so this can't happen.)

8. **`test_replay_already_decided`**
   - Create channel + approval
   - Submit first interaction → 200 (approved)
   - Submit same interaction again → should handle gracefully (approval already decided, not crash)

9. **`test_expired_approval_no_redis_key`**
   - Create channel
   - POST valid interaction with approval_id that has no Redis key (simulates expiry)
   - Assert graceful response (200 with error text, not 500)

---

## Verification Checklist

- [ ] `pytest tests/test_notifications/test_slack_app_channel.py -v` — all pass
- [ ] `pytest tests/test_notifications/test_slack_interactions.py -v` — all pass
- [ ] `pytest tests/test_adversarial/test_slack_interaction_security.py -v` — all pass
- [ ] `pytest -m security -v` — includes all new adversarial tests
- [ ] `pytest tests/ -v` — full suite green, no regressions
- [ ] `ruff check tests/` passes
- [ ] All test files have `from __future__ import annotations`
- [ ] No real network calls in any test (all mocked or using test client)
- [ ] No `time.sleep` in tests
