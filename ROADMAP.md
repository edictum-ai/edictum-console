# Edictum Console — Open-Source Roadmap

> Living document. Updated as work progresses.
> Last updated: 2026-02-26

## Vision

Turn edictum-server from a proprietary Clerk-dependent backend into an open-source, self-hostable agent operations console. Single Docker image, local auth, pluggable everything.

**The pitch:** `docker compose up` → login → create API key → `pip install edictum[server]` → agents governed.

## License

Apache License 2.0 (same as ArgoCD/Argo project).

## Repos Affected

| Repo | Changes | Scope |
|------|---------|-------|
| **edictum-server** | Auth rework, embedded dashboard, notifications, license | Major refactor |
| **edictum** | `Edictum.reload()`, contract push wiring, SSE event name fix | Feature additions |
| **edictum-hub** | Source for dashboard pages (port to embedded SPA), then retire dashboard routes | Port + retire |
| **edictum-plan** | This roadmap, prompts, coordination | Orchestration |

## Current State

- **edictum** v0.11.3 — ready. Works standalone and with server. Server SDK clean.
- **edictum-server** — deployed on Render, functional, but Clerk-locked and Telegram-hardcoded.
- **edictum-hub** — 5 dashboard pages on Vercel, all Clerk-dependent.
- API key creation requires Clerk JWT → **agents can't connect without Clerk**.

---

## Phase 0: Foundation (CURRENT)

> Goal: Make the server deployable by anyone. Local auth so users can create API keys.

### 0.1 License + repo prep
- [ ] Change LICENSE to Apache 2.0
- [ ] Add NOTICE file (copyright attribution)
- [ ] Clean pyproject.toml metadata (description, URLs, classifiers)
- [ ] Fresh initial commit (no git history)

### 0.2 Auth rework
> Unblocks everything. Without this, no one can use the dashboard or create API keys.
> Pattern: PostHog + MinIO + Grafana hybrid. Industry-standard, no custom crypto.

**Design decisions (from Grafana, ArgoCD, PostHog, MinIO, Gitea analysis):**
- Dashboard: HttpOnly secure cookies + server-side sessions in Redis (NOT JWTs in cookies)
- Agents: Opaque API keys (`edk_{env}_{random}`), bcrypt-hashed, prefix-indexed (already correct)
- First-run: env var bootstrap (`EDICTUM_ADMIN_EMAIL`/`PASSWORD`) + one-time `/setup` page
- SSO-ready: User model has `auth_provider` + `external_id` from day one
- `EDICTUM_SECRET_KEY` required in production (signs sessions, encrypts sensitive data)

**Auth flow:**
```
Dashboard (human):                    API (agent):
POST /auth/login {email, pass}        GET /api/v1/stream
  → verify bcrypt hash                  Authorization: Bearer edk_...
  → create session in Redis (TTL)       → lookup by prefix (8 chars)
  → set HttpOnly secure cookie          → verify full key bcrypt hash
  → return user info                    → resolve tenant from key
                                        → check scopes
```

**Tasks:**
- [ ] Create `AuthProvider` protocol in `auth/provider.py`
  - `async verify_request(request: Request, db: AsyncSession) -> AuthContext`
  - `get_provider_info() -> dict` (for frontend: what login UI to show)
- [ ] Implement `LocalAuthProvider`
  - bcrypt password hashing (argon2id as future upgrade)
  - Server-side sessions in Redis with configurable TTL (default 24h, sliding expiration)
  - HttpOnly + Secure + SameSite=Lax cookies
  - CSRF protection on state-changing endpoints
- [ ] Refactor `ClerkAuthProvider` (existing clerk.py, keep as optional adapter)
- [ ] Auth provider factory: dispatch based on `EDICTUM_AUTH_PROVIDER` env var
  - `local` (default) — email/password + session cookie
  - `clerk` — existing Clerk JWT flow (for SaaS deployment)
  - `oidc` — future, not in Phase 0
- [ ] New routes:
  - `POST /api/v1/auth/login` — email+password → session cookie
  - `POST /api/v1/auth/logout` — destroy session
  - `GET /api/v1/auth/me` — current user info
  - `POST /api/v1/setup` — one-time first-run setup (locked after first user)
- [ ] Add `User` model:
  ```
  id, email, password_hash, auth_provider ("local"/"oidc"/"clerk"),
  external_id (nullable, for SSO), is_admin, tenant_id, created_at
  ```
- [ ] Add `Session` tracking (Redis-backed):
  ```
  session_id (random token), user_id, created_at, expires_at, last_active_at
  ```
