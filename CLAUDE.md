# CLAUDE.md — Edictum Console

> Project rules, architecture decisions, and coding standards.
> This file is the source of truth for AI-assisted development on this project.

## What This Is

Edictum Console is a self-hostable agent operations console. It is the server companion to the `edictum` Python library — runtime governance for AI agents. The console provides contract management, HITL approval workflows, audit event feeds, and fleet monitoring. It ships as a single Docker image: `docker compose up` → login → create API key → `pip install edictum[server]` → agents governed.

## Architecture

```
edictum-server/
├── src/                    # FastAPI backend (Python)
│   ├── auth/               # Authentication (local auth provider)
│   ├── routes/             # API routes under /api/v1/*
│   ├── models/             # SQLAlchemy async models
│   ├── services/           # Business logic
│   ├── notifications/      # Notification channel protocol + implementations
│   └── main.py             # FastAPI app entry
├── dashboard/              # React SPA (embedded frontend)
│   ├── src/
│   │   ├── pages/          # Route components
│   │   ├── components/     # Shared UI components
│   │   ├── lib/            # API client, hooks, utilities
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
├── migrations/             # Alembic migrations
├── docker-compose.yml      # Postgres + Redis + server
├── Dockerfile              # Multi-stage: node build → python build → slim runtime
├── pyproject.toml
└── .env.example
```

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | **FastAPI** (async, uvicorn) | Companion to a Python library. `pip install edictum[server]` must work. |
| ORM | **SQLAlchemy async + Alembic** | Already proven in current server. Async-native. |
| Database | **Postgres** | Events, bundles, approvals, users. Partitioned events table. |
| Cache/Sessions | **Redis** | Session tokens (TTL), SSE pub/sub, agent presence. |
| Frontend | **React + TypeScript + Vite** | Most AI-fluent frontend stack. LLMs produce working React on first try. Massive ecosystem, deepest troubleshooting coverage. |
| Styling | **Tailwind + shadcn/ui** | Fast, consistent, dark theme out of the box. Battle-tested with more components than alternatives. |
| Routing | **React Router** | Simple SPA routing. No framework opinions. |
| Build | **Vite** | Instant builds, static output copied into Docker image. |
| Docker | **Multi-stage** | Stage 1: node build dashboard (`dist/`). Stage 2: python build. Stage 3: slim runtime with static assets + Python app. |

### Why React

This project is built primarily with AI-assisted development. React + TypeScript + Tailwind + shadcn/ui is the most AI-fluent frontend stack available — every major LLM has deep training data coverage. AI produces working React code on first try, debugging is faster, and refactoring suggestions are more reliable. For a solo/small-team building evenings and weekends, optimizing for AI productivity is the highest-leverage choice.

### Why NOT Next.js

Next.js is a full-stack framework with SSR, routing conventions, and deployment assumptions that fight against embedding a SPA in FastAPI. We serve static files from FastAPI — Next.js adds complexity for zero benefit.

### Why NOT Svelte

Svelte 5 runes are too new — LLMs still confuse Svelte 3/4/5 syntax and produce broken code. Smaller ecosystem means fewer component libraries, fewer Stack Overflow answers, and more time debugging framework-specific issues instead of shipping features. The "less code" advantage evaporates when the AI can't help you.

## Non-Negotiable Principles

