# P2: Discord Tests — Unit, Integration, Adversarial

> **Scope:** All test files for the Discord channel: unit tests for `DiscordChannel`, integration tests for the `/interactions` endpoint, adversarial security tests.
> **Depends on:** P1 (backend implementation must exist).
> **Deliverable:** 3 test files, all passing. `pytest tests/test_notifications/test_discord_channel.py tests/test_notifications/test_discord_interactions.py tests/test_adversarial/test_discord_interaction_security.py -v` green.
> **Estimated files:** 3 new.

---

## Required Reading

Read these files before writing any code:

1. `PROMPT-DISCORD-INTERACTIVE.md` — Full spec, especially "Tests to Create" section
2. `src/edictum_server/notifications/discord.py` — The implementation you're testing (from P1)
3. `src/edictum_server/routes/discord.py` — The route handler you're testing (from P1)
4. `tests/conftest.py` — Fixtures: `client`, `test_redis`, `TENANT_A_ID`, `TENANT_B_ID`, `set_auth_tenant_b`, auth overrides
5. `tests/test_notifications/test_manager.py` — Pattern: `FakeChannel`, protocol property tests
6. `tests/test_notifications/test_telegram_channel.py` — Pattern: mock httpx, verify API calls, Redis key assertions
7. `tests/test_adversarial/test_telegram_webhook_db.py` — Pattern: adversarial tests with `@pytest.mark.security`

---

## Ed25519 Test Fixture

All tests that interact with the `/api/v1/discord/interactions` endpoint need valid Ed25519 signatures. Use this fixture pattern:

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

Put the fixture in a local `conftest.py` or at the top of each test file. Use `discord_keypair` to create channels with the test `public_key_hex`, then `sign_discord_payload` to sign payloads before POSTing.

---

## Files to Create

### 1. `tests/test_notifications/test_discord_channel.py` (~80 lines)

Unit tests for `DiscordChannel`. Mock httpx — no real HTTP calls.

**Tests:**
- `test_send_approval_request_posts_embed` — mock POST, verify:
  - URL is `https://discord.com/api/v10/channels/{discord_channel_id}/messages`
  - `Authorization: Bot {bot_token}` header
  - Body has embed with title "Approval Requested", color `0xFFA500`
  - Embed fields include agent, tool, env, timeout
  - ActionRow with 3 buttons: Approve (style 3), Deny (style 4), Dashboard (style 5/Link)
  - `custom_id` format: `edictum_approve:{approval_id}` / `edictum_deny:{approval_id}`
- `test_send_approval_request_sets_redis_keys` — verify both `discord:tenant:...` and `discord:msg:...` keys set with correct TTL
- `test_send_approval_decided_patches_message` — put msg info in Redis, call `send_approval_decided`, verify PATCH called with green/red embed + empty components
- `test_send_approval_decided_fallback_on_expired_redis` — no Redis key → verify POST new message as fallback
- `test_update_expired_patches_grey_embed` — put msg info in Redis, call `update_expired`, verify PATCH with grey embed (`0x99AAB5`) + empty components
- `test_update_expired_continues_on_error` — one item fails → next item still processed
- `test_supports_interactive_is_true` — property check
- `test_close_calls_aclose` — verify `_client.aclose()` called

**Pattern:** Use `unittest.mock.AsyncMock` for the httpx client. Use `fakeredis.aioredis.FakeRedis` for Redis (same as conftest).

### 2. `tests/test_notifications/test_discord_interactions.py` (~90 lines)

Integration tests using the `client` fixture from conftest.

**Setup per test:**
1. Use `discord_keypair` fixture to get `signing_key` + `public_key_hex`
2. Create a discord channel via API: `POST /api/v1/notifications/channels` with `channel_type: "discord"`, config: `{bot_token: "test", public_key: public_key_hex, discord_channel_id: "123"}`
3. For button interaction tests: create an approval first, then seed Redis with `discord:tenant:{channel_id}:{approval_id}` and `discord:msg:{channel_id}:{approval_id}`

**Tests:**
- `test_ping_pong` — POST valid PING (type 1) with valid signature → 200, response `{"type": 1}`
- `test_button_approve_submits_decision` — POST valid button interaction (type 3, `custom_id: "edictum_approve:{approval_id}"`) with valid signature:
  - Response status 200
  - Response JSON has `type: 7` (UPDATE_MESSAGE)
  - Response embed shows approved result (green color `0x57F287`)
  - Response components is empty `[]`
  - Verify approval status updated in DB (GET the approval, check `status == "approved"`, `decided_via == "discord"`)
- `test_button_deny_submits_decision` — same flow, `edictum_deny`, verify denied status
- `test_expired_tenant_key_returns_expired_embed` — no Redis tenant key → response type 7 with grey expired embed

### 3. `tests/test_adversarial/test_discord_interaction_security.py` (~80 lines)

**Mark ALL tests with `@pytest.mark.security`.**

**Setup:** Same `discord_keypair` fixture + create a discord channel.

**Tests:**
- `test_wrong_signature_401` — sign with a different keypair → 401
- `test_missing_signature_header_401` — no `X-Signature-Ed25519` → 401
- `test_missing_timestamp_header_401` — no `X-Signature-Timestamp` → 401
- `test_malformed_signature_hex_401` — `X-Signature-Ed25519: "not-hex"` → 401
- `test_malformed_public_key_skipped` — insert a channel with `public_key: "not-hex"` in DB, then POST with valid signature from a different channel → the malformed channel is skipped, valid channel matches
- `test_no_discord_channels_401` — no discord channels in DB → 401
- `test_disabled_channel_401` — disable the channel → 401 (won't match any enabled channel)
- `test_cross_tenant_blocked` — create channel in tenant A, seed Redis tenant key with tenant B's ID → decision rejected (tenant mismatch or service rejects)
- `test_replay_already_decided` — submit decision, then replay same interaction → error response (approval already decided)
- `test_invalid_custom_id_format` — `custom_id: "random_string"` → graceful handling (no crash, type 7 or type 1 response)
- `test_invalid_approval_id` — `custom_id: "edictum_approve:not-a-uuid"` → graceful handling
- `test_expired_redis_tenant_key` — no Redis key for the approval → type 7 expired embed response

---

## Verification Checklist

### Terminal
```bash
# All tests pass
pytest tests/test_notifications/test_discord_channel.py -v
pytest tests/test_notifications/test_discord_interactions.py -v
pytest tests/test_adversarial/test_discord_interaction_security.py -v

# Security tests are properly marked
pytest tests/test_adversarial/test_discord_interaction_security.py -m security -v

# No regressions
pytest tests/ -v --timeout=30

# File sizes
wc -l tests/test_notifications/test_discord_channel.py tests/test_notifications/test_discord_interactions.py tests/test_adversarial/test_discord_interaction_security.py
```

### Code Quality
- [ ] `from __future__ import annotations` in all test files
- [ ] All adversarial tests have `@pytest.mark.security`
- [ ] No real HTTP calls — httpx mocked in unit tests, `client` fixture handles integration
- [ ] No `sleep` or flaky timing
- [ ] fakeredis used for Redis (from conftest)
- [ ] Test files under 200 lines each
- [ ] Ed25519 signatures generated correctly with PyNaCl `SigningKey`