- [ ] First-run bootstrap (two paths):
  - Path A: `EDICTUM_ADMIN_EMAIL` + `EDICTUM_ADMIN_PASSWORD` env vars → auto-create on startup
  - Path B: `POST /api/v1/setup` → one-time form (locks permanently after first user)
  - Both auto-create default tenant
- [ ] `EDICTUM_SECRET_KEY` env var (required in production, auto-generated in dev with warning)
- [ ] API key enhancements:
  - Add `last_used_at` tracking (update on each verified request)
  - Add optional `expires_at` field
  - Keep existing `edk_{env}_{random}` format + bcrypt hash (already correct pattern)
- [ ] Alembic migration: add `users` table, add `external_auth_id` to tenant (nullable)
- [ ] Refactor `dependencies.py`:
  - `require_dashboard_auth()` — cookie-based, dispatches to configured provider
  - `require_api_key()` — unchanged (agent auth)
  - `get_current_tenant()` — either auth type
- [ ] Update all routes using `require_clerk_jwt` → `require_dashboard_auth`
- [ ] Security hardening:
  - Rate limit on `/auth/login` (e.g., 5 attempts per minute per IP)
  - Session invalidation on password change
  - Constant-time comparison for all token verification
  - No password in logs or error responses

### 0.3 Hardcoded URL cleanup
- [ ] Add `EDICTUM_BASE_URL` setting (default: `http://localhost:8000`)
- [ ] Telegram webhook URL from config, not hardcoded
- [ ] CORS origins default to `EDICTUM_BASE_URL`
- [ ] Remove hardcoded `https://clerk.edictum.ai` default

### 0.4 Self-contained Docker
- [ ] Add server service to docker-compose.yml (Postgres + Redis + server)
- [ ] Multi-stage Dockerfile (Python build + runtime, no frontend yet)
- [ ] `.env.example` with all required/optional settings documented
- [ ] `docker compose up` → server starts → migrations run → admin bootstrapped
- [ ] Verify: login at localhost:8000/api/v1/auth/login, create API key, connect agent

### 0.5 Smoke test: end-to-end without Clerk
- [ ] Start server with `EDICTUM_AUTH_PROVIDER=local`
- [ ] Login with admin credentials
- [ ] Create API key via `POST /api/v1/keys`
- [ ] Connect edictum agent with that API key
- [ ] Verify: events flowing, approvals working, SSE connected

**Phase 0 exit criteria:** `docker compose up` → login → create key → agent connects. No Clerk needed.

---

## Phase 1: Contract Push + Hot Reload

> Goal: Push contract updates to running agents without restart.

### 1.1 SSE event name alignment
- [ ] Fix server: `bundle_deployed` → match what `ServerContractSource` expects
- [ ] Include YAML bytes in SSE push payload (or bundle version + fetch endpoint)
- [ ] Add `GET /api/v1/bundles/{version}/yaml` endpoint (return raw YAML)

### 1.2 `Edictum.reload()` (in edictum core)
> Design complete in reload-design.md. Implementation:

- [ ] Add source tracking attributes to `__init__` (stored paths, content, operators)
- [ ] Add `_reload_lock: asyncio.Lock`
- [ ] Add `CONTRACTS_RELOADED` to `AuditAction`
- [ ] Implement `ReloadResult` frozen dataclass
- [ ] Implement `_reload_from_bundle()` (shared internal logic)
- [ ] Implement `reload()` public API (3 modes: re-read, new path, from content)
- [ ] Implement `watch(source: ServerContractSource)` coroutine
- [ ] 14 behavior tests from reload-design.md
- [ ] Snapshot-at-read semantics with asyncio.Lock (no read-write lock needed)

### 1.3 Wire contract source into nanobot-governed
- [ ] Background task: `asyncio.create_task(guard.watch(source))`
- [ ] Verify: deploy new bundle on server → agent picks it up via SSE → contracts swapped

**Phase 1 exit criteria:** Change contract in dashboard → agent enforces new rules within seconds. No restart.

---

## Phase 2: Pluggable Notifications

> Goal: Replace hardcoded Telegram with a notification plugin system.

### 2.1 Notification protocol
- [ ] Create `NotificationChannel` protocol in `notifications/base.py`
  - `async send(event: NotificationEvent) -> None`
  - `async send_approval_request(approval: Approval) -> ApprovalAction | None`
  - `supports_interactive: bool` (can receive approve/deny responses)
- [ ] Create `NotificationManager` — fan-out to configured channels
- [ ] Create `NotificationEvent` schema (type, severity, title, body, metadata)

