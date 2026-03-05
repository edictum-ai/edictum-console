# Architecture

Edictum Console is a single Docker image that serves a React SPA, a FastAPI API, and SSE streams from one process. The console never evaluates contracts in production — agents do that locally. The console stores events, manages approvals, pushes contract updates, and monitors the fleet.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (async, uvicorn) |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 |
| Cache/Sessions | Redis 7 |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Routing | React Router |
| Docker | Multi-stage build |

---

## Request Flow

```
Client Request
      |
      v
+-----+------+
|   uvicorn   |
+-----+------+
      |
      +-- GET /                    --> Redirect to /dashboard
      |
      +-- GET /dashboard/*         --> React SPA (StaticFiles, html=True)
      |                                Client-side routing handles all /dashboard/* paths
      |
      +-- GET /api/v1/health       --> No auth, returns status/latency/agents
      |
      +-- GET /api/v1/stream       --> API key auth, SSE agent stream
      |
      +-- GET /api/v1/stream/dashboard --> Cookie auth, SSE dashboard stream
      |
      +-- POST/GET /api/v1/*       --> Auth middleware --> Route handler --> Service --> DB
```

FastAPI serves the React SPA via `StaticFiles(directory="static/dashboard", html=True)` mounted at `/dashboard`. The `html=True` flag returns `index.html` for any path that doesn't match a static file, enabling client-side routing.

---

## Docker Image

Multi-stage Dockerfile produces a single image:

```
Stage 1: Node Build
  FROM node:22-slim
  pnpm install + pnpm build
  Output: dashboard/dist/

Stage 2: Python Build
  FROM python:3.12-slim
  pip install . (builds wheel)

Stage 3: Runtime
  FROM python:3.12-slim
  COPY --from=stage1 dist/ → static/dashboard/
  COPY --from=stage2 wheel → pip install
  EXPOSE 8000
  CMD uvicorn edictum_server.main:app
```

The final image contains the compiled React SPA as static files and the Python application. No Node.js runtime in production.

---

## DDD Layers

The codebase follows domain-driven design with strict layer separation.

```
Routes (Application Layer)
  │  Thin HTTP handlers. Validate input (Pydantic), call service, return response.
  │  Never contain business logic. If a route is longer than 20 lines,
  │  logic belongs in a service.
  │
  v
Services (Domain Layer)
  │  Pure business logic. No HTTP imports, no FastAPI imports, no framework coupling.
  │  Receive typed parameters, return typed results.
  │  Services NEVER import from routes.
  │
  v
Infrastructure (Adapters)
  │  auth/          Authentication providers, API key resolution
  │  db/            SQLAlchemy engine, session factory
  │  push/          PushManager (SSE dispatch)
  │  redis/         Redis client
  │  notifications/ Channel implementations (Telegram, Slack, etc.)
  │
  Injected via FastAPI dependencies. Swappable without touching business logic.
```

---

## Authentication

Three auth dependencies, injected via FastAPI `Depends()`:

```
require_api_key
  │  Extracts Bearer token from Authorization header
  │  Parses format: edk_{env}_{random}
  │  Extracts prefix (edk_{env}_{first8}), DB lookup, bcrypt verify
  │  Returns AuthContext(tenant_id, env, agent_id, auth_type="api_key")

require_dashboard_auth
  │  Extracts edictum_session cookie
  │  Fetches session from Redis: session:{token}
  │  Slides TTL on each successful auth
  │  Returns AuthContext(tenant_id, user_id, email, auth_type="dashboard")

get_current_tenant
  │  Union dependency: tries API key first (if Bearer edk_* header present),
  │  falls back to dashboard cookie auth
  │  Used on endpoints accessible to both agents and dashboard
```

CSRF middleware: mutating requests (POST/PUT/DELETE/PATCH) on `/api/` paths with cookie auth require `X-Requested-With` header. API key requests are exempt. Login, setup, and webhook paths are excluded.

---

## PushManager (SSE)

In-process event dispatcher using asyncio queues. No external message broker.

