# Audit 1 — Backend Security: All 8 Boundaries

**Context:** edictum-console is a security product that governs AI agents in production.
A bug here doesn't break a feature — it breaks the security guarantee for every agent using this tool.
The owner's job and startup reputation depend on this being airtight.

**Your job:** Run the full security test suite, then manually audit each boundary.
Save your findings to `audits/results/AUDIT-1-results.md`.

---

## Setup

```bash
cd ~/workspace
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console

python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

---

## Step 1 — Run the full security test suite

```bash
pytest -m security -v --tb=short 2>&1 | tee audits/results/pytest-security.txt
```

Count: how many passed, how many failed, how many skipped.
Any failure is a **ship-blocker**. Report each one with the full traceback.

---

## Step 2 — Static analysis

```bash
# Bandit — find real security bugs (B-severity and above)
bandit -r src/ -ll -ii --exclude tests/ -f txt 2>&1 | tee audits/results/bandit.txt

# Mypy — type safety (untyped code is security risk in auth paths)
mypy src/ --strict 2>&1 | tee audits/results/mypy.txt

# Ruff — linting
ruff check src/ 2>&1 | tee audits/results/ruff.txt
```

---

## Step 3 — Manual boundary audit

For each boundary below, read the relevant source file and answer the listed questions.
Be specific: quote the line numbers where you find issues.

### S1 — Session cookie validation (`src/edictum_server/auth/local.py`, `auth/dependencies.py`)
- Is the session token verified with a cryptographic check (HMAC or signing), not just a DB lookup?
- Is the cookie set with `HttpOnly=True`, `Secure=True`, `SameSite=Strict`?
- Can a tampered or expired token ever return 200?
- Is there any path that accepts a session token AND an API key simultaneously with ambiguous precedence?

### S2 — API key resolution (`src/edictum_server/auth/dependencies.py`, `services/api_key_service.py`)
- Is the key looked up by prefix then verified with bcrypt? Confirm there is NO plaintext comparison anywhere.
- Is a revoked key (`revoked_at IS NOT NULL`) ever allowed through?
- Is there a timing attack risk — does a wrong key fail at the same speed as a correct-but-revoked key?
- What happens with: empty string, key with no prefix, `edk_` with nothing after, 10,000-char key?

### S3 — Tenant scoping (`src/edictum_server/routes/*.py`, `services/*.py`)
- Open every route file. For every SELECT/INSERT/UPDATE/DELETE, confirm `tenant_id` is in the WHERE clause.
- Can `tenant_id` ever be set from the request body instead of the auth context?
- Do error responses reveal resource existence across tenants? (Must be 404, not 403, for cross-tenant.)
- List every endpoint. Mark each: ✅ scoped / ❌ not scoped / ⚠️ needs review.

### S4 — Approval state transitions (`src/edictum_server/services/approval_service.py`)
- What are the valid state transitions? Draw the state machine.
- Can a `denied` approval be re-approved?
- Can a `timeout` approval be approved after the fact?
- Is there a TOCTOU window where two concurrent approvals could race?
- Can an agent approve its own pending approval by sending the right API call?

### S5 — SSE channel authorization (`src/edictum_server/routes/stream.py`)
- Can an agent with key from tenant A subscribe to events from tenant B?
- What happens if the agent connects with a valid key but provides a `bundle_name` belonging to another tenant?
- Is there any broadcast path that could leak events cross-tenant?

### S6 — Bundle signature verification (`src/edictum_server/services/signing_service.py`)
- Is signature verification enforced on every bundle deployment path?
- What happens if `signature` field is missing, empty bytes, or all zeros?
- Can a bundle be uploaded without a signature and then deployed?
- Is the Ed25519 verification using a constant-time comparison?

### S7 — Admin bootstrap lock (`src/edictum_server/main.py`)
- Can the bootstrap endpoint be called after an admin already exists?
- What happens if you send two bootstrap requests simultaneously (race condition)?
- Is the lock check atomic?

### S8 — Rate limiting (`src/edictum_server/routes/auth.py`)
- Is rate limiting applied to `/api/v1/auth/login`?
- What is the limit? Is it per-IP, per-email, or global?
- Can the limit be bypassed with `X-Forwarded-For` header spoofing?
- What happens after the limit is hit — 429 with Retry-After, or silent drop?

---

## Step 4 — Attack surface enumeration

```bash
# List all routes — anything missing auth?
grep -r "router\.\(get\|post\|put\|delete\|patch\)" src/edictum_server/routes/ \
  | grep -v "Depends(require_" \
  | grep -v "health" \
  | grep -v "__init__"
```

For each route that appears without an auth dependency, verify it is intentionally public.
Any route that touches tenant data without auth is a **ship-blocker**.

---

## Step 5 — Check for secrets in source

```bash
# Hardcoded secrets, tokens, passwords
grep -rn "password\s*=\s*['\"][^'\"]\|secret\s*=\s*['\"][^'\"]\|token\s*=\s*['\"][^'\"]" \
  src/ --include="*.py" | grep -v test | grep -v ".env"

# Check git history for accidentally committed secrets
git log --all --full-history -- "*.env" "*.key" "*.pem"
git log --oneline | head -20
# For each commit, spot-check: git show <hash> --stat
```

---

## Report format

Save to `audits/results/AUDIT-1-results.md`:

```
# Audit 1 Results — Backend Security

## Test Suite
- Total security tests: X
- Passed: X
- Failed: X (list each)

## Static Analysis
- Bandit issues: X (list HIGH/MEDIUM)
- Mypy errors: X
- Ruff errors: X

## Boundary Findings
### S1: [PASS/FAIL/WARN] — notes
### S2: [PASS/FAIL/WARN] — notes
### S3: [PASS/FAIL/WARN] — notes
### S4: [PASS/FAIL/WARN] — notes
### S5: [PASS/FAIL/WARN] — notes
### S6: [PASS/FAIL/WARN] — notes
### S7: [PASS/FAIL/WARN] — notes
### S8: [PASS/FAIL/WARN] — notes

## Ship-blockers
(List anything that is a hard blocker before this goes to more users)

## Recommendations
(Prioritized list of everything else)
```
