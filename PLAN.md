# Plan: Create Edictum Console — New Repo from Existing Server

## Context

The existing `edictum-server` is a working FastAPI backend deployed on Render, but locked to Clerk auth and with hardcoded Telegram URLs. The goal is to create a new repo (`~/project/edictum-console`) as a fresh start — copying the 66% of backend code that works as-is, adapting the auth layer, keeping Telegram but behind a pluggable notification protocol, and creating a `dashboard/` placeholder for the React + Vite embedded SPA (built after design phase). Phase 0 + Phase 1 ship together per CLAUDE.md.

**Key constraint:** The edictum SDK (`edictum[server]`) expects specific API paths, headers, response schemas, and SSE event names. The new server must stay compatible.

**Critical fix:** Server sends SSE event `bundle_deployed` but SDK listens for `contract_update`. Must fix in new server.

---

## Core Principles

### Protocol-First / Pluggable Architecture (with discipline)
Protocols only where a second implementation is on the roadmap:
- **Auth:** `AuthProvider` protocol → `LocalAuthProvider` (first), OIDC planned
- **Notifications:** `NotificationChannel` protocol → `TelegramChannel` (first), Slack planned
- **NOT:** ObservabilitySink — add protocol when OTLP is actually being built
- **NOT:** ContractSource — already exists in the edictum SDK

Each protocol is 10-20 lines. The cost is near-zero. But don't add protocols for things with no planned second implementation.

**Source of truth:** User's CLAUDE.md at `/Users/acartagena/Downloads/eductum-console-CLAUDE.md` — to be placed in repo root.

### DDD (Domain-Driven Design)
- **Domain layer** (`services/`) — pure business logic, no HTTP, no framework imports
- **Application layer** (`routes/`) — thin HTTP handlers that validate input, call services, return responses
- **Infrastructure layer** (`auth/`, `db/`, `push/`, `redis/`, `notifications/`) — adapters to external systems
- Services never import from routes. Routes call services. Infrastructure is injected via FastAPI dependencies.

### TDD (Test-Driven Development)
- Write tests FIRST for new code (auth, notifications, setup)
- Every protocol gets a compliance test (does this implementation satisfy the contract?)
- Every API endpoint gets a happy-path + error-case test
- Tests are the specification — if behavior isn't tested, it doesn't exist
- **Switch hats rule:** After implementing a boundary, stop thinking "how does this work" and start thinking "how does this break." Write at least 3 bypass attempts.

### AI-First Codebase
- Small, focused files (< 200 lines)
- Type hints everywhere — LLMs navigate typed code reliably
- Protocols define contracts explicitly — AI reads the protocol, implements correctly
- Test files serve as executable documentation

### Multi-Tenant Data Model (Non-Negotiable)
- Every table retains `tenant_id`. This is non-negotiable for a security product.
- Bootstrap creates one tenant + one admin user. No tenant management UI in first push.
- API key creation scoped to admin's tenant automatically.
- All queries filter by `tenant_id` — no exceptions, no shortcuts, no "admin sees all."
- Multi-tenant management (create tenant, invite users) is post-release. Data model ready; UI/API not exposed.
- Removing tenants would be MORE work than keeping (already everywhere in existing server).
- For a governance/security product, "we had isolation but removed it" is indefensible.

### Adversarial Testing Discipline
Every security boundary gets adversarial tests BEFORE the first push. This is the server equivalent of edictum core's adversarial testing.

**Security Boundary Registry:**

| # | Boundary | Module | Risk if Bypassed |
|---|----------|--------|------------------|
| S1 | Session cookie validation | auth/local.py | Full account takeover |
| S2 | API key resolution | auth/api_keys.py | Unauthorized agent access |
| S3 | Tenant scoping on queries | Every route + service | Cross-tenant data leak |
| S4 | Approval state transitions | services/approval_service.py | Unauthorized tool execution |
| S5 | SSE channel authorization | routes/stream.py | Contract/event leak |
| S6 | Bundle signature verification | services/signing_service.py | Tampered contract deployment |
| S7 | Admin bootstrap lock | main.py lifespan | Privilege escalation |
| S8 | Rate limiting on auth | routes/auth.py | Credential brute force |

**Minimum coverage:** ~43 adversarial tests before first push.
**Ship-blocker rule:** A successful cross-tenant read/write/inference in S3 tests is a blocker, not a bug.

---

## Step 1: Create repo structure + LICENSE + config

Create `~/project/edictum-console/` with:

```
edictum-console/
├── CLAUDE.md                    ← Updated (React + Vite, protocols, DDD/TDD)
├── LICENSE                      ← Apache 2.0
├── NOTICE                       ← Copyright attribution
├── SDK_COMPAT.md                ← API contract the edictum SDK expects
├── pyproject.toml               ← Adapted from edictum-server (Python 3.12+)
├── .env.example                 ← All settings documented
├── Dockerfile                   ← Multi-stage (frontend stage commented out)
├── docker-compose.yml           ← Postgres + Redis + server
├── docker-entrypoint.sh         ← Alembic + uvicorn
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/                ← Fresh 001 migration
├── src/edictum_server/
│   ├── __init__.py
│   ├── main.py                  ← Adapted
│   ├── config.py                ← Adapted
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── provider.py          ← NEW: AuthProvider protocol
│   │   ├── local.py             ← NEW: LocalAuthProvider (bcrypt + Redis sessions)
│   │   ├── api_keys.py          ← Copy as-is
│   │   └── dependencies.py      ← Adapted (dispatches to AuthProvider)
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py              ← Copy as-is
│   │   ├── engine.py            ← Copy as-is
│   │   └── models.py            ← Adapted (add User, rename clerk_org_id)
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py              ← NEW: login/logout/me
│   │   ├── health.py            ← Adapted (version, auth provider, bootstrap status)
│   │   ├── keys.py              ← Adapted (dashboard auth guard)
│   │   ├── bundles.py           ← Adapted (dashboard auth, + GET yaml endpoint)
│   │   ├── events.py            ← Copy as-is
│   │   ├── sessions.py          ← Copy as-is
│   │   ├── stream.py            ← Copy as-is
│   │   ├── approvals.py         ← Adapted (dashboard auth, notification manager)
│   │   └── telegram.py          ← Kept, registered conditionally
│   ├── services/
│   │   ├── __init__.py
│   │   ├── approval_service.py  ← Copy as-is
│   │   ├── bundle_service.py    ← Copy as-is
│   │   ├── deployment_service.py ← Fix: SSE event → contract_update + yaml_bytes
│   │   ├── event_service.py     ← Copy as-is
│   │   ├── session_service.py   ← Copy as-is
│   │   └── signing_service.py   ← Copy as-is
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── common.py            ← Copy as-is
│   │   ├── approvals.py         ← Copy as-is
│   │   ├── bundles.py           ← Copy as-is
│   │   ├── events.py            ← Copy as-is
│   │   ├── keys.py              ← Copy as-is
│   │   └── sessions.py          ← Copy as-is
│   ├── notifications/
│   │   ├── __init__.py
│   │   ├── base.py              ← NEW: NotificationChannel protocol + manager
│   │   └── telegram.py          ← Refactored from telegram/client.py + notifier.py
│   ├── push/
│   │   ├── __init__.py
│   │   ├── manager.py           ← Copy as-is
│   │   └── pubsub.py            ← Copy as-is
│   └── redis/
│       ├── __init__.py
│       └── client.py            ← Copy as-is
├── tests/
│   ├── conftest.py              ← Adapted (local auth fixtures)
│   ├── test_health.py
│   ├── test_api_key_auth.py
│   ├── test_auth_local.py       ← NEW
│   ├── test_auth_provider.py    ← NEW: protocol compliance
│   ├── test_keys.py             ← Adapted
│   ├── test_bundles.py          ← Adapted
│   ├── test_events.py
│   ├── test_sessions.py
│   ├── test_approvals.py        ← Adapted
│   ├── test_signing.py
│   ├── test_tenant_isolation.py ← Adapted
│   ├── test_hitl_api.py         ← Adapted
│   ├── test_notifications.py    ← NEW: protocol compliance + telegram
│   └── test_adversarial/        ← NEW: security boundary bypass tests
│       ├── conftest.py          ← Shared adversarial fixtures (two tenants, bad tokens)
│       ├── test_s1_session_bypass.py    ← Forged cookies, expired tokens, tampered payloads (5 tests)
│       ├── test_s2_api_key_bypass.py    ← Revoked keys, malformed keys (4 tests)
│       ├── test_s3_tenant_isolation.py  ← Cross-tenant on EVERY endpoint (15+ tests)
│       ├── test_s4_approval_state.py    ← Invalid transitions, race, replay (5 tests)
│       ├── test_s5_sse_channel.py       ← Agent receiving another tenant's events (4 tests)
│       ├── test_s6_signature_bypass.py  ← Tampered bundles, missing sigs (4 tests)
│       ├── test_s7_bootstrap_lock.py    ← Re-running bootstrap after admin exists (3 tests)
│       └── test_s8_rate_limit.py        ← Burst attempts (3 tests)
└── dashboard/                   ← Placeholder (React + Vite, Phase 3)
    └── .gitkeep
```