1. **edictum core works without the server.** The library is standalone. Server is an optional enhancement. Never introduce a server dependency into the core library.
2. **All governance runs in the agent process.** The server NEVER evaluates contracts in production. Zero latency on tool calls. Server stores events, manages approvals, pushes contract updates. **Exception:** `POST /api/v1/bundles/evaluate` is a development-time playground endpoint for testing contracts in the dashboard. It is never called by agents. Production evaluation remains agent-side only.
3. **Fail closed.** Server unreachable → errors propagate → deny. Never fail open.
4. **Single Docker image.** FastAPI serves the SPA at `/dashboard`, API at `/api/v1/*`, marketing/landing at `/`. One deployment.
5. **Local-first auth.** `EDICTUM_AUTH_PROVIDER=local` is the default. No external auth dependency required.
6. **Design before build for UI.** Don't build pages without user stories, feature mapping, and at minimum wireframes. Porting blindly from hub is not allowed.
7. **AI-fluent stack.** Technology choices optimize for AI-assisted development. Every layer (FastAPI, SQLAlchemy, React, Tailwind, shadcn/ui) has deep LLM training coverage. When choosing between options, pick the one the AI will be better at generating, debugging, and iterating on.
8. **Tenant isolation on every query.** All database queries filter by `tenant_id`. No admin-sees-all shortcuts. No exceptions. Single tenant is the default UX (one admin, one tenant, auto-created on bootstrap), but the data model is multi-tenant from day one. If a query touches tenant-scoped data without a `tenant_id` filter, it's a bug, not a feature.
9. **Adversarial tests before ship.** Every security boundary has bypass tests before the first push. Positive tests prove it works. Adversarial tests prove it doesn't break. Both are required.
10. **Quality gate before "done."** No view is complete until it passes the `PROMPT-FRONTEND-AUDIT.md` checklist. "TypeScript compiles" is not done. "Works in dark mode" is not done. Done means: real data, both themes tested, consistent with other views, interactive, accessible, and you'd show it in a demo without hesitation. If an agent says a view is done, the reviewer opens the browser and checks — not the code.

## Release Strategy

Phase 0 + Phase 1 ship together as the first public release. The demo story must be complete end-to-end:

```
docker compose up → login → create API key → connect agent → 
change contract in console → agent picks it up live → no restart
```

Phase 0 alone (auth + API keys) is infrastructure without a payoff. Phase 1 (contract push + hot reload) is the "oh, this is different" moment. Ship them together.

### What's In the First Push

