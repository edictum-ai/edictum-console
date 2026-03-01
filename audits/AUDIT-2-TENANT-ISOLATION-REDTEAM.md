# Audit 2 — Tenant Isolation Red Team (Highest Priority)

**Context:** This is the #1 ship-blocker category. A cross-tenant data leak in a security product
is not a bug — it's a catastrophic trust failure. If an agent from org A can read contracts,
events, or approvals from org B, the product cannot ship. Full stop.

**Your job:** Actively try to break tenant isolation. Think like an attacker.
Document every attempt and its result. Save findings to `audits/results/AUDIT-2-results.md`.

---

## Setup

```bash
cd ~/workspace/edictum-console
source .venv/bin/activate

# Run ONLY tenant isolation tests first
pytest tests/test_adversarial/test_s3_tenant_isolation.py tests/test_adversarial/test_s3_settings_isolation.py -v --tb=long 2>&1 | tee audits/results/tenant-isolation-tests.txt
```

Any failure here is a **deploy stop**. Do not continue until all pass.

---

## Manual Red Team: Every Endpoint

The test suite covers the endpoints it was written for. Your job is to cover the rest.

### Setup: create two tenants and two API keys

Read `tests/conftest.py` to understand how TENANT_A_ID and TENANT_B_ID are set up.
Replicate this locally or against the staging database, creating:
- Tenant A with API key A
- Tenant B with API key B
- Data belonging only to Tenant A: an event, a bundle, an approval, an API key

### Attack list — attempt each with Tenant B's key targeting Tenant A's data

For each attack, record: endpoint, method, payload, expected response, actual response, PASS/FAIL.

**Events:**
```
GET /api/v1/events?agent_id=<tenant_A_agent>      # filter bypass attempt
GET /api/v1/events/<tenant_A_event_id>            # direct ID access
GET /api/v1/events?limit=1000&offset=0            # pagination leak
```

**Approvals:**
```
GET  /api/v1/approvals/<tenant_A_approval_id>     # direct read
PUT  /api/v1/approvals/<tenant_A_approval_id>     # approve/deny cross-tenant
GET  /api/v1/approvals?status=pending             # list leak
```

**Bundles:**
```
GET  /api/v1/bundles                              # list leak
GET  /api/v1/bundles/<tenant_A_bundle_name>       # direct read
POST /api/v1/bundles/<tenant_A_bundle_name>/deploy # deploy cross-tenant bundle
```

**API Keys:**
```
GET  /api/v1/keys                                 # should return only B's keys
POST /api/v1/keys/<tenant_A_key_id>/revoke        # revoke another tenant's key
```

**SSE Stream:**
```
GET /api/v1/stream?env=production                 # with B's key — should only receive B's events
# Trigger an event for tenant A, confirm B's SSE connection does NOT receive it
```

**Stats:**
```
GET /api/v1/stats/overview                        # aggregate counts — should be A's data only
```

**Settings:**
```
GET  /api/v1/settings/signing-key                 # B cannot read A's signing key
POST /api/v1/settings/signing-key/rotate          # B cannot rotate A's key
GET  /api/v1/notifications/channels               # B cannot see A's Telegram config
```

### Attack: tenant_id in request body

For every POST/PUT endpoint that accepts JSON, try including `tenant_id` in the body
set to tenant A's ID while authenticated as tenant B:

```json
{
  "tenant_id": "<tenant_A_uuid>",
  ... normal payload ...
}
```

The server must ignore this field entirely — the tenant context must come only from the auth token.

### Attack: UUID enumeration

Pick valid resource IDs from tenant A. Try accessing them via B's session or API key.
The response MUST be 404 (not 403). A 403 leaks that the resource exists.

### Attack: mixed auth

Try sending both a dashboard session cookie (from tenant A's login) and
an API key (from tenant B) in the same request. Which tenant wins?
This MUST be an error or use a consistent precedence that is documented.

### Attack: notification channel cross-tenant action

```
POST /api/v1/notifications/channels/<tenant_A_channel_id>/test
```
With tenant B's auth. Should 404, not send a test notification to A's Telegram.

---

## Report format

```
# Audit 2 Results — Tenant Isolation Red Team

## Test Suite Results
- Passed: X / Total: X
- Failed tests: (list each with traceback excerpt)

## Manual Attack Results

| Endpoint | Method | Attack | Expected | Actual | Result |
|----------|--------|--------|----------|--------|--------|
| ...      | ...    | ...    | 404      | 404    | ✅ PASS |

## Ship-blockers
(Any ✅ FAIL result is a ship-blocker — list with full details)

## Observations
(Near-misses, inconsistencies, things that passed but felt fragile)
```
