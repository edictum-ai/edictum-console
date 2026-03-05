# How the Console Works

Edictum Console is the coordination layer for governed AI agents. It does not evaluate contracts — agents do that locally. The console stores audit events, manages approval workflows, pushes contract updates, and monitors your fleet. One Docker image, three services, zero agent restarts when contracts change.

## When to use this

Read this page when you need to understand the boundary between the edictum core library (runs in your agent process) and the console (runs as a server). This is the starting point for understanding the system architecture: what runs where, how agents connect, and what happens when the server goes down.

## The Three Components

```
┌─────────────────────────────┐          ┌──────────────────────────┐
│  Your Agent Process          │          │  Edictum Console          │
│                              │          │                          │
│  edictum (core library)      │          │  FastAPI backend          │
│  ├─ Pipeline: pre/post eval  │          │  ├─ Contract storage     │
│  ├─ Sandbox enforcement      │          │  ├─ Bundle deployment    │
│  ├─ Session tracking         │          │  ├─ Approval workflow    │
│  └─ ALLOW / DENY decision    │          │  ├─ Event ingestion      │
│                              │   HTTP   │  ├─ SSE push             │
│  edictum[server] (SDK)       │◄────────►│  └─ Fleet monitoring     │
│  ├─ ServerAuditSink          │   SSE    │                          │
│  ├─ ServerApprovalBackend    │          │  Postgres + Redis        │
│  ├─ ServerBackend            │          │                          │
│  └─ ServerContractSource     │          ├──────────────────────────┤
│                              │          │  React SPA (dashboard)   │
│  Framework adapter           │          │  ├─ Contract management  │
│  (LangChain/CrewAI/Claude/…) │          │  ├─ Event feed           │
└──────────────────────────────┘          │  ├─ Approval queue       │
                                          │  ├─ Agent fleet view     │
                                          │  └─ Settings + keys      │
                                          └──────────────────────────┘
```

Three components, one principle: **evaluation = core library, coordination = console.**

## The Boundary Principle

The console never evaluates contracts in production. Every allow/deny decision runs in the agent process, in the core library, with zero network latency. The console handles everything that requires coordination across agents and humans.

| Capability | Core (agent-side) | Console (server-side) |
|---|---|---|
| Contract evaluation (pre, post, session, sandbox) | Yes | No (except playground) |
| Sandbox enforcement | Yes | No |
| Session tracking (single process) | Yes (MemoryBackend) | -- |
| Session tracking (distributed) | -- | Yes (ServerBackend) |
| Audit to stdout/file/OTel | Yes | -- |
| Centralized audit dashboard | -- | Yes |
| Approval (local CLI) | Yes (LocalApprovalBackend) | -- |
| Approval (production HITL) | -- | Yes (ServerApprovalBackend) |
| SSE hot-reload | -- | Yes |
| Fleet monitoring + drift detection | -- | Yes |
| Contract management UI | -- | Yes |
| Notification fan-out | -- | Yes |
| Bundle signing (Ed25519) | -- | Yes |

The one exception: `POST /api/v1/bundles/evaluate` is a playground endpoint for testing contracts in the dashboard. It evaluates a tool call against a bundle and returns the verdict. This is a development tool — agents never call it. Production evaluation is always agent-side.

## How an Agent Connects

When you call `Edictum.from_server()`, the SDK wires five components in sequence:

```
from_server(url, api_key, agent_id, env, bundle_name)
    |
    1. Create EdictumServerClient (HTTP base)
    |
    2. Fetch current bundle
    |     GET /api/v1/bundles/{bundle_name}/current?env={env}
    |     Response: yaml_bytes (base64), version, signature
    |     SDK decodes + loads contracts into pipeline
    |
    3. Start SSE subscription (background)
    |     GET /api/v1/stream?env={env}&bundle_name={name}&policy_version={hash}
    |     Receives: contract_update, approval_decided, assignment_changed
    |     On contract_update: Edictum.reload() atomically swaps contracts
    |
    4. Wire ServerAuditSink
    |     Batches events (50 events or 5 seconds, whichever first)
    |     POST /api/v1/events (batch ingest)
    |     10,000 event buffer. Silent dedup by call_id.
    |
    5. Wire ServerApprovalBackend + ServerBackend
    |     Approvals: POST to create, GET to poll (2s interval)
    |     Sessions: GET/PUT/DELETE for key-value, POST for atomic increment
    |
    --> Edictum instance ready. Same API as local usage.
```