---

## Step 2: Protocols (write first, test second, implement third)

### 2.1 `auth/provider.py` — AuthProvider protocol
```python
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass(frozen=True)
class DashboardAuthContext:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    is_admin: bool

class AuthProvider(ABC):
    @abstractmethod
    async def authenticate(self, request: Request) -> DashboardAuthContext:
        """Extract and verify credentials from request. Raise HTTPException on failure."""
        ...

    @abstractmethod
    async def create_session(self, user_id: uuid.UUID, tenant_id: uuid.UUID) -> tuple[str, dict]:
        """Create session. Returns (token, cookie_params)."""
        ...

    @abstractmethod
    async def destroy_session(self, request: Request) -> None:
        """Destroy the session from the request."""
        ...

    @abstractmethod
    def provider_name(self) -> str:
        """Return provider identifier (e.g., 'local', 'clerk', 'oidc')."""
        ...
```

### 2.2 `notifications/base.py` — NotificationChannel protocol
```python
class NotificationChannel(ABC):
    @abstractmethod
    async def send_approval_request(self, *, approval_id, agent_id, tool_name, tool_args, message) -> None: ...

    @abstractmethod
    async def send_approval_decided(self, *, approval_id, status, decided_by, reason) -> None: ...

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def supports_interactive(self) -> bool: ...

class NotificationManager:
    def __init__(self, channels: list[NotificationChannel]): ...
    async def notify_approval_request(self, **kwargs) -> None:  # fan-out, log errors, don't crash
    async def notify_approval_decided(self, **kwargs) -> None:
```

### 2.3 `SDK_COMPAT.md` — SDK API contract reference
Extract from exploration findings. Documents:
- All API paths + methods + expected request/response shapes
- Required headers: `Authorization: Bearer {key}`, `X-Edictum-Agent-Id: {agent_id}`
- SSE event name: `contract_update` (NOT `bundle_deployed`)
- Error handling: 4xx → immediate fail, 5xx → retry with backoff
- Session paths: GET/PUT/DELETE `/{key}`, POST `/{key}/increment`
- Approval polling: GET `/{id}` returns `{status, decided_by, decision_reason}`

---

## Step 3: Auth system (TDD)

### Tests first (`test_auth_local.py`, `test_auth_provider.py`):
- Login with valid credentials → session cookie returned
- Login with bad password → 401
- Login with nonexistent email → 401 (same error, no enumeration)
- `/me` with valid cookie → user info
- `/me` without cookie → 401
- Logout → cookie cleared, session deleted from Redis
- Session expiry → 401 after TTL
- First-run bootstrap → admin user exists after lifespan startup

### Then implement:
- `auth/local.py` — `LocalAuthProvider(AuthProvider)`:
  - bcrypt password hashing/verification
  - Redis session tokens (random, TTL-based, sliding expiration)
  - HttpOnly + Secure + SameSite=Lax cookies
- `routes/auth.py`:
  - `POST /api/v1/auth/login` — email+password → verify → create session → set cookie
  - `POST /api/v1/auth/logout` — destroy session → clear cookie
  - `GET /api/v1/auth/me` — return user info from session
  - No `/setup` endpoint — admin bootstrap from env vars in lifespan only
- `auth/dependencies.py`:
  - `require_dashboard_auth(request, db, redis)` → delegates to configured AuthProvider
  - `require_api_key(authorization, db)` → unchanged
  - `get_current_tenant(request, db, redis)` → try dashboard auth, fall back to API key

---

## Step 4: Copy + adapt backend code

### Copy as-is (no changes):
All services, schemas, push, redis, api_keys.py, db/base.py, db/engine.py, routes that only use API key auth (events, sessions, stream, health)

### Adapt (auth guard swaps):
- `routes/keys.py` — `require_clerk_jwt` → `require_dashboard_auth`
- `routes/bundles.py` — same + add `GET /api/v1/bundles/{version}/yaml`
- `routes/approvals.py` — same + use `NotificationManager` instead of direct telegram import
- `db/models.py` — add `User` model, rename `clerk_org_id` → `external_auth_id`
- `services/deployment_service.py` — fix SSE event name, add `yaml_bytes` (base64) to payload
- `config.py` — add `secret_key`, `admin_email`, `admin_password`, `base_url`, `session_ttl_hours`; remove `clerk_issuer`
- `main.py` — lifespan: admin bootstrap, NotificationManager init, conditional Telegram webhook from `base_url`