```
PushManager
│
├── _connections: dict[env, list[AgentConnection]]
│   │
│   │  AgentConnection
│   │  ├── queue: asyncio.Queue    (events written here, SSE endpoint reads)
│   │  ├── env: str
│   │  ├── tenant_id: UUID
│   │  ├── agent_id: str
│   │  ├── bundle_name: str | None (filters contract_update events)
│   │  ├── policy_version: str | None (for drift detection)
│   │  ├── connected_at: datetime
│   │  └── is_closed: bool
│   │
│   └── Keyed by environment. push_to_env() iterates only the target env's connections.
│
├── _dashboard_connections: dict[tenant_id, list[DashboardConnection]]
│   │
│   │  DashboardConnection
│   │  ├── queue: asyncio.Queue
│   │  ├── tenant_id: UUID
│   │  └── connected_at: datetime
│   │
│   └── Keyed by tenant. push_to_dashboard() iterates only the target tenant's connections.
│
└── Dispatch methods:
    ├── push_to_env(env, data, tenant_id)
    │     Fan-out to all agents in env matching tenant.
    │     For contract_update events, additionally filters by bundle_name.
    │
    ├── push_to_dashboard(tenant_id, data)
    │     Fan-out to dashboard connections for tenant.
    │     Only forwards events in the whitelist (14 event types).
    │
    └── push_to_agent(agent_id, data, tenant_id)
          Targeted push to a specific agent across all environments.
```

---

## Background Workers

Four background tasks run inside the server process:

| Worker | Interval | Purpose |
|--------|----------|---------|
| Approval timeout | 10 seconds | Query pending approvals past their `timeout_seconds`. Mark as `timeout`. Push SSE event. Notify channels. |
| Partition worker | 24 hours | Ensure PostgreSQL event partitions exist for the next 3 months. No-op for non-Postgres databases. |
| SSE cleanup | 5 minutes | Remove agent and dashboard connections that are closed or older than 1 hour. |
| AI usage cleanup | On startup | Delete AI usage log rows older than 90 days. |

---

## Notification Manager

Tenant-keyed channel management with routing filters.

```
NotificationManager
│
├── _channels: dict[tenant_id, list[Channel]]
│     Keyed by tenant_id. Fan-out only iterates the approval's tenant's channels.
│     Zero cross-tenant dispatch by construction.
│
├── Channel types:
│   ├── TelegramChannel     (interactive: inline keyboard approve/deny buttons)
│   ├── SlackAppChannel      (interactive: Block Kit action buttons, HMAC-SHA256)
│   ├── SlackWebhookChannel  (one-way: incoming webhook with deep link)
│   ├── DiscordChannel       (interactive: component buttons, Ed25519 verification)
│   ├── WebhookChannel       (one-way: HTTP POST, optional HMAC-SHA256)
│   └── EmailChannel         (one-way: SMTP with deep link button)
│
├── Routing filters (per channel, AND logic):
│   ├── environments: list[str]      (must match approval env)
│   ├── agent_patterns: list[str]    (glob match on agent_id)
│   └── contract_names: list[str]    (glob match on contract_name)
│   Empty filter = receive everything.
│
└── Hot-reload: channels reload from DB on CRUD operations.
    No restart required to add/remove/modify channels.
```

---

## Source Layout