### 2.2 Refactor Telegram
- [ ] Extract existing telegram code into `TelegramChannel(NotificationChannel)`
- [ ] Telegram webhook route stays, but registered conditionally
- [ ] Interactive approval via inline buttons (already works, just refactored)

### 2.3 Additional channels (P1, after Telegram refactor)
- [ ] `SlackChannel` — webhook + interactive buttons via Slack API
- [ ] `WebhookChannel` — generic HTTP POST to any URL
- [ ] `EmailChannel` — SMTP or provider API (SendGrid, SES)
- [ ] `PagerDutyChannel` — incidents for critical denials

### 2.4 Configuration
- [ ] `EDICTUM_NOTIFICATIONS` env var or config section
- [ ] Per-channel: enabled, credentials, which events to send
- [ ] Example: `telegram:approvals,denials` + `slack:all` + `webhook:denials`

**Phase 2 exit criteria:** Telegram still works. Adding Slack = set env var + restart. No code changes.

---

## Phase 3: Frontend Design + Embedded Dashboard

> Goal: Design what the console UI should be, then build it as an embedded SPA.

### 3.1 Feature-driven design (BEFORE building)
- [ ] Define console user stories (who uses it, what they do)
- [ ] Map features to pages/views
- [ ] Wire mockups or sketches for each page
- [ ] Decide: what from edictum-hub to keep, what to redesign, what's new
- [ ] Auth UX: login page, session management, user settings

### 3.2 SPA scaffold
- [ ] Vite + React + TypeScript in `dashboard/` directory
- [ ] React Router for client-side routing
- [ ] Auth context (session cookie from local auth)
- [ ] `edictum-api.ts` ported from hub (cookie auth instead of Clerk JWT)
- [ ] Dark theme, design system (keep existing aesthetic or redesign)

