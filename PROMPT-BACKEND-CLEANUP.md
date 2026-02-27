# Backend Cleanup for Ship

> Worktree session: Fix all backend ship-blockers before first GitHub publish.

## Context

Read first:
- `CLAUDE.md` — project rules, coding standards, adversarial testing discipline
- `SDK_COMPAT.md` — API contract the SDK expects

## Setup

```bash
cd /Users/acartagena/project/edictum-console
# Postgres + Redis must be running (docker compose up -d db redis)
```

## Tasks

### 1. Remove Hardcoded Neon Credentials (CRITICAL)

**File:** `scripts/seed_test_data.py` lines 60-64

There is a hardcoded Neon database URL with username and password:
```python
DEFAULT_SOURCE_URL = (
    "postgresql://neondb_owner:npg_wGdaiRkrWX04"
    "@ep-late-dream-agfsw82e-pooler.c-2.eu-central-1.aws.neon.tech"
    "/neondb?ssl=require"
)
```

**Fix:** Replace with a required CLI argument or env var. The script should fail with a clear error if no source URL is provided. Example:

```python
import os
import sys

SOURCE_URL = os.environ.get("SEED_SOURCE_URL")
if not SOURCE_URL:
    print("Error: Set SEED_SOURCE_URL environment variable to the source database URL")
    sys.exit(1)
```

Also search the ENTIRE repo for any other hardcoded credentials, connection strings, or API keys. Check:
- All files in `scripts/`
- `.env` (should NOT exist in git — verify `.gitignore` covers it)
- `docker-compose.yml` and `docker-compose.override.yml`
- Any test fixtures

### 2. Add `@pytest.mark.security` to All Adversarial Tests

The 43 adversarial tests in `tests/test_adversarial/` are missing the `@pytest.mark.security` marker. This means `pytest -m security` runs 0 tests, making the CI gate useless.

**Files to update (all 8):**
- `tests/test_adversarial/test_s1_session_bypass.py`
- `tests/test_adversarial/test_s2_api_key_bypass.py`
- `tests/test_adversarial/test_s3_tenant_isolation.py`
- `tests/test_adversarial/test_s4_approval_state.py`
- `tests/test_adversarial/test_s5_sse_channel.py`
- `tests/test_adversarial/test_s6_signature_bypass.py`
- `tests/test_adversarial/test_s7_bootstrap_lock.py`
- `tests/test_adversarial/test_s8_rate_limit.py`

For each file, add `pytestmark = pytest.mark.security` at module level (after imports). This applies the marker to every test function in the file.

Verify the marker is registered in `pyproject.toml` under `[tool.pytest.ini_options]` markers.

After adding markers, run: `pytest -m security --co -q` to verify all 43 tests are collected.

### 3. Uncomment Frontend in Dockerfile

The Dockerfile has the frontend build stage commented out. Uncomment it so `docker build` produces an image with the dashboard embedded.

**File:** `Dockerfile`

The commented section should:
1. Use a Node stage to `pnpm install && pnpm build`
2. Copy `dashboard/dist/` into the runtime stage at `static/dashboard/`
3. FastAPI serves it via `StaticFiles(directory="static/dashboard", html=True)` at `/dashboard`

After uncommenting, verify:
- `cd dashboard && pnpm build` succeeds
- The `dist/` output contains `index.html`
- The Vite base path is `/dashboard` (check `vite.config.ts`)

### 4. Decide on `/api/v1/setup` Endpoint

**File:** `src/edictum_server/routes/setup.py`

CLAUDE.md says "No /setup endpoint: Admin bootstrap from env vars in lifespan only." But the route exists.

Read the setup route code. Check:
- Does `main.py` `_bootstrap_admin()` already handle bootstrap from env vars?
- Does the S7 bootstrap lock test cover the setup endpoint?
- Is the setup endpoint used by the bootstrap wizard in the frontend?

**Decision tree:**
- If the frontend bootstrap wizard uses `/api/v1/setup` → Keep it, but document the decision conflict in CLAUDE.md
- If bootstrap is env-var-only → Remove the route and update the frontend wizard to just verify bootstrap status via `/api/v1/health`

### 5. Remove Unused `ScrollArea` Import

**File:** `dashboard/src/pages/events-feed.tsx`

Remove the unused `ScrollArea` import.

## Verification

After all changes:
1. `ruff check src/` — must pass
2. `mypy src/ --strict` — must pass
3. `pytest -m security --co -q` — should list exactly 43 tests
4. `pytest` — full suite must pass
5. `cd dashboard && pnpm tsc --noEmit` — must pass
6. `grep -r "npg_\|neondb_owner\|neon\.tech" --include="*.py" .` — must return 0 results
7. `docker build .` — must succeed (if Docker available)
