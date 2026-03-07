# Edictum Console

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?cacheSeconds=86400)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12%2B-blue?cacheSeconds=86400)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&cacheSeconds=86400)](https://ghcr.io/acartag7/edictum-console)

Self-hostable operations console for governed AI agents.

[Edictum](https://github.com/acartag7/edictum) enforces contracts. Edictum Console shows you what happened, and lets you change what happens next — without restarting agents.

## Why This Exists

You deployed edictum contracts to your agent fleet. Tool calls are governed. But now:

**No visibility.** An agent denied a call in production at 3 AM. Which contract? Which tool? What were the arguments? You grep through logs and find a one-line denial message. No context, no history, no way to search.

**No live updates.** You tuned a contract — relaxed a threshold, added an exception. To pick it up, every agent needs a restart. In production. With active sessions. At 3 AM.

**No approval workflow.** Your agent needs human sign-off before executing a destructive operation. The contract says `effect: approval_required`. But where does the approval request go? Who sees it? How does the agent get the decision back?

Edictum Console solves all three. One Docker image. Five minutes to deploy.

## The 5-Minute Demo

### Option A: Pull and Run (recommended)

```bash
# 1. Download the compose file
$ curl -fsSL https://raw.githubusercontent.com/acartag7/edictum-console/master/deploy/docker-compose.yml -o docker-compose.yml

# 2. Create .env with your secrets
$ cat <<EOF > .env
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_hex(16))")
EDICTUM_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
EDICTUM_SIGNING_KEY_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
EOF

# 3. Start everything
$ docker compose up -d

# 4. Open http://localhost:8000/dashboard/setup
#    Create your admin account (min 12 characters password)

# 5. Create an API key
#    Dashboard → API Keys → Create Key → Copy the full key (shown once)
```

### Option B: Build from Source

```bash
# 1. Clone and configure
$ git clone https://github.com/acartag7/edictum-console.git
$ cd edictum-console
$ cp .env.example .env

# 2. Generate secrets
$ python -c "import secrets; print(f'EDICTUM_SECRET_KEY={secrets.token_hex(32)}')" >> .env
$ python -c "import secrets; print(f'EDICTUM_SIGNING_KEY_SECRET={secrets.token_hex(32)}')" >> .env
$ python -c "import secrets; print(f'POSTGRES_PASSWORD={secrets.token_hex(16)}')" >> .env

# 3. Start everything
$ docker compose up -d

# 4. Open http://localhost:8000/dashboard/setup
#    Create your admin account (min 12 characters password)

# 5. Create an API key
#    Dashboard → API Keys → Create Key → Copy the full key (shown once)
```

Now connect your agent:

```python
from edictum import Edictum

guard = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_CZxKQvN3mHz...",
    agent_id="my-agent",
    env="production",
    bundle_name="my-contracts",
)

# Use guard.run() as usual — events stream to console,
# approvals route through dashboard + notifications,
# contract updates arrive via SSE with zero restarts.
result = await guard.run("read_file", {"path": "data.csv"}, read_file)
```

Deploy a contract bundle in the dashboard. The agent picks it up instantly — no restart, no redeployment. Change a contract, deploy again, live in seconds.

## What You Get

### Contract Management

Individual contracts stored in a versioned library. Each update creates a new version — old versions preserved. Search by type (pre/post/session/sandbox), tag, or free text. Import existing YAML bundles to decompose them into library contracts.

**Composable contracts** — the three-level model:

| Level | What it is | Purpose |
|-------|-----------|---------|
| **Contract** | Individual governance rule | Authoring unit. Versioned. Reusable across bundles. |
| **Composition** | Ordered recipe of contracts | Assembly recipe. Per-contract mode overrides (enforce/observe). |
| **Bundle** | Assembled, signed YAML | Deployed artifact. Pushed to agents via SSE. |

Compositions let you mix and match contracts: pick from the library, set ordering, override modes per contract, preview the assembled YAML, then deploy. The same contract can appear in multiple compositions.

**Bundle versioning.** Upload raw YAML or assemble from compositions. Every upload auto-increments version. SHA-256 revision hash computed for drift detection.

**Diff viewer.** YAML diff between any two bundle versions with change summary.

**Playground.** Evaluate contracts against test tool calls without deploying. Enter tool name + JSON args, select a bundle, see verdict + contract evaluation trace. Includes replay mode (re-evaluate past events against current contracts) and preset examples.

**AI contract assistant.** Streaming chat that helps you write contracts. Knows the full edictum contract schema: 4 contract types, 13 selectors, 15 operators, 5 effects. Supports Anthropic (Claude), OpenAI (GPT), OpenRouter (any model), and Ollama (local). Per-tenant config with encrypted API keys and usage tracking (tokens, cost estimates, daily breakdown).

### Live Hot-Reload

Deploy a contract → connected agents pick it up instantly. Zero downtime, zero restarts.

- **SSE push**: agents subscribe to `GET /api/v1/stream` with their environment. On deploy, the server pushes a `contract_update` event with the signed YAML.
- **Bundle-filtered streams**: agents only receive updates for their assigned bundle. No noise.
- **Ed25519 signed bundles**: every deployed bundle is cryptographically signed. Signature + public key included in the SSE event.
- **Key rotation**: generate a new Ed25519 keypair, auto-re-sign all currently-deployed bundles. One click in the dashboard.
- **Auto-reconnect**: SDK reconnects with exponential backoff (1s initial, 60s max).

### Human-in-the-Loop Approvals

Agent requests approval → notification fires → human approves or denies → agent proceeds.

```
Agent calls tool → contract says "approval_required"
→ POST /api/v1/approvals (creates pending request)
→ Notification fires (Telegram / Slack / Discord / Email / Webhook)
→ Human clicks Approve or Deny (in chat or dashboard)
→ Agent polls GET /api/v1/approvals/{id} → receives decision
→ Tool executes or is denied
```

**Dashboard queue**: auto-switches between card view (< 5 pending) and table view (>= 5). Timer badges show urgency: green (safe) → amber (warning) → red (expiring soon). Bulk approve/deny with checkbox selection. Deny with reason dialog.

**Interactive notifications**: approve/deny buttons directly in Telegram (inline keyboard), Slack (Block Kit actions), and Discord (component buttons). Click a button → approval decision recorded → original message updated → agent proceeds. No need to open the dashboard.

**Timeout handling**: configurable timeout per approval + timeout effect (deny or allow). Background worker runs every 10 seconds, expires overdue approvals, pushes SSE events, updates notification messages.

**Decision tracking**: every approval records who decided, when, via which channel (`console`, `telegram`, `slack`, `discord`), and the decision reason.

**Rate-limited**: 10 approval requests per 60 seconds per agent. Prevents runaway loops.

### Notification Channels

Six channel types. Configure in the dashboard — no env vars, no restarts.

| Channel | Interactive Approve/Deny | Notes |
|---------|:------------------------:|-------|
| **Telegram** | Yes | Bot token + chat_id. Inline keyboard buttons. Webhook secret validation. |
| **Slack App** | Yes | Bot token + signing_secret. Block Kit action buttons. HMAC-SHA256 + replay protection. |
| **Slack Webhook** | No | Incoming webhook URL. One-way notifications with deep link to dashboard. |
| **Discord** | Yes | Bot token + public_key. Component buttons. Ed25519 interaction signature verification. |
| **Webhook** | No | Generic HTTP POST. Optional HMAC-SHA256 secret for payload verification. |
| **Email** | No | SMTP. Deep link button to dashboard. |

**Routing filters** per channel: environments (list), agent patterns (globs like `prod-*`), contract names (globs). AND logic across dimensions — all non-empty filters must match. Empty filter = receive everything.

**Secrets encrypted at rest** with NaCl SecretBox. Masked in API responses (`edk_••••mHz`).

**Test button** per channel — send a test notification to verify configuration.

### Audit Event Feed

Agents batch-post audit events to `POST /api/v1/events`. Up to 10,000 events buffered by the SDK (50 events or 5 seconds, whichever comes first). Silent deduplication by `call_id`.

**Dashboard**: three-panel Datadog-style layout.

| Panel | Contents |
|-------|----------|
| **Filter sidebar** | Faceted filters with counts: agent_id, tool_name, verdict, mode, contract name |
| **Event list** | Time-sorted events with histogram bar chart. Text search. Time window selector (15m → 30d + custom) |
| **Detail panel** | Full event: contracts evaluated, decision context, tool arguments, provenance |

**URL-driven filters**: filter state synced to URL search params. Share a link, colleague sees the same view.

**PostgreSQL-partitioned** by month. Background worker ensures partitions exist 3 months ahead. Purge events older than N days from the dashboard danger zone.

### Fleet Monitoring

- **Live connected agents**: every SSE-connected agent appears with environment, bundle, policy version, and connected timestamp.
- **Drift detection**: per-agent comparison of reported policy version against currently deployed bundle. Status: `current`, `drift`, or `unknown`.
- **Coverage analysis**: per-agent and fleet-level. Each tool classified as enforced (enforce-mode contract), observed (report-mode only), or ungoverned (no contract). Fleet summary shows total agents, coverage percentage, ungoverned tools list sorted by agent count.
- **Agent auto-registration**: agents register on first SSE connection. `last_seen_at` updated on every connect.
- **Agent detail page**: coverage tab (tool-by-tool), analytics tab (time-series), history tab (contract change timeline + drift events).
- **Ungoverned sidebar**: fleet page shows ungoverned tools across all agents. Click a tool to filter the agent table.

### Agent Assignment System

Three-level bundle resolution (highest priority first):

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | **Explicit assignment** | `bundle_name` set directly on the agent registration |
| 2 | **Assignment rules** | Pattern-matching rules, priority-ordered. Glob on agent_id + optional tag match. |
| 3 | **Agent-provided** | `bundle_name` query parameter on SSE stream connection |

**Assignment rules**: priority-ordered per tenant. Glob patterns for agent_id (e.g., `prod-*`, `agent-?`). Optional tag matching (AND logic). Pattern validated: 1-200 printable ASCII, no path separators or null bytes.

**Bulk assignment**: assign one bundle to multiple agents in a single API call. Pushes `assignment_changed` SSE event to each affected agent.

**Dry-run resolution**: `GET /api/v1/assignment-rules/resolve/{agent_id}` — preview which bundle an agent would receive and why (source: explicit/rule/none, matched rule ID and pattern).

### Dashboard

React SPA served by FastAPI at `/dashboard`. Dark and light mode. Real-time updates via SSE on every page.

| Page | What it shows |
|------|--------------|
| **Home** | Stats bar, triage column (pending approvals with inline approve/deny), activity feed, agent fleet grid. Getting-started wizard for first-time users. |
| **Events** | Three-panel event feed (filters + list/histogram + detail). Faceted filters, time windows, text search. |
| **Approvals** | Pending tab (card/table auto-mode) + history tab. Timer badges, bulk actions, urgency banner. |
| **Contracts** | Four tabs: Library (CRUD + AI assistant), Bundles (upload/compose/deploy/diff), Deployments (history), Evaluate (playground). |
| **Agents** | Fleet summary, ungoverned sidebar, agent table, agent detail pages (coverage/analytics/history). |
| **API Keys** | Create, list, revoke keys. Key shown once on creation. |
| **Settings** | System health, notification channels, AI config + usage, danger zone (key rotation, event purge). |

### Security

**Authentication**:
- Local auth provider (email/password, bcrypt, min 12 chars). AuthProvider protocol for future OIDC.
- Server-side sessions in Redis with configurable TTL (default 24h). HttpOnly cookies. Secure flag auto-set on HTTPS.
- API keys: env-scoped (`edk_{env}_{random}`), one-way bcrypt hashed (with SHA-256 prehash), prefix-indexed for fast lookup. Full key shown only at creation.
- CSRF protection: `X-Requested-With` header required on cookie-auth mutating requests. API-key requests exempt.
- Rate limiting: login (per IP, sliding window, Redis sorted sets) + approvals (per tenant+agent, 10/60s). Returns 429 with `Retry-After`.
- User enumeration prevention: constant-time response for wrong email and wrong password.

**Tenant isolation**:
- Every database table has `tenant_id`. Every query filters by it. No exceptions.
- Sessions namespaced in Redis: `session:{tenant_id}:{key}`.
- SSE: agents only receive events for their own tenant.
- Notification manager: tenant-keyed dict. Zero cross-tenant fan-out by construction.
- Webhook callbacks: tenant resolved from Redis keyed by `{platform}:tenant:{channel_id}:{approval_id}`.

**Cryptography**:
- Ed25519 bundle signing with private keys encrypted at rest (NaCl SecretBox).
- Notification channel config secrets encrypted at rest (NaCl SecretBox).
- AI API keys encrypted at rest (NaCl SecretBox).
- Discord interaction verification (Ed25519). Slack interaction verification (HMAC-SHA256 + 5-min replay window). Telegram webhook secret header.

**Fail closed**: server unreachable → errors propagate → deny. The agent never silently passes when the server is down.

**Bootstrap lock (S7)**: admin creation (env-var or setup wizard) only works when zero users exist. Returns 409 after first admin.

**Adversarial test suite**: 43+ tests across 8 security boundaries (session bypass, API key bypass, tenant isolation, approval state, SSE channel, signature bypass, bootstrap lock, rate limit). Tenant isolation is a ship-blocker — any cross-tenant read/write/inference fails the build.

### Settings

- **System**: health dashboard showing database latency, Redis latency, connected agents, auth provider, bootstrap status, HTTPS status. Auto-refreshes every 30 seconds.
- **Notifications**: channel CRUD, enable/disable toggle, routing filters, test message, HTTPS warning for interactive channels.
- **AI**: provider config (Anthropic/OpenAI/OpenRouter/Ollama), encrypted API key, model override, base URL, test connection (latency probe), usage stats with daily breakdown chart.
- **Danger Zone**: rotate Ed25519 signing key (re-signs active deployments), purge audit events older than 30/60/90 days.

## How It Connects to Edictum

```
┌─────────────────────────────┐     ┌──────────────────────────────────┐
│  Your Agent Process         │     │  Edictum Console (this repo)     │
│                             │     │                                  │
│  edictum (core library)     │     │  FastAPI + React SPA             │
│  ├─ Evaluates contracts     │     │  ├─ Contract management          │
│  ├─ Enforces tool calls     │     │  ├─ Deployment + SSE push        │
│  └─ Fails closed            │     │  ├─ Approval workflow            │
│                             │     │  ├─ Audit event storage          │
│  edictum[server] (SDK)      │◄───►│  ├─ Fleet monitoring             │
│  ├─ ServerAuditSink         │     │  └─ Notification fan-out         │
│  ├─ ServerApprovalBackend   │     │                                  │
│  ├─ ServerBackend           │     │  Postgres + Redis                │
│  └─ ServerContractSource    │     │  Single Docker image             │
└─────────────────────────────┘     └──────────────────────────────────┘
```

**Core is standalone.** `guard = Edictum.from_yaml("contracts.yaml")` works without a server. Console is an optional enhancement.

**`pip install edictum[server]`** adds the SDK that bridges agents to the console:

| SDK Class | Purpose |
|-----------|---------|
| `EdictumServerClient` | HTTP client (base_url, api_key, agent_id) |
| `ServerAuditSink` | Batched event ingestion (50 events / 5s flush, 10K buffer) |
| `ServerApprovalBackend` | HITL approval polling (2s interval) |
| `ServerBackend` | Session state storage (key-value, atomic increment) |
| `ServerContractSource` | SSE contract subscription (auto-reconnect, exponential backoff) |

**Console never evaluates contracts in production.** Agents evaluate locally. Console stores events, manages approvals, and pushes contract updates. Exception: the playground endpoint (`POST /api/v1/bundles/evaluate`) is a development-time tool for testing contracts in the dashboard.

## Connect Your Agent

```bash
$ pip install edictum[server]
```

```python
from edictum import Edictum

# Connect to console — fetches contracts, streams updates, sends events
guard = await Edictum.from_server(
    url="http://localhost:8000",         # Console URL
    api_key="edk_production_CZxKQvN3...", # From dashboard → API Keys
    agent_id="my-agent",                 # Unique agent identifier
    env="production",                    # Environment (matches API key scope)
    bundle_name="my-contracts",          # Bundle to subscribe to (optional)
    tags={"team": "platform"},           # Tags for assignment rules (optional)
)

# Use exactly like local edictum — same API, same contracts
try:
    result = await guard.run("read_file", {"path": "data.csv"}, read_file)
except EdictumDenied as e:
    print(e.reason)
```

The agent automatically:
- Fetches the currently deployed bundle on connect
- Subscribes to SSE for live contract updates
- Sends audit events in batches
- Routes approval requests through the console
- Stores session state on the server
- Reconnects with exponential backoff if the connection drops

## Environment Variables

All prefixed with `EDICTUM_` (except `POSTGRES_PASSWORD`).

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_PASSWORD` | Yes | — | Postgres container password |
| `EDICTUM_SECRET_KEY` | Yes | — | Session token signing. Startup failure if missing. |
| `EDICTUM_SIGNING_KEY_SECRET` | Yes (for deploys) | — | Ed25519 key encryption (32-byte hex). Required for bundle signing. |
| `EDICTUM_ADMIN_EMAIL` | First run | — | Bootstrap admin email (alternative: setup wizard) |
| `EDICTUM_ADMIN_PASSWORD` | First run | — | Bootstrap admin password (min 12 chars) |
| `EDICTUM_BASE_URL` | No | `http://localhost:8000` | Public URL for webhooks, CORS, secure cookies |
| `EDICTUM_AUTH_PROVIDER` | No | `local` | Auth provider type |
| `EDICTUM_SESSION_TTL_HOURS` | No | `24` | Session cookie lifetime |
| `EDICTUM_ENV_NAME` | No | `development` | Runtime environment. `production` disables OpenAPI docs. |
| `EDICTUM_CORS_ORIGINS` | No | `localhost:8000,3000` | Comma-separated allowed origins |
| `EDICTUM_RATE_LIMIT_MAX_ATTEMPTS` | No | `10` | Login/approval rate limit max attempts |
| `EDICTUM_RATE_LIMIT_WINDOW_SECONDS` | No | `300` | Rate limit sliding window |

Generate secrets:

```bash
$ python -c "import secrets; print(secrets.token_hex(32))"
```

## Architecture

Single Docker image. FastAPI serves the React SPA and the API from one process.

```
GET /                    → Redirect to /dashboard
GET /dashboard/*         → React SPA (client-side routing)
GET /api/v1/*            → FastAPI API routes
GET /api/v1/health       → Health check (no auth)
GET /api/v1/stream       → SSE stream (API key auth)
```

**Stack**: FastAPI (async, uvicorn) + SQLAlchemy 2.0 (async) + Alembic + Postgres 16 + Redis 7 + React 19 + TypeScript + Vite + Tailwind + shadcn/ui.

**Multi-stage Dockerfile**: Stage 1 builds React SPA (pnpm → dist/). Stage 2 builds Python package. Stage 3: slim runtime with static assets + Python app.

**Background workers**:

| Worker | Interval | Purpose |
|--------|----------|---------|
| Approval timeout | 10 seconds | Expire pending approvals, push SSE, notify channels |
| Partition worker | 24 hours | Ensure PostgreSQL event partitions exist 3 months ahead |
| SSE cleanup | 5 minutes | Remove stale/closed SSE connections |
| AI usage cleanup | On startup | Delete AI usage logs older than 90 days |

**SSE**: in-process PushManager using asyncio queues. No external message broker required. Per-environment agent subscriptions. Per-tenant dashboard subscriptions. Targeted push to specific agents.

## Deploy

### Docker Compose (recommended)

Three services: `postgres:16`, `redis:7-alpine`, `server`. Health checks on all dependencies. Persistent volume for Postgres data.

```bash
$ cp .env.example .env
# Fill in secrets (see Environment Variables)
$ docker compose up -d
```

### Published Image

The published image is available on GHCR:

```bash
docker pull ghcr.io/acartag7/edictum-console:latest
```

A production-ready `deploy/docker-compose.yml` uses the published image — no build step required. See the [Self-Hosting Guide](https://console-docs.edictum.dev/guides/self-hosting/) for details.

### Railway

`railway.toml` included. Health check at `/api/v1/health` with 60s timeout. Restart on failure (max 3 retries).

### Kubernetes

Kustomize manifests in `deploy/k8s/`. Helm chart coming soon.

## API Reference

65+ endpoints across 17 route groups. Full SDK compatibility contract in [SDK_COMPAT.md](SDK_COMPAT.md).

| Category | Endpoints | Auth | Description |
|----------|-----------|------|-------------|
| Auth | 3 | None/Cookie | Login, logout, current user |
| Setup | 1 | None | First-run admin bootstrap |
| Health | 1 | None | Status, latency, connected agents |
| API Keys | 3 | Cookie | Create, list, revoke |
| Contracts | 8 | Cookie | Library CRUD, import, usage, AI assist |
| Compositions | 7 | Cookie | CRUD, preview, deploy |
| Bundles | 8 | Cookie/API key | Upload, list, deploy, evaluate |
| Deployments | 1 | Cookie | Deployment history |
| Events | 2 | API key/Cookie | Batch ingest, query with filters |
| Approvals | 4 | API key/Cookie | Create, poll, list, decide |
| Sessions | 4 | API key | Key-value store, atomic increment |
| Agents | 4 | Cookie | Fleet status, coverage, history |
| Agent Registrations | 3 | Cookie | List, update, bulk assign |
| Assignment Rules | 5 | Cookie | CRUD, dry-run resolution |
| SSE Stream | 2 | API key/Cookie | Agent stream, dashboard stream |
| Notifications | 5 | Cookie | Channel CRUD, test |
| Settings & AI | 8 | Cookie | Signing key, purge, AI config, usage |

**Webhook endpoints** (external integrations): Telegram callback, Slack interactions (HMAC-SHA256), Discord interactions (Ed25519), Slack app manifest.

## Database

16 tables. 6 Alembic migrations. Events table PostgreSQL-partitioned by month.

| Table | Description |
|-------|-------------|
| `tenants` | Customer organizations |
| `users` | Local user accounts (email/bcrypt password) |
| `api_keys` | bcrypt-hashed API keys with env scope |
| `signing_keys` | Ed25519 keypairs (encrypted private keys) |
| `bundles` | Versioned contract bundles (YAML + signature) |
| `deployments` | Bundle deployment records (env + timestamp) |
| `events` | Audit events from agent tool calls (partitioned by month) |
| `approvals` | HITL approval requests with state machine |
| `notification_channels` | Channel configs (encrypted secrets) |
| `contracts` | Versioned individual contracts in library |
| `bundle_compositions` | Composition recipes |
| `bundle_composition_items` | Contract membership within compositions |
| `agent_registrations` | Persistent agent identities |
| `assignment_rules` | Pattern-based bundle assignment rules |
| `tenant_ai_configs` | Per-tenant AI provider configuration |
| `ai_usage_logs` | AI token usage and cost tracking |

## License

[AGPL-3.0-only](LICENSE)

## Links

- [Edictum (core library)](https://github.com/acartag7/edictum)
- [Documentation](https://docs.edictum.dev/)
- [PyPI — edictum](https://pypi.org/project/edictum/)
