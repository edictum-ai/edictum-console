# Architecture

Edictum Console is a FastAPI backend with a React SPA dashboard, backed by PostgreSQL and Redis.

## High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Edictum Console                                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        Dashboard (React SPA)                      │   │
│  │  Served from /dashboard/* — static files with client-side routing │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│                                   ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        API (FastAPI)                              │   │
│  │  /api/v1/* — REST endpoints for all operations                    │   │
│  │  /api/v1/stream — SSE for real-time events                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│                    ┌──────────────┴──────────────┐                      │
│                    ▼                             ▼                       │
│  ┌─────────────────────────┐    ┌────────────────────────────┐         │
│  │      PostgreSQL         │    │         Redis              │         │
│  │  - Tenants              │    │  - Sessions (cookie auth)  │         │
│  │  - Users                │    │  - Agent state             │         │
│  │  - API Keys (hashed)    │    │  - Approval queues         │         │
│  │  - Contracts            │    │  - SSE subscriptions       │         │
│  │  - Events (partitioned) │    │  - Rate limiting           │         │
│  │  - Approvals            │    │                            │         │
│  └─────────────────────────┘    └────────────────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### API Layer (FastAPI)

The API is organized into domain routers:

| Router | Purpose |
|--------|---------|
| `auth` | Login, logout, session management |
| `keys` | API key CRUD |
| `bundles` | Contract bundle management |
| `deployments` | Contract deployment to environments |
| `events` | Event ingestion from agents |
| `approvals` | Human-in-the-loop approval workflow |
| `sessions` | Agent session state |
| `notifications` | Notification channel management |
| `stream` | SSE real-time event streaming |

### Domain-Driven Design

Code is organized by domain, not by technical layer:

```
src/edictum_server/
├── auth/           # Authentication logic
├── db/             # Models, engine, migrations
├── schemas/        # Pydantic request/response schemas
├── routes/         # FastAPI route handlers
├── services/       # Business logic
├── notifications/  # Notification channel implementations
├── push/           # SSE push infrastructure
├── redis/          # Redis client utilities
└── security/       # Input validation, SSRF protection
```

### Event Storage

Events are stored in PostgreSQL with time-based partitioning for performance:

```sql
-- Automatic partitioning by day
SELECT ensure_event_partitions(3);  -- Create 3 months of partitions
```

Each event includes:
- Agent ID and tenant
- Tool name and arguments
- Contract evaluation result (allowed/denied)
- Timestamp
- Session context

### Real-Time Updates

Server-Sent Events (SSE) power the live dashboard:

```
GET /api/v1/stream
Authorization: Bearer edk_production_xxx
Accept: text/event-stream
```

Event types:
- `tool_call` — Agent made a tool call
- `approval_request` — New approval pending
- `approval_decision` — Human responded
- `bundle_deployed` — Contract updated
- `agent_connected` / `agent_disconnected`

## Authentication

Two authentication modes:

### Dashboard Auth (Humans)
- Email/password login
- HttpOnly secure session cookie
- Redis-backed sessions with TTL
- CSRF protection

### API Auth (Agents)
- Opaque API keys: `edk_{env}_{random}`
- Bearer token in Authorization header
- bcrypt hashed in database (prefix-indexed for lookup)
- Tenant resolution from key

## Multi-Tenancy

Every data model has a `tenant_id` foreign key. All queries filter by tenant:

```python
# Automatic tenant filtering
@router.get("/api/v1/keys")
async def list_keys(
    tenant: Tenant = Depends(get_current_tenant)
):
    return await db.execute(
        select(ApiKey).where(ApiKey.tenant_id == tenant.id)
    )
```

Tenants are isolated — no cross-tenant data access is possible.

## Notification Channels

Pluggable notification system:

```python
class NotificationChannel(Protocol):
    async def send(self, event: NotificationEvent) -> None: ...
    async def close(self) -> None: ...
```

Built-in channels:
- Telegram (interactive approvals)
- Slack (interactive approvals)
- Discord
- Generic Webhook
- Email (SMTP)

## Security Architecture

See [Security Reference](../reference/security.md) for details.

Key points:
- All input validated via Pydantic
- SSRF protection on webhook URLs
- XSS sanitization on string fields
- SQL injection impossible (ORM)
- Path traversal blocked (resolve + startswith)
- Rate limiting on auth endpoints