After setup, agent code is identical to local usage:

```python
result = await guard.run("read_file", {"path": "data.csv"}, read_file)
```

The pipeline evaluates locally. Events stream to the console in the background. If a contract requires approval, the SDK posts a request and polls for the decision.

## Request Lifecycle

A complete tool call with a server-connected agent:

```
Agent decides to call "delete_records"
        |
  +--------------+
  |   Pipeline    |  <-- Runs in agent process
  |   pre_execute |
  +--------------+
        |
   Contract says effect: approve
        |
  POST /api/v1/approvals  ──────────────>  Console creates approval
        |                                        |
  Poll GET /api/v1/approvals/{id}          Notification fires
  (every 2 seconds)                        (Telegram/Slack/etc.)
        |                                        |
        |                                   Human clicks "Approve"
        |                                        |
        |                                   PUT /api/v1/approvals/{id}
        |<──────── decision: approved ──────────-┘
        |
  Tool executes (only if approved)
        |
  +--------------+
  | post_execute  |  <-- Postconditions checked locally
  +--------------+
        |
  Audit event queued ──> ServerAuditSink ──> POST /api/v1/events (batched)
```

For calls without approval gates, the flow is simpler: pre_execute locally, tool runs, post_execute locally, audit event batched and sent.

## What Happens When the Server Is Down

Edictum follows fail-closed semantics. If the console is unreachable:

- **Audit events**: buffer in memory (up to 10,000). When the connection resumes, the buffer flushes. If the buffer fills, oldest events are dropped.
- **Approval requests**: `POST /api/v1/approvals` fails. The error propagates to the pipeline. The pipeline treats this as a denial. The tool does not execute.
- **Session state**: `ServerBackend` calls fail. The pipeline converts backend errors to deny decisions.
- **Contract updates**: SSE connection drops. The SDK reconnects with exponential backoff (1s initial, 60s max). The agent continues enforcing its last-known contracts.

The agent never silently passes when the server is down. Every failure mode results in either a denial or continued enforcement of existing contracts.

## Server Architecture

```
┌────────────────────────────────────────────────────┐
│  Docker Container                                   │
│                                                     │
│  FastAPI (uvicorn, async)                           │
│  ├─ /api/v1/*         API routes (65+ endpoints)   │
│  ├─ /api/v1/stream    SSE (asyncio queues)          │
│  ├─ /dashboard/*      React SPA (static files)      │
│  └─ /                 Redirect to /dashboard         │
│                                                     │
│  Background Workers                                  │
│  ├─ Approval timeout    (every 10s)                 │
│  ├─ Partition manager   (every 24h)                 │
│  ├─ SSE cleanup         (every 5min)                │
│  └─ AI usage cleanup    (on startup)                │
│                                                     │
│  PushManager (in-process SSE)                        │
│  ├─ Per-env agent subscriptions                     │
│  ├─ Per-tenant dashboard subscriptions              │
│  └─ Targeted push to specific agents               │
│                                                     │
├─────────────┬───────────────────────────────────────┤
│  Postgres   │  Redis                                │
│  16 tables  │  Sessions (TTL)                       │
│  Partitioned│  Rate limits (sorted sets)            │
│  events     │  SSE state                            │
│  Alembic    │  Agent presence                       │
└─────────────┴───────────────────────────────────────┘
```

Everything runs in a single Docker image. `docker compose up` starts Postgres, Redis, and the server. The SPA is built at image build time and served as static files by FastAPI.

## Multi-Tenant Data Model

Every database table has a `tenant_id` column. Every query filters by it. The default deployment is single-tenant (one admin, one tenant, auto-created on bootstrap), but the data model supports multiple tenants from day one.

This is a deliberate architectural choice for a security product. Removing tenant isolation is harder than keeping it, and "we had isolation but removed it" is indefensible. The single-tenant UX hides this complexity — you never see tenant IDs in the dashboard.

## Next Steps

- [Contracts](contracts.md) -- the three-level contract model (contracts, compositions, bundles)
- [Hot-Reload](hot-reload.md) -- how SSE push delivers contract updates to running agents
- [Approvals](approvals.md) -- the HITL approval lifecycle
- [Security Model](security-model.md) -- authentication, tenant isolation, and cryptography