```
src/edictum_server/
├── main.py                 FastAPI app, lifespan (startup/shutdown), background workers
├── config.py               Pydantic Settings (env var parsing)
│
├── auth/
│   ├── provider.py         AuthProvider protocol (ABC)
│   ├── local.py            LocalAuthProvider (bcrypt + Redis sessions)
│   ├── api_keys.py         API key generation + verification
│   ├── dependencies.py     require_api_key, require_dashboard_auth, get_current_tenant
│   └── csrf.py             CSRF middleware
│
├── db/
│   ├── engine.py           SQLAlchemy async engine + session factory
│   └── models.py           All 16 SQLAlchemy models
│
├── routes/
│   ├── auth.py             Login, logout, me
│   ├── setup.py            Bootstrap wizard endpoint
│   ├── health.py           Health check
│   ├── keys.py             API key CRUD
│   ├── bundles.py          Bundle upload, list, deploy, evaluate
│   ├── contracts.py        Contract library CRUD
│   ├── compositions.py     Composition CRUD, preview, deploy
│   ├── deployments.py      Deployment history
│   ├── events.py           Event ingest + query
│   ├── approvals.py        Approval CRUD + decide
│   ├── sessions.py         Session key-value store
│   ├── agents.py           Fleet status, coverage, history
│   ├── agent_registrations.py  Agent CRUD, bulk assign
│   ├── assignment_rules.py Assignment rule CRUD, resolve
│   ├── stream.py           SSE endpoints (agent + dashboard)
│   ├── notifications.py    Channel CRUD + test
│   ├── settings.py         Signing key rotation, event purge
│   ├── ai.py               AI config, usage, assist
│   ├── stats.py            Overview + contract stats
│   ├── telegram.py         Telegram webhook callback
│   ├── slack.py            Slack interaction callback
│   └── discord.py          Discord interaction callback
│
├── services/
│   ├── bundle_service.py   Bundle upload, deploy, sign logic
│   ├── contract_service.py Contract library operations
│   ├── composition_service.py  Composition assembly
│   ├── approval_service.py Approval state machine, timeout expiry
│   ├── signing_service.py  Ed25519 key management, bundle signing
│   ├── event_service.py    Event ingest, query, partitioning
│   ├── coverage_service.py Agent coverage analysis
│   └── ai_service.py       AI provider integration
│
├── schemas/                Pydantic v2 request/response models (14 files)
│
├── push/
│   └── manager.py          PushManager (SSE connection management + dispatch)
│
├── notifications/
│   ├── manager.py          NotificationManager (tenant-keyed fan-out)
│   ├── base.py             NotificationChannel protocol (ABC)
│   ├── telegram.py         Telegram bot notifications
│   ├── slack_app.py        Slack App (interactive)
│   ├── slack_webhook.py    Slack incoming webhook
│   ├── discord.py          Discord bot notifications
│   ├── webhook.py          Generic webhook
│   └── email.py            SMTP email notifications
│
└── migrations/             Alembic (6 revisions)

dashboard/src/
├── main.tsx                React entry point
├── App.tsx                 Router + lazy-loaded pages
│
├── pages/
│   ├── login.tsx           Login page
│   ├── bootstrap.tsx       Setup wizard
│   ├── dashboard-home.tsx  Dashboard home
│   ├── events.tsx          Audit event feed
│   ├── approvals.tsx       Approval queue
│   ├── contracts.tsx       Contract management (4 tabs)
│   ├── agents.tsx          Fleet monitoring
│   ├── agent-detail.tsx    Per-agent detail page
│   ├── api-keys.tsx        API key management
│   └── settings.tsx        System settings
│
├── components/
│   ├── ui/                 shadcn/ui components (28 installed)
│   ├── sidebar.tsx         Navigation sidebar
│   ├── layout.tsx          Dashboard layout with auth guard
│   └── theme-toggle.tsx    Dark/light mode switch
│
└── lib/
    ├── api.ts              API client (all server calls)
    ├── format.ts           Formatting utilities
    ├── verdict-helpers.ts  Verdict colors, icons, styles
    ├── env-colors.ts       Environment badge colors
    ├── payload-helpers.ts  Event payload extraction
    └── histogram.ts        Chart histogram utilities
```

---

## Design Decisions

### Why In-Process SSE

No external message broker (RabbitMQ, Kafka) is required. Asyncio queues handle fan-out within a single process. This keeps the deployment simple (one Docker image) and eliminates an infrastructure dependency. The tradeoff: SSE connections are per-process, so horizontal scaling would require sticky sessions or a shared pub/sub layer. For the current target (single-instance self-hosted deployments), this is the right tradeoff.

### Why PostgreSQL Partitioning

Audit events are append-heavy and time-queried. Monthly range partitions on `created_at` enable efficient time-window queries and fast partition-level purges (drop partition vs. row-by-row DELETE). The partition worker ensures partitions exist 3 months ahead, so inserts never fail due to missing partitions.

### Why Redis for Sessions

Sessions are ephemeral — they have a TTL and need fast read/write. Redis provides atomic operations, TTL management, and O(1) lookup. If Redis goes down, users must re-login but no data is lost. The session cookie is HttpOnly (no JS access) with SameSite=lax and Secure (auto-set on HTTPS).

### Why NaCl SecretBox for Encryption

Ed25519 private keys, notification channel secrets, and AI API keys are encrypted at rest using NaCl SecretBox (XSalsa20-Poly1305). The encryption key comes from `EDICTUM_SIGNING_KEY_SECRET`. NaCl is simple, well-audited, and does not require key rotation ceremonies — the same key encrypts and decrypts.
