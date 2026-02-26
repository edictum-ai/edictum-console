# Prompt: Bootstrap Edictum Console Repo

> Self-contained prompt for a fresh session. All context needed to create the new repo.
> Run in: `~/project/edictum-console` (create it first)
> Mode: `claude --dangerously-skip-permissions`

---

## What You're Doing

Create the `edictum-console` repo — a self-hostable agent operations console. Fresh repo, no git history. Copy backend code from `~/project/edictum-server`, adapt auth, add adversarial tests.

## Source of Truth Files

Read these FIRST before writing any code:

| File | Purpose |
|------|---------|
| `~/project/edictum-plan/prompts/console-bootstrap.md` | This prompt |
| `~/project/edictum-console/CLAUDE.md` | Project rules, architecture, coding standards (copy from ~/Downloads/eductum-console-CLAUDE.md) |
| `~/project/edictum-plan/SDK_COMPAT.md` | API contract the edictum SDK expects — server must match |
| `~/.claude/plans/glowing-yawning-thacker.md` | Detailed implementation plan (file list, copy/adapt/new, execution order) |

## Quick Summary

### What to copy from `~/project/edictum-server/src/edictum_server/`:

**As-is (no changes):**
- `auth/api_keys.py` — API key generation + bcrypt verification
- `db/base.py` — SQLAlchemy base + mixins
- `db/engine.py` — async engine factory
- `routes/health.py`, `routes/events.py`, `routes/sessions.py`, `routes/stream.py`
- All `services/*.py` (except deployment_service.py — needs SSE event name fix)
- All `schemas/*.py` — Pydantic request/response models
- `push/manager.py`, `push/pubsub.py` — SSE connection manager
- `redis/client.py` — Redis factory
- `docker-entrypoint.sh`, `alembic/env.py`

**Copy + adapt:**
- `db/models.py` — add User model, rename `clerk_org_id` → `external_auth_id`
- `auth/dependencies.py` — replace `require_clerk_jwt` → `require_dashboard_auth`
- `routes/keys.py`, `routes/bundles.py`, `routes/approvals.py` — swap Clerk auth guards
- `services/deployment_service.py` — fix SSE event: `bundle_deployed` → `contract_update`, add `yaml_bytes`
- `config.py` — add `secret_key`, `admin_email/password`, `base_url`, `session_ttl_hours`; remove `clerk_issuer`
- `main.py` — lifespan: admin bootstrap, NotificationManager, no hardcoded URLs
- `Dockerfile`, `docker-compose.yml` — add server service

**Refactor (Telegram → pluggable):**
- `telegram/client.py` + `telegram/notifier.py` → `notifications/telegram.py` implementing `NotificationChannel`
- `routes/telegram.py` — kept, registered conditionally

**Skip entirely:**
- `auth/clerk.py` — Clerk-specific, not needed
- Old Alembic migrations — fresh 001

### What to create new:
- `auth/provider.py` — `AuthProvider` ABC
- `auth/local.py` — `LocalAuthProvider` (bcrypt + Redis sessions + HttpOnly cookies)
- `routes/auth.py` — login/logout/me (NO /setup endpoint — env var bootstrap only)
- `notifications/base.py` — `NotificationChannel` ABC + `NotificationManager`
- `alembic/versions/001_initial_schema.py` — fresh migration with all tables + `users`
- `LICENSE` — Apache 2.0
- `NOTICE` — copyright
- `.env.example` — all settings documented
- `SDK_COMPAT.md` — copy from edictum-plan
- `tests/test_auth_local.py` — local auth tests
- `tests/test_auth_provider.py` — protocol compliance
- `tests/test_notifications.py` — notification protocol + telegram
- `tests/test_adversarial/` — 8 files, ~43 security boundary bypass tests

### Critical fixes:
1. SSE event name: `bundle_deployed` → `contract_update` (SDK expects `contract_update`)
2. Add `yaml_bytes` (base64) to SSE push payload
3. Add `GET /api/v1/bundles/{version}/yaml` endpoint
4. All queries must filter by `tenant_id` — no exceptions

### Key decisions:
- **Auth:** `AuthProvider` protocol + `LocalAuthProvider`. No Clerk. No `/setup` endpoint.
- **Notifications:** `NotificationChannel` protocol + `TelegramChannel`. Pluggable.
- **Frontend:** `dashboard/.gitkeep` placeholder. React + Vite + TypeScript (Phase 3, after design).
- **License:** Apache 2.0
- **Python:** 3.12+
- **Multi-tenant:** Keep `tenant_id` everywhere. Single tenant is default UX.
- **Adversarial tests:** 43+ tests across 8 security boundaries before first push. S3 (tenant isolation) is ship-blocker.

### Execution order:
1. Create repo structure, LICENSE, CLAUDE.md, SDK_COMPAT.md, pyproject.toml, .env.example
2. Copy + adapt backend code (parallel: models/services/schemas, auth system, notifications)
3. Wire main.py (depends on auth + notifications)
4. Docker setup + fresh Alembic migration + tests
5. Run full test suite, verify docker compose works

### Verification:
1. `pytest tests/ -v` — all pass
2. `docker compose up --build` — starts, runs migrations, bootstraps admin
3. `curl -X POST localhost:8000/api/v1/auth/login` with admin creds → cookie
4. `curl` with cookie to create API key → works
5. `curl` with Bearer token to health → 200
6. Response schemas match SDK_COMPAT.md
