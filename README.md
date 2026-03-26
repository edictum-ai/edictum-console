# Edictum Console

[![License](https://img.shields.io/badge/license-FSL--1.1--ALv2-blue?cacheSeconds=86400)](LICENSE.md)
[![Python](https://img.shields.io/badge/python-3.12%2B-blue?cacheSeconds=86400)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&cacheSeconds=86400)](https://ghcr.io/edictum-ai/edictum-console)

Self-hostable operations console for governed AI agents.

[Edictum](https://github.com/edictum-ai/edictum) enforces contracts. Edictum Console shows you what happened, and lets you change what happens next -- without restarting agents.

**65+ API endpoints** · **6 notification channels** · **Hot-reload contracts** · **Self-hosted**

## Why This Exists

You deployed edictum contracts to your agent fleet. Tool calls are governed. But now:

**No visibility.** An agent denied a call in production at 3 AM. Which contract? Which tool? What were the arguments? You grep through logs and find a one-line denial message.

**No live updates.** You tuned a contract. To pick it up, every agent needs a restart. In production. With active sessions.

**No approval workflow.** Your agent needs human sign-off before a destructive operation. The contract says `effect: approve`. But where does the request go? Who sees it?

Edictum Console solves all three. One Docker image. Five minutes to deploy.

<p align="center">
  <img src="docs/images/dashboard-home.png" alt="Edictum Console — Dashboard overview with pending approvals, verdict distribution, activity feed, and agent fleet" width="100%">
</p>

## Quick Start

**You need:** Docker. That's it.

```bash
git clone https://github.com/edictum-ai/edictum-console.git
cd edictum-console
cp .env.example .env

# Generate secrets
python3 -c "import secrets; print(f'POSTGRES_PASSWORD={secrets.token_hex(16)}'); print(f'EDICTUM_SECRET_KEY={secrets.token_hex(32)}'); print(f'EDICTUM_SIGNING_KEY_SECRET={secrets.token_hex(32)}')" >> .env

docker compose up -d
```

### See it work in 60 seconds

The try-it script does everything for you — creates an admin account, deploys
demo contracts, connects a simulated agent, and runs tool calls that produce
governance events. No API keys, no accounts, no configuration.

```bash
./examples/try-it.sh
```

```
1. Checking console...          OK
2. Creating admin account...    Created: demo@edictum.dev
3. Creating API key...          Key: edk_production_bdZ18_NkpL...
4. Deploying contracts...       Bundle 'try-it' v1 deployed to production
5. AI assistant                 skipped (pass --openrouter-key to enable)
6. Running governed agent...

  [ 1] ALLOW  get_weather(city='Tokyo')
  [ 2] ALLOW  read_file(path='/home/user/notes.txt')
  [ 3] ALLOW  send_email(to='alice@company.com', subject='Report', body='Q1 done')
  [ 4] DENY   read_file(path='/etc/passwd')
         -> Denied: sensitive file '/etc/passwd'
  [ 5] DENY   send_email(to='leak@competitor.com', subject='Data', body='...')
         -> Denied: can only email @company.com, not 'leak@competitor.com'
  [ 6] ALLOW  get_weather(city='London')
  [ 7] ALLOW  get_weather(city='Berlin')
  [ 8] DENY   get_weather(city='Sydney')
         -> Per-tool limit: get_weather called 3 times (limit: 3).
  [ 9] ALLOW  search_web(query='edictum governance')
  [10] ALLOW  read_file(path='/home/user/readme.md')

  Open the dashboard: http://localhost:8000/dashboard
```

Open the dashboard to see every event, verdict, and contract in action.

**Optional:** the console has an AI contract assistant that generates YAML from
plain English. To try it, pass a free [OpenRouter](https://openrouter.ai/keys)
key (no cost, uses `google/gemma-3-1b-it:free`):

```bash
./examples/try-it.sh --openrouter-key sk-or-v1-...
```

### Connect your own agent

All three Edictum SDKs -- Python, Go, and TypeScript -- can connect to the console. Here's the Python example:

```bash
pip install edictum[server]
```

```python
from edictum import Edictum

guard = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_...",   # create in Dashboard > API Keys
    agent_id="my-agent",
    env="production",
    bundle_name="my-contracts",
)

# Every tool call is now governed — events stream to console,
# approvals route through dashboard, contract updates arrive via SSE.
result = await guard.run("read_file", {"path": "data.csv"}, read_file)
```

Edictum works with any framework — LangChain, CrewAI, OpenAI Agents, Claude SDK,
and [5 more](https://github.com/edictum-ai/edictum#adapters). See
[examples/demo-agent/](examples/demo-agent/) for a full LangChain example.

See [examples/demo-agent/](examples/demo-agent/) for a full LangChain ReAct agent with 8 contract types.

## What You Get

### Contract Management

Versioned contract library with composition model:

| Level | What it is | Purpose |
|-------|-----------|---------|
| **Contract** | Individual governance rule | Authoring unit. Versioned. Reusable across bundles. |
| **Composition** | Ordered recipe of contracts | Assembly recipe. Per-contract mode overrides. |
| **Bundle** | Assembled, signed YAML | Deployed artifact. Pushed to agents via SSE. |

Bundle versioning, YAML diff viewer, evaluation playground, and AI contract assistant (Anthropic, OpenAI, OpenRouter, Ollama).

<p align="center">
  <img src="docs/images/contracts-page.png" alt="Contract library with AI assistant, preconditions, postconditions, and sandbox rules" width="100%">
</p>

### Live Hot-Reload

Deploy a contract -- connected agents pick it up instantly. Zero downtime.

- SSE push to subscribed agents, filtered by environment and bundle
- Ed25519 signed bundles with key rotation
- Auto-reconnect with exponential backoff

### Human-in-the-Loop Approvals

Agent requests approval -- notification fires -- human approves or denies -- agent proceeds.

- Dashboard queue with timer badges and bulk actions
- Interactive approve/deny buttons in Telegram, Slack, and Discord
- Configurable timeout with deny or allow fallback
- Rate-limited (10 requests per 60 seconds per agent)

<p align="center">
  <img src="docs/images/approvals-queue.png" alt="Approval queue with pending requests from pharma, devops, and finance agents" width="100%">
</p>

### Notification Channels

Six channel types. Configure in the dashboard -- no env vars, no restarts.

| Channel | Interactive | Notes |
|---------|:-----------:|-------|
| Telegram | Yes | Inline keyboard buttons |
| Slack App | Yes | Block Kit action buttons |
| Slack Webhook | No | One-way with deep link |
| Discord | Yes | Component buttons |
| Webhook | No | Generic HTTP POST with optional HMAC |
| Email | No | SMTP with deep link |

Routing filters per channel: environments, agent patterns (globs), contract names.

### Audit Event Feed

Datadog-style three-panel layout: faceted filter sidebar, time-sorted event list with histogram, and full event detail. URL-driven filters for sharing views. PostgreSQL-partitioned by month.

<p align="center">
  <img src="docs/images/events-feed.png" alt="Audit event feed with filters, histogram, and denied transfer_funds event detail" width="100%">
</p>

### Fleet Monitoring

- Live connected agents with environment, bundle, and policy version
- Drift detection per agent (current vs deployed bundle)
- Coverage analysis: every tool classified as enforced, observed, or ungoverned
- Agent detail pages with coverage, analytics, and contract change history

<p align="center">
  <img src="docs/images/fleet-monitoring.png" alt="Fleet monitoring with 100% coverage, 4 agents, drift detection, and coverage bars" width="100%">
</p>

### Agent Assignment

Three-level bundle resolution: explicit assignment > pattern-matching rules > agent-provided. Bulk assignment, dry-run resolution preview, glob patterns for agent matching.

## Architecture

Single Docker image. FastAPI serves the React SPA and API from one process.

```
GET /dashboard/*     -> React SPA
GET /api/v1/*        -> FastAPI API
GET /api/v1/stream   -> SSE stream (API key auth)
GET /api/v1/health   -> Health check
```

**Stack**: FastAPI + SQLAlchemy 2.0 + Alembic + Postgres 16 + Redis 7 + React 19 + TypeScript + Vite + Tailwind + shadcn/ui.

> **Note:** The current release supports a single console instance. SSE events are broadcast in-process; multi-instance deployments behind a load balancer require the Redis pub/sub bridge, which is on the [roadmap](https://docs.edictum.ai/docs/roadmap). Running multiple instances today will result in agents missing SSE events from other instances.

> **Note:** The console server does not emit OpenTelemetry telemetry in the current release. Centralized observability (OTel spans on API requests, metrics export, and fleet-wide OTel configuration) is [planned](https://docs.edictum.ai/docs/roadmap#planned-centralized-observability).

## How It Connects to Edictum

```
+-----------------------------+     +----------------------------------+
|  Your Agent Process         |     |  Edictum Console (this repo)     |
|                             |     |                                  |
|  edictum (core library)     |     |  FastAPI + React SPA             |
|  +- Evaluates contracts     |     |  +- Contract management          |
|  +- Enforces tool calls     |     |  +- Deployment + SSE push        |
|  +- Fails closed            |     |  +- Approval workflow            |
|                             |     |  +- Audit event storage          |
|  edictum[server] (SDK)      |<--->|  +- Fleet monitoring             |
|  +- ServerAuditSink         |     |  +- Notification fan-out         |
|  +- ServerApprovalBackend   |     |                                  |
|  +- ServerBackend           |     |  Postgres + Redis                |
|  +- ServerContractSource    |     |  Single Docker image             |
+-----------------------------+     +----------------------------------+
```

**Core is standalone.** `Edictum.from_yaml("contracts.yaml")` works without a server. Console is an optional enhancement.

**`pip install edictum[server]`** adds the SDK:

| SDK Class | Purpose |
|-----------|---------|
| `EdictumServerClient` | HTTP client (base_url, api_key, agent_id) |
| `ServerAuditSink` | Batched event ingestion (50 events / 5s flush, 10K buffer) |
| `ServerApprovalBackend` | HITL approval polling (2s interval) |
| `ServerBackend` | Session state storage (atomic increment) |
| `ServerContractSource` | SSE contract subscription (auto-reconnect) |

Console never evaluates contracts in production. Agents evaluate locally. Console stores events, manages approvals, and pushes contract updates.

## Deploy

### Docker Compose (recommended)

```bash
cp .env.example .env
# Fill in secrets (see Environment Variables below)
docker compose up -d
```

### Published Image

```bash
docker pull ghcr.io/edictum-ai/edictum-console:latest
```

### Railway

`railway.toml` included. Health check at `/api/v1/health`.

## Security

- **Fail closed**: Server unreachable -- errors propagate -- deny.
- **Authentication**: Local auth (email/bcrypt, min 12 chars). Server-side sessions in Redis.
- **API keys**: Env-scoped (`edk_{env}_{random}`), bcrypt hashed, prefix-indexed.
- **Tenant isolation**: Every table has `tenant_id`. Every query filters by it.
- **Cryptography**: Ed25519 bundle signing. NaCl SecretBox for secrets at rest.
- **Bootstrap lock**: Admin creation only works when zero users exist.
- **CSRF protection**: `X-Requested-With` header on cookie-auth mutating requests.
- **Rate limiting**: Login (per IP, sliding window) + approvals (per tenant+agent) + event ingestion (per tenant, 10K/min).

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_PASSWORD` | Yes | -- | Postgres container password |
| `EDICTUM_SECRET_KEY` | Yes | -- | Session token signing |
| `EDICTUM_SIGNING_KEY_SECRET` | Yes | -- | Ed25519 key encryption (32-byte hex) |
| `EDICTUM_ADMIN_EMAIL` | First run | -- | Bootstrap admin email |
| `EDICTUM_ADMIN_PASSWORD` | First run | -- | Bootstrap admin password (min 12 chars) |
| `EDICTUM_BASE_URL` | No | `http://localhost:8000` | Public URL for webhooks, CORS, cookies |
| `EDICTUM_ENV_NAME` | No | `development` | `production` disables OpenAPI docs |

## API

65+ endpoints across 17 route groups. Full SDK compatibility contract in [SDK_COMPAT.md](SDK_COMPAT.md).

## Ecosystem

| Repo | Role | Link |
|------|------|------|
| edictum | Python SDK (reference) | [github.com/edictum-ai/edictum](https://github.com/edictum-ai/edictum) |
| edictum-go | Go SDK | [github.com/edictum-ai/edictum-go](https://github.com/edictum-ai/edictum-go) |
| edictum-ts | TypeScript SDK | [github.com/edictum-ai/edictum-ts](https://github.com/edictum-ai/edictum-ts) |
| edictum-console | Ops Console | [github.com/edictum-ai/edictum-console](https://github.com/edictum-ai/edictum-console) |
| edictum-schemas | Contract schemas | [github.com/edictum-ai/edictum-schemas](https://github.com/edictum-ai/edictum-schemas) |
| edictum-demo | Demos & benchmarks | [github.com/edictum-ai/edictum-demo](https://github.com/edictum-ai/edictum-demo) |

- [Documentation](https://docs.edictum.ai)
- [PyPI -- edictum](https://pypi.org/project/edictum/)

## License

[FSL-1.1-ALv2](LICENSE.md) — source available, converts to Apache 2.0 after two years.