### Notification refactor:
- Merge `telegram/client.py` + `telegram/notifier.py` → `notifications/telegram.py` implementing `NotificationChannel`
- Keep `routes/telegram.py` for webhook handling, register conditionally in main.py

---

## Step 5: Docker + Alembic

**docker-compose.yml** — Postgres 16 + Redis 7 + server (env vars for local auth)
**Dockerfile** — Multi-stage Python build (frontend stage commented out with `# Phase 3: uncomment when dashboard is ready`)
**docker-entrypoint.sh** — unchanged (alembic upgrade head + uvicorn)
**Fresh 001 migration** — all tables including `users`, `external_auth_id` on tenants, event partitioning

---

## Step 6: Dashboard placeholder

Create `dashboard/.gitkeep`. React + Vite + TypeScript + Tailwind + shadcn/ui scaffold comes in Phase 3 after design.

The Dockerfile has a commented-out frontend build stage ready for when the dashboard exists.

---

## Execution Order (Parallelized via Teams)

1. **Sequential:** Create repo, LICENSE, CLAUDE.md, SDK_COMPAT.md, pyproject.toml, .env.example, directory structure
2. **Parallel batch 1:**
   - Teammate A: Copy + adapt backend (models, services, schemas, push, redis, routes)
   - Teammate B: Auth system (provider.py, local.py, dependencies.py, routes/auth.py, tests)
   - Teammate C: Notifications (base.py, telegram.py refactor, tests)
3. **Sequential:** Wire main.py (lifespan with bootstrap, notification manager, router registration)
4. **Parallel batch 2:**
   - Teammate A: Docker setup (Dockerfile, compose, entrypoint)
   - Teammate B: Fresh Alembic migration
   - Teammate C: Remaining test adaptations (conftest, route tests, hitl)
5. **Sequential:** Run full test suite, verify `docker compose up` works end-to-end

---

## Verification

1. `pytest tests/ -v` — all tests pass
2. `docker compose up --build` — server starts, migrations run, admin bootstrapped
3. `curl -X POST localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"changeme"}'` → session cookie
4. `curl -b <cookie> localhost:8000/api/v1/keys -X POST -H 'Content-Type: application/json' -d '{"env":"production","label":"test"}'` → API key
5. `curl -H "Authorization: Bearer edk_production_..." localhost:8000/api/v1/health` → 200 with version + auth provider info
6. Verify SDK compat: response schemas match SDK_COMPAT.md

---

## CLAUDE.md

User has written the final CLAUDE.md at `/Users/acartagena/Downloads/eductum-console-CLAUDE.md`. Copy as-is to repo root. It includes:
- React + Vite + TypeScript (not SvelteKit)
- DDD layer rules, testing hierarchy, adversarial testing discipline
- Security boundary registry (S1-S8)
- Tenant isolation as non-negotiable
- Protocol-first only for AuthProvider + NotificationChannel (not ObservabilitySink)
- Decision log with full rationale

---

## Files to Read During Implementation

| File | Path | Purpose |
|------|------|---------|
| main.py | `~/project/edictum-server/src/edictum_server/main.py` | Lifespan, router registration |
| config.py | `~/project/edictum-server/src/edictum_server/config.py` | Settings pattern |
| dependencies.py | `~/project/edictum-server/src/edictum_server/auth/dependencies.py` | Auth context pattern |
| models.py | `~/project/edictum-server/src/edictum_server/db/models.py` | All models |
| conftest.py | `~/project/edictum-server/tests/conftest.py` | Test fixtures |
| SDK client.py | `~/project/edictum/src/edictum/server/client.py` | Headers, retries, response parsing |
| SDK contract_source.py | `~/project/edictum/src/edictum/server/contract_source.py` | SSE event name `contract_update` |
| SDK approval_backend.py | `~/project/edictum/src/edictum/server/approval_backend.py` | Approval request/poll paths |
| SDK audit_sink.py | `~/project/edictum/src/edictum/server/audit_sink.py` | Event batch POST shape |
| SDK backend.py | `~/project/edictum/src/edictum/server/backend.py` | Session GET/PUT/DELETE/increment |
| telegram client | `~/project/edictum-server/src/edictum_server/telegram/client.py` | Bot API wrapper |
| telegram notifier | `~/project/edictum-server/src/edictum_server/telegram/notifier.py` | Notification logic |
| telegram route | `~/project/edictum-server/src/edictum_server/routes/telegram.py` | Webhook handling |