- Local auth (email/password, session tokens in Redis, HttpOnly cookies)
- Admin bootstrap from env vars on first run
- API key CRUD (create, list, revoke)
- Contract bundle upload, versioning, deployment
- SSE contract push to connected agents
- `Edictum.reload()` in core library
- Health endpoint returning: version, auth provider type, bootstrap status
- Minimal web UI for login + API key management (doesn't need to be final design, but `localhost:8000` must show something)
- Docker Compose (Postgres + Redis + server)
- End-to-end smoke test without Clerk
- SDK_COMPAT.md documenting the API contract the edictum SDK expects
- Adversarial test suite (~43 tests across 8 security boundaries)

### What's NOT In the First Push

- Clerk auth provider (documented as "coming back", not needed for self-hosted)
- Full dashboard (comes after design phase)
- Notification channels beyond Telegram
- OIDC support
- Multi-tenant management UI (data model is multi-tenant, UX is single-tenant)
- ObservabilitySink protocol (events go to Postgres, add protocol when OTLP arrives)

## Coding Standards

### Python (Backend)

- **Python 3.12+**
- **Async everywhere.** All route handlers, all DB operations, all external calls.
- **Type hints on everything.** No `Any` unless genuinely unavoidable.
- **Pydantic v2** for all request/response schemas.
- **SQLAlchemy 2.0 style** — `select()` statements, not legacy Query API.
- **Alembic for all schema changes.** Never modify tables without a migration.
- **Ruff** for linting and formatting. No exceptions.
- **Mypy** in strict mode.
- **pytest + pytest-asyncio** for tests. No unittest.
- Route functions are thin — validate input, call service, return response. Business logic lives in `services/`.
- No hardcoded URLs. Everything from settings/env vars.
- Secrets: no dangerous defaults. Admin password must be explicitly set.

### React/TypeScript (Frontend)

- **React 19 + TypeScript strict mode.** No `any`.
- **Vite SPA** with React Router. `dist/` output served by FastAPI as static files.
- **Functional components only.** No class components.
- **API client** in `lib/api.ts` — single module for all server calls. Cookie auth (HttpOnly session cookie set by backend).
- **No localStorage/sessionStorage for auth.** Session is a server-side cookie.
- **Tailwind utility classes.** No custom CSS files unless truly necessary.
- **Dark theme by default, light must work.** Design for dark first, but EVERY colored element must work in light mode. The rule: `text-*-600 dark:text-*-400` for ALL semantic colors (verdicts, env badges, status indicators, timer zones). Never use `text-*-400` alone — it's invisible on white backgrounds. Same for `bg-*` tints: test in both themes.
- Components are small and focused. One component = one job.
- Real-time feeds use SSE via `EventSource` API. No polling unless SSE is unavailable.
- **TanStack Table** for data tables (sorting, filtering, pagination).
- **Recharts** for charts — always wrapped in shadcn `ChartContainer` + `ChartTooltip` + `ChartTooltipContent` (never raw Recharts `ResponsiveContainer` or hand-rolled tooltips).

#### Shared Modules — No Duplication

**Before writing a utility function, check if it already exists.** Common modules:

| Module | Contains |
|--------|----------|
| `lib/format.ts` | `formatRelativeTime`, `formatArgs`, `formatToolArgs`, `formatTime`, `truncate` |
| `lib/verdict-helpers.ts` | `verdictColor`, `VerdictIcon`, `VERDICT_STYLES`, `verdictDot` |
| `lib/env-colors.ts` | `ENV_COLORS`, `EnvBadge` |
| `lib/payload-helpers.ts` | `extractProvenance`, `contractLabel`, `isObserveFinding`, `extractArgsPreview` |
| `lib/histogram.ts` | `buildHistogram`, `HistogramBucket`, chart config constants |

If a function is defined in two files, it's a bug. Extract to the appropriate shared module.

#### shadcn/ui — Mandatory Component Library

**shadcn/ui is the ONLY component library for this project. This is non-negotiable.**

Before writing ANY UI element, check if shadcn has a component for it. Use the shadcn MCP tools (`search_items_in_registries`, `view_items_in_registries`) to look up components and their APIs. If shadcn has it, use it. No exceptions.

**Never hand-roll these — shadcn equivalents exist and MUST be used:**

| Element | Use This | NOT This |
|---------|----------|----------|
| Buttons | `<Button>` from `@/components/ui/button` | Raw `<button>` |
| Inputs | `<Input>` from `@/components/ui/input` | Raw `<input type="text">` |
| Checkboxes | `<Checkbox>` from `@/components/ui/checkbox` | Raw `<input type="checkbox">` |
| Labels | `<Label>` from `@/components/ui/label` | Raw `<label>` |
| Alerts/banners | `<Alert>` from `@/components/ui/alert` | Hand-rolled `<div>` with border/bg |
| Progress bars | `<Progress>` from `@/components/ui/progress` | Hand-rolled div-in-div fills |
| Loading skeletons | `<Skeleton>` from `@/components/ui/skeleton` | `animate-pulse` divs |
| Loading spinners | `<Loader2>` from `lucide-react` with `animate-spin` | Border-hack spinner divs |
| Badges/pills | `<Badge>` from `@/components/ui/badge` | Custom `<span>` with rounded-full |
| Tabs | `<Tabs>` with `variant="line"` for underline style | Manual `data-[state=active]` overrides |
| Tooltips | `<Tooltip>` from `@/components/ui/tooltip` | Custom hover divs |
| Dialogs/modals | `<Dialog>` from `@/components/ui/dialog` | Custom overlay divs |
| Select dropdowns | `<Select>` from `@/components/ui/select` | Raw `<select>` |
| Tables | `<Table>` from `@/components/ui/table` | Raw `<table>` |
| Scroll areas | `<ScrollArea>` from `@/components/ui/scroll-area` | Custom overflow containers |
| Separators | `<Separator>` from `@/components/ui/separator` | `<hr>` or border-b divs |
| Cards | `<Card>` from `@/components/ui/card` | Custom bordered containers |

**Installing new components:** If a shadcn component isn't installed yet, install it: `pnpm dlx shadcn@latest add <component>`. Check `dashboard/src/components/ui/` for what's already installed.

**Customizing shadcn components:** Use `className` overrides on shadcn components, never fight them with `data-[state=]` hacks. If you need a variant that doesn't exist, extend the component in `components/ui/` — don't bypass it.

**The test:** If a PR introduces a raw `<button>`, `<input>`, `<label>`, `<select>`, or hand-rolled alert/progress/skeleton, it's a bug. The reviewer asks: **"Why isn't this using shadcn?"**

### General

- **No premature abstraction — with one exception.** Don't build extension points until there's a second user of the abstraction. The exception: security and integration boundaries where a second implementation is on the roadmap get a protocol (ABC) from day one. Currently that means `AuthProvider` (OIDC planned) and `NotificationChannel` (Slack planned). A protocol is 10-20 lines — the cost is near-zero. Don't add protocols for things with no planned second implementation (e.g., no `ObservabilitySink` until OTLP is actually being built).
- **Boring technology.** The interesting part is the governance model, not the web framework. Keep the stack invisible.
- **Commit messages:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **No git history from old repos.** Fresh initial commit.
- **Small, focused files (< 200 lines).** LLMs navigate small typed files reliably. If a file is growing past 200 lines, split it.

## Architecture Layer Rules (DDD)

- **Domain layer** (`services/`) — pure business logic. No HTTP imports, no FastAPI imports, no framework coupling. Services receive typed parameters and return typed results. Services never import from routes.
- **Application layer** (`routes/`) — thin HTTP handlers. Validate input (Pydantic), call service, return response. No business logic in routes. If a route function is longer than 20 lines, logic probably belongs in a service.
- **Infrastructure layer** (`auth/`, `db/`, `push/`, `redis/`, `notifications/`) — adapters to external systems. Injected via FastAPI dependencies. Swappable without touching business logic.

## Testing

### Test Hierarchy

1. **Protocol compliance tests** — does this implementation satisfy the ABC contract?
2. **Positive tests** — happy path + expected error cases for every endpoint.
3. **Adversarial tests** — bypass attempts for every security boundary.
4. **Integration tests** — end-to-end flows (login → create key → connect agent).

### Adversarial Testing Discipline

Every security boundary gets adversarial tests organized by attack category:

- **Input manipulation** — encoding tricks, injection, type confusion, boundary values.
- **Semantic bypass** — indirection, TOCTOU, classification gaming.
- **Failure modes** — dependency down, garbage responses, partial failure.
- **Audit fidelity** — correct events emitted for each decision path.

Tests live in `tests/test_adversarial/` and are marked with `@pytest.mark.security`.

The **"switch hats"** rule: when you finish implementing a boundary, stop thinking "how does this work" and start thinking "how does this break." Write at least 3 bypass attempts before moving on.

### Server Security Boundaries

| # | Boundary | Module | Decision | Risk if Bypassed |
|---|----------|--------|----------|------------------|
| S1 | Session cookie validation | `auth/local.py` | Authenticated or reject | Full account takeover |
| S2 | API key resolution | `auth/api_keys.py` | Valid key → tenant, or reject | Unauthorized agent access |
| S3 | Tenant scoping on queries | Every route + service | Data scoped to tenant | Cross-tenant data leak |
| S4 | Approval state transitions | `services/approval_service.py` | Valid transition or reject | Unauthorized tool execution |
| S5 | SSE channel authorization | `routes/stream.py` | Agent sees own tenant only | Contract/event leak |
| S6 | Bundle signature verification | `services/signing_service.py` | Authentic or reject | Tampered contract deployment |
| S7 | Admin bootstrap lock | `main.py` lifespan | Create only if no users exist | Privilege escalation |
| S8 | Rate limiting on auth | `routes/auth.py` | Throttle or allow | Credential brute force |

### Tenant Isolation Testing (S3 — Highest Priority)

Tenant isolation is the highest-priority adversarial target. Attack patterns to cover:

- **Direct ID manipulation** — API key from tenant A, agent_id header from tenant B. GET/PUT on resources belonging to another tenant.
- **Auth context mismatch** — dashboard cookie from tenant A, API key from tenant B in same request.
- **Data leakage in responses** — list endpoints returning cross-tenant items. Error messages revealing resource existence in other tenants (404 vs 403).
- **SSE cross-tenant** — agent receiving events for wrong tenant after reconnection.

A successful cross-tenant read/write/inference is a **ship-blocker**, not a bug.

### Adversarial Test Structure

```
tests/test_adversarial/
├── test_s1_session_bypass.py       # Forged cookies, expired tokens, tampered payloads
├── test_s2_api_key_bypass.py       # Revoked keys, malformed keys, timing attacks
├── test_s3_tenant_isolation.py     # Cross-tenant access on EVERY endpoint (15+ tests)
├── test_s4_approval_state.py       # Invalid transitions, race conditions, replay
├── test_s5_sse_channel.py          # Agent receiving another tenant's events
├── test_s6_signature_bypass.py     # Tampered bundles, missing signatures
├── test_s7_bootstrap_lock.py       # Re-running bootstrap after admin exists
└── test_s8_rate_limit.py           # Burst attempts, distributed attempts
```

Minimum ~43 adversarial tests before first push.

### CI

- `pytest -m security` runs on every PR — adversarial test failure = merge blocker.
- `bandit -r src/ -ll -ii --exclude tests/` runs before releases.
- Any PR that adds or modifies a security boundary without adversarial tests is a merge blocker. The reviewer asks: **"Show me the bypass tests."**

## File Serving Layout

```
GET /                    → Marketing/landing page (what is Edictum, quickstart)
GET /dashboard           → React SPA (catches all /dashboard/* routes)
GET /api/v1/*            → FastAPI API routes
GET /api/v1/health       → Health check (no auth)
GET /api/v1/stream       → SSE stream (API key auth)
```

FastAPI serves the SPA via `StaticFiles(directory="static/dashboard", html=True)` mounted at `/dashboard`. Vite base path is `/dashboard`.

## Environment Variables

All prefixed with `EDICTUM_` where possible.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | — | Postgres connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `EDICTUM_ADMIN_EMAIL` | First run | — | Bootstrap admin user |
| `EDICTUM_ADMIN_PASSWORD` | First run | — | Bootstrap admin password |
| `EDICTUM_AUTH_PROVIDER` | No | `local` | Auth provider (`local`, future: `clerk`, `oidc`) |
| `EDICTUM_BASE_URL` | No | `http://localhost:8000` | Public URL for webhooks, CORS |
| `EDICTUM_SECRET_KEY` | Yes | — | Session token signing. No default. |

## License

Apache License 2.0 (same as ArgoCD/Argo project). Standard for infrastructure OSS, permissive, CNCF-compatible.

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Apache 2.0 | Standard for infra OSS, permissive, CNCF-compatible |
| Fresh initial commit | Clean start, no secrets audit needed |
| Local auth only for first push | Lowest barrier. Clerk abstraction adds complexity without users. |
| No auth provider protocol yet | Removed — AuthProvider protocol is in first push. OIDC is on the roadmap, justifying the abstraction. |
| Phase 0 + 1 merged for first release | Phase 0 alone is infrastructure without payoff. Contract push is the wow moment. |
| Minimal login UI in first push | `localhost:8000` must show something. Curl commands lose first impressions. |
| React + Vite over SvelteKit | AI-assisted development is primary workflow. React has deepest LLM training coverage — AI produces working code on first try. Svelte 5 too new for reliable AI output. |
| React + Vite over Next.js | Embedding SPA in FastAPI. Next.js SSR/conventions fight this model. |
| Design before build for full dashboard | Don't port from hub. Design console UX from user stories. |
| Notification protocol before more channels | Extensibility over feature count |
| Python/FastAPI for backend | Companion to Python library. Single `pip install`. |
| Health endpoint with metadata | Returns version, auth provider, bootstrap status. Debugging Docker issues. |
| Keep multi-tenant data model | Removing tenant_id is more work than keeping it. Single tenant is default UX, but data model is ready for teams. For a security product, "we had isolation but removed it" is indefensible. |
| Adversarial tests before first push | Positive tests prove it works. Adversarial tests prove it doesn't break. ~43 minimum across 8 security boundaries. Ship-blocker if tenant isolation can be bypassed. |
| Protocols only where second impl is planned | AuthProvider (OIDC planned) and NotificationChannel (Slack planned) get ABCs. No ObservabilitySink until OTLP is actually being built. Balance between pluggability and premature abstraction. |
| DDD layer rules | Services never import routes. Routes are thin. Infrastructure injected via dependencies. Keeps the codebase navigable for both humans and AI. |
| Keep `/api/v1/setup` endpoint | Frontend bootstrap wizard (`/dashboard/setup`) uses this endpoint for interactive first-run. Env-var bootstrap via `_bootstrap_admin()` in lifespan is an alternative path, not the only path. Both are protected by S7 bootstrap lock. |