### 3.3 Port/build pages
- [ ] Login page (new) + first-run setup page
- [ ] Overview — agent count, event stats, recent activity
- [ ] Contracts page (see detailed spec in CONSOLE-FEATURES.md):
  - List view: active deployments per env + version history
  - Bundle viewer: expand contracts, see YAML, effect, tool, mode
  - Version diff: added/removed/modified contracts between versions
  - Quick edit: in-browser YAML editor with validation + schema checking
  - Deploy flow: pre-deploy check (what changes, who's affected) → confirm → push
  - Agent confirmation: see which agents reloaded, which are outdated
  - Templates: start from blank, clone current, or use built-in templates
- [ ] Feed — live event stream, approve/deny HITL requests
- [ ] Fleet — agent status + **contract version per agent** (current vs outdated)
- [ ] Settings — API keys, notification channels, auth config

### 3.4 Embed in server
- [ ] Multi-stage Dockerfile: frontend build + Python build + runtime
- [ ] FastAPI serves SPA via `StaticFiles(directory="static/dashboard", html=True)`
- [ ] API routes under `/api/v1/*`, everything else falls through to SPA
- [ ] `http://localhost:8000` → dashboard. `http://localhost:8000/api/v1/health` → API.

### 3.5 Main page (edictum marketing/features)
- [ ] Landing page at `/` — what is Edictum, features, quickstart
- [ ] Can be part of the SPA or a separate static page served by FastAPI
- [ ] Links to dashboard at `/dashboard`, docs at docs.edictum.dev

**Phase 3 exit criteria:** Single Docker image serves marketing page + full dashboard. No Vercel needed.

---

## Phase 4: Polish + Release

> Goal: Ready for public GitHub repo and announcement.

### 4.1 CI/CD
- [ ] GitHub Actions: pytest on PRs
- [ ] GitHub Actions: ruff + mypy lint
- [ ] GitHub Actions: build + push Docker image to ghcr.io on tags
- [ ] Dependabot or Renovate for dependency updates

### 4.2 Versioning
- [ ] Semver in pyproject.toml (start at 0.1.0)
- [ ] CHANGELOG.md
- [ ] Git tags for releases
- [ ] Docker image tags matching versions

### 4.3 Documentation
- [ ] README.md — what it is, quickstart, screenshots
- [ ] CONTRIBUTING.md — dev setup, running tests, PR process
- [ ] `.env.example` — all settings with comments
- [ ] Architecture overview in repo (simplified from edictum-plan)

### 4.4 Security review
> This is a security product. The server itself MUST be hardened.

**Authentication security:**
- [ ] Rate limit on `/auth/login` — 5 attempts/min/IP, exponential backoff
- [ ] Session invalidation on password change (all sessions, like Grafana)
- [ ] Constant-time comparison for all token/password verification
- [ ] No password in logs, error responses, or debug output
- [ ] CSRF protection on all state-changing cookie-auth endpoints
- [ ] Secure cookie flags: HttpOnly, Secure (in production), SameSite=Lax
- [ ] Session TTL configurable, sliding expiration with max absolute lifetime
- [ ] API key `last_used_at` tracking for auditing

**Input validation:**
- [ ] All endpoints validate input with Pydantic (already true, verify coverage)
- [ ] YAML upload validated against edictum contract schema before storage
- [ ] File size limits on bundle upload
- [ ] SQL injection impossible (SQLAlchemy parameterized, verify no raw SQL)

**Infrastructure security:**
- [ ] No stack traces in production error responses (FastAPI exception handlers)
- [ ] `EDICTUM_SECRET_KEY` required in production (refuse to start without it)
- [ ] No dangerous defaults (admin password MUST be set, no admin/admin)
- [ ] Ed25519 signing key encrypted at rest (already implemented)
- [ ] Docker image runs as non-root user (already implemented)
- [ ] Dependency audit (pip-audit or safety check in CI)
- [ ] CORS strictly configured per deployment

**Audit trail (the server audits itself):**
- [ ] All auth events logged: login, logout, failed login, key creation, key revocation
- [ ] All contract deployments logged with who deployed and when
- [ ] All approval decisions logged with who decided
- [ ] Retention policy for audit data (configurable)

### 4.5 Testing
- [ ] Local auth provider tests
- [ ] Auth provider factory tests
- [ ] Integration test: full flow with local auth
- [ ] Notification protocol tests
- [ ] Contract push + reload integration test

**Phase 4 exit criteria:** `git push` to public repo. Docker image on ghcr.io. README tells the story.

---

## Out of Scope (Future)

| Feature | When | Notes |
|---------|------|-------|
| OIDC auth provider (Keycloak, Okta, Azure AD) | Post-release | Protocol is there, just needs implementation |
| Agent heartbeat + Redis presence | Post-release | Fleet page works from events initially |
| Observability sinks (OTLP, Prometheus, Datadog) | Post-release | Events in Postgres for now |
| L2 context-aware sandbox contracts | Separate edictum core release | Design exists in findings/ |
| L3 intent analysis (LLM judges) | Future | ApprovalBackend protocol supports it |
| `edictum-config.yaml` file support | Post-release | Env vars sufficient for MVP |
| WebSocket dashboard live feed (ADR-014) | Post-release | Polling works for MVP |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-26 | Apache 2.0 license (like ArgoCD) | Standard for infra OSS, permissive, CNCF-compatible |
| 2026-02-26 | Fresh initial commit, no history | Clean start, no secrets audit needed |
| 2026-02-26 | Local user/password auth as default | Lowest barrier to entry for self-hosted |
| 2026-02-26 | Contract push + reload is P0, not P1 | Core value prop: change YAML, agents update live |
| 2026-02-26 | Frontend design comes before build | Don't port blindly from hub, design for console UX |
| 2026-02-26 | Marketing page at `/`, dashboard at `/dashboard` | Single app, one deployment |
| 2026-02-26 | Notification protocol before more channels | Extensibility over feature count |
| 2026-02-26 | edictum core works without server | Non-negotiable. Server is optional enhancement |

---

## How edictum + edictum-server Connect

```
Without server (standalone):
  Edictum.from_yaml("contracts.yaml")
  → Contracts: loaded from disk
  → Session state: MemoryBackend (in-process)
  → Approvals: LocalApprovalBackend (CLI prompt)
  → Audit: StdoutAuditSink or FileAuditSink
  → No network calls. Zero latency. Works offline.

With server (connected):
  client = EdictumServerClient(base_url, api_key, agent_id)
  Edictum.from_yaml("contracts.yaml",
    backend=ServerBackend(client),
    approval_backend=ServerApprovalBackend(client),
    audit_sink=ServerAuditSink(client),
  )
  → Contracts: loaded from disk (or pushed via SSE after Phase 1)
  → Session state: server HTTP API (Redis-backed)
  → Approvals: server queue (dashboard/Telegram/Slack)
  → Audit: batched HTTP POST to server (Postgres)
  → Fail-closed: server down → errors propagate → deny

API key lifecycle:
  1. Admin logs into console (local auth or Clerk)
  2. Creates API key: POST /api/v1/keys → edk_production_<random>
  3. Key shown once, stored as bcrypt hash
  4. Agent uses key: Authorization: Bearer edk_production_...
  5. Server resolves tenant from key on every request
  6. Revoke: DELETE /api/v1/keys/{id} → immediate 401 on next use
```
