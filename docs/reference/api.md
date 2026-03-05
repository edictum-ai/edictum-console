# API Reference

Edictum Console exposes 65+ endpoints across 17 route groups. All API routes are under `/api/v1/`.

## When to use this

Read this page when you need the exact HTTP method, path, authentication requirement, and request/response shape for any console endpoint. For SDK-specific integration details, see [SDK Compatibility](sdk-compat.md). For SSE event payloads, see [SSE Events](sse-events.md).

---

## Authentication Types

| Type | Header/Cookie | Used By |
|------|--------------|---------|
| **Cookie** | `edictum_session` HttpOnly cookie | Dashboard users. Set on login. |
| **API Key** | `Authorization: Bearer edk_{env}_{random}` + `X-Edictum-Agent-Id: {agent_id}` | Agents via `edictum[server]` SDK. |
| **Either** | Cookie or API Key | Endpoints accessible to both dashboard and agents. |
| **None** | — | Public endpoints (health, login, setup, webhooks). |

CSRF protection: mutating requests (POST/PUT/DELETE/PATCH) with cookie auth require `X-Requested-With` header. API key requests are exempt.

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/login` | None | Login with email/password. Sets HttpOnly session cookie. |
| `POST` | `/api/v1/auth/logout` | Cookie | Destroy session and clear cookie. |
| `GET` | `/api/v1/auth/me` | Cookie | Return current user info (user_id, tenant_id, email, is_admin). |

### Login Request

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

Rate limited per IP (default: 10 attempts per 300 seconds). Returns 429 with `Retry-After` header when exceeded. Constant-time response for wrong email and wrong password to prevent user enumeration.

---

## Setup

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/setup` | None | Create first admin user and tenant. Bootstrap lock — returns 409 if any user exists. |

### Setup Request

```json
{
  "email": "admin@example.com",
  "password": "min-12-characters"
}
```

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/health` | None | System health check. |

### Health Response

```json
{
  "status": "ok",
  "version": "0.1.0",
  "auth_provider": "local",
  "bootstrap_complete": true,
  "base_url_https": false,
  "database": {"connected": true, "latency_ms": 2.1},
  "redis": {"connected": true, "latency_ms": 0.8},
  "connected_agents": 3
}
```

Status is `"ok"` when Redis is reachable, `"degraded"` otherwise.

---

## API Keys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/keys` | Cookie | Create a new API key. Full key returned once — cannot be retrieved again. |
| `GET` | `/api/v1/keys` | Cookie | List all non-revoked API keys for the tenant. |
| `DELETE` | `/api/v1/keys/{key_id}` | Cookie | Revoke an API key. |

### Create Key Request

```json
{
  "env": "production",
  "label": "My Agent Key"
}
```

`env` must be one of: `production`, `staging`, `development`.

### Create Key Response

```json
{
  "id": "uuid",
  "key": "edk_production_CZxKQvN3mHz...",
  "prefix": "edk_production_CZxKQvN3",
  "env": "production",
  "label": "My Agent Key",
  "created_at": "2026-03-01T12:00:00Z"
}
```

---

## Contracts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/contracts` | Cookie | List contracts in library (latest versions, with optional type/tag/search filters). |
| `POST` | `/api/v1/contracts` | Cookie | Create a new contract in the library. |
| `POST` | `/api/v1/contracts/import` | Cookie | Import contracts from a YAML bundle (decompose into library). |
| `GET` | `/api/v1/contracts/{contract_id}` | Cookie | Get contract details (latest version + version history). |
| `GET` | `/api/v1/contracts/{contract_id}/versions/{version}` | Cookie | Get a specific version of a contract. |
| `PUT` | `/api/v1/contracts/{contract_id}` | Cookie | Update a contract (creates a new version). |
| `DELETE` | `/api/v1/contracts/{contract_id}` | Cookie | Delete a contract (all versions). Fails if referenced by a composition. |
| `GET` | `/api/v1/contracts/{contract_id}/usage` | Cookie | List compositions that use this contract. |

### Create Contract Request

```json
{
  "contract_id": "block-dotenv",
  "name": "Block .env reads",
  "description": "Prevent agents from reading environment files",
  "type": "pre",
  "definition": {
    "tools": ["read_file"],
    "when": { "args.path": { "matches": ".*\\.env.*" } },
    "then": { "effect": "deny", "message": "Reading .env files is not allowed" }
  },
  "tags": ["security", "filesystem"]
}
```

`contract_id` format: `[a-z0-9][a-z0-9_-]*`. `type` must be one of: `pre`, `post`, `session`, `sandbox`.

---

## Compositions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/compositions` | Cookie | List all compositions for the tenant. |
| `POST` | `/api/v1/compositions` | Cookie | Create a new composition. |
| `GET` | `/api/v1/compositions/{name}` | Cookie | Get composition detail with contract items. |
| `PUT` | `/api/v1/compositions/{name}` | Cookie | Update a composition (add/remove/reorder contracts). |
| `DELETE` | `/api/v1/compositions/{name}` | Cookie | Delete a composition. |
| `POST` | `/api/v1/compositions/{name}/preview` | Cookie | Assemble and return YAML without deploying. |
| `POST` | `/api/v1/compositions/{name}/deploy` | Cookie | Assemble, sign, deploy, and push the composed bundle. |

### Create Composition Request

```json
{
  "name": "devops-agent",
  "description": "Contracts for DevOps agents",
  "defaults_mode": "enforce",
  "update_strategy": "manual",
  "contracts": [
    { "contract_id": "block-dotenv", "position": 0, "mode_override": null, "enabled": true },
    { "contract_id": "log-all-writes", "position": 1, "mode_override": "observe", "enabled": true }
  ]
}
```

### Deploy Response

```json
{
  "bundle_name": "devops-agent",
  "bundle_version": 4,
  "contracts_assembled": [...],
  "deployment_id": "uuid"
}
```

---

## Bundles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/bundles` | Cookie | Upload a new bundle version. Name extracted from YAML `metadata.name`. |
| `GET` | `/api/v1/bundles` | Cookie | List distinct bundle names with summaries. |
| `GET` | `/api/v1/bundles/{name}` | Cookie | List all versions for a named bundle (newest first). |
| `GET` | `/api/v1/bundles/{name}/current` | Either | Get currently deployed bundle for a (name, env) pair. Returns `yaml_bytes` (base64). |
| `GET` | `/api/v1/bundles/{name}/{version}` | Either | Get a specific bundle version (metadata only). |
| `GET` | `/api/v1/bundles/{name}/{version}/yaml` | Either | Get raw YAML content (`Content-Type: application/x-yaml`). |
| `POST` | `/api/v1/bundles/{name}/{version}/deploy` | Cookie | Deploy a bundle version to an environment. Signs with Ed25519. Pushes SSE event. |
| `POST` | `/api/v1/bundles/evaluate` | Cookie | Evaluate contracts against a test tool call (playground, never called by agents). |

---

## Deployments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/deployments` | Cookie | List deployments (newest first). Optional filters: `env`, `bundle_name`, `limit`. |

---

## Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/events` | API Key | Batch ingest audit events from an agent. Deduplicates by `call_id`. |
| `GET` | `/api/v1/events` | Either | Query events with filters (agent_id, tool_name, verdict, mode, since, until, limit, search). |

### Batch Ingest Request

```json
{
  "events": [
    {
      "call_id": "unique-call-id-123",
      "agent_id": "my-agent",
      "tool_name": "read_file",
      "verdict": "allow",
      "mode": "enforce",
      "timestamp": "2026-03-01T12:00:00Z",
      "payload": {
        "tool_args": { "path": "data.csv" },
        "side_effect": "read",
        "environment": "production",
        "principal": null,
        "decision_source": "precondition",
        "decision_name": "block-dotenv",
        "reason": null,
        "policy_version": "abc123...",
        "bundle_name": "devops-agent"
      }
    }
  ]
}
```

### Batch Ingest Response

```json
{
  "accepted": 1,
  "duplicates": 0
}
```

---

## Approvals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/approvals` | API Key | Create a pending approval request. Rate limited: 10 per 60 seconds per agent. |
| `GET` | `/api/v1/approvals` | Either | List approvals. Optional filter: `status` (pending/approved/denied/timeout). |
| `GET` | `/api/v1/approvals/{approval_id}` | Either | Get a single approval by ID. |
| `PUT` | `/api/v1/approvals/{approval_id}` | Either | Submit a decision on a pending approval. |

### Create Approval Request

```json
{
  "agent_id": "my-agent",
  "tool_name": "delete_user",
  "tool_args": { "user_id": "u_123" },
  "message": "Agent wants to delete user account",
  "timeout": 300,
  "timeout_effect": "deny",
  "decision_source": "sandbox",
  "contract_name": "require-approval-for-deletes"
}
```

### Approval Response

```json
{
  "id": "uuid",
  "status": "pending",
  "agent_id": "my-agent",
  "tool_name": "delete_user",
  "tool_args": { "user_id": "u_123" },
  "message": "Agent wants to delete user account",
  "env": "production",
  "timeout_seconds": 300,
  "timeout_effect": "deny",
  "decision_source": "sandbox",
  "contract_name": "require-approval-for-deletes",
  "decided_by": null,
  "decided_at": null,
  "decision_reason": null,
  "decided_via": null,
  "created_at": "2026-03-01T12:00:00Z"
}
```

### Submit Decision Request

```json
{
  "approved": true,
  "decided_by": "admin@example.com",
  "reason": "Looks safe to proceed",
  "decided_via": "console"
}
```

---

## Sessions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/sessions/{key}` | API Key | Read a session value. Returns 404 if not found. |
| `PUT` | `/api/v1/sessions/{key}` | API Key | Set a session value. |
| `POST` | `/api/v1/sessions/{key}/increment` | API Key | Atomically increment a numeric value. |
| `DELETE` | `/api/v1/sessions/{key}` | API Key | Delete a session key. |

Key format: `^[a-zA-Z0-9_\-\.:/]+$`. Keys are namespaced by tenant in Redis: `session:{tenant_id}:{key}`.

---

## Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/agents/status` | Cookie | Live status of all connected agents. Optional filter: `bundle_name`. |
| `GET` | `/api/v1/agents/fleet-coverage` | Cookie | Fleet-level coverage summary. `since` param: `1h`, `6h`, `24h`, `7d`, `30d`, or ISO timestamp. |
| `GET` | `/api/v1/agents/{agent_id}/coverage` | Cookie | Per-agent tool coverage analysis. |
| `GET` | `/api/v1/agents/{agent_id}/history` | Cookie | Contract change timeline and drift history. |

### Agent Status Response

```json
{
  "agents": [
    {
      "agent_id": "my-agent",
      "env": "production",
      "bundle_name": "devops-agent",
      "policy_version": "abc123...",
      "status": "current",
      "connected_at": "2026-03-01T12:00:00Z"
    }
  ]
}
```

`status` values: `current` (policy matches deployed), `drift` (policy differs), `unknown` (no policy version reported).

---

## Agent Registrations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/agent-registrations` | Cookie | List all registered agents. |
| `PATCH` | `/api/v1/agent-registrations/{agent_id}` | Cookie | Update display name, tags, or bundle assignment. |
| `POST` | `/api/v1/agent-registrations/bulk-assign` | Cookie | Assign one bundle to multiple agents. Pushes `assignment_changed` SSE event. |

### Bulk Assign Request

```json
{
  "agent_ids": ["agent-1", "agent-2", "agent-3"],
  "bundle_name": "devops-agent"
}
```

---

## Assignment Rules

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/assignment-rules` | Cookie | List all rules, ordered by priority. |
| `POST` | `/api/v1/assignment-rules` | Cookie | Create a new rule. |
| `PATCH` | `/api/v1/assignment-rules/{rule_id}` | Cookie | Update an existing rule. |
| `DELETE` | `/api/v1/assignment-rules/{rule_id}` | Cookie | Delete a rule. |
| `GET` | `/api/v1/assignment-rules/resolve/{agent_id}` | Cookie | Dry-run: preview which bundle an agent would receive and why. |

### Create Rule Request

```json
{
  "priority": 10,
  "pattern": "prod-*",
  "tag_match": { "team": "platform" },
  "bundle_name": "devops-agent",
  "env": "production"
}
```

Pattern: glob-style matching on agent_id (1-200 printable ASCII characters, no path separators or null bytes).

### Resolve Response

```json
{
  "bundle_name": "devops-agent",
  "source": "rule",
  "rule_id": "uuid",
  "rule_pattern": "prod-*"
}
```

`source` values: `explicit` (set on agent registration), `rule` (matched assignment rule), `agent_provided` (from SSE query param), `none` (no match).

---

## SSE Streams

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/stream` | API Key | Agent SSE stream. Params: `env` (required), `bundle_name`, `policy_version`, `tags`. |
| `GET` | `/api/v1/stream/dashboard` | Cookie | Dashboard SSE stream. Receives all tenant events. |

See [SSE Events](sse-events.md) for full event type documentation and payload schemas.

---

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/notifications/channels` | Cookie | List all notification channels. |
| `POST` | `/api/v1/notifications/channels` | Cookie | Create a new channel. |
| `PUT` | `/api/v1/notifications/channels/{channel_id}` | Cookie | Update a channel. |
| `DELETE` | `/api/v1/notifications/channels/{channel_id}` | Cookie | Delete a channel. |
| `POST` | `/api/v1/notifications/channels/{channel_id}/test` | Cookie | Send a test notification. |

### Create Channel Request

```json
{
  "name": "Ops Telegram",
  "channel_type": "telegram",
  "config": {
    "bot_token": "123456:ABC-DEF...",
    "chat_id": "-1001234567890"
  },
  "filters": {
    "environments": ["production"],
    "agent_patterns": ["prod-*"],
    "contract_names": null
  }
}
```

Channel types: `telegram`, `slack`, `slack_app`, `discord`, `webhook`, `email`.

Secrets in `config` are encrypted at rest with NaCl SecretBox and masked in API responses.

---

## Settings & AI

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/settings/rotate-signing-key` | Cookie | Rotate Ed25519 signing key. Re-signs all active deployments. |
| `DELETE` | `/api/v1/settings/purge-events` | Cookie | Purge audit events older than N days. Query param: `older_than_days`. |
| `GET` | `/api/v1/settings/ai` | Cookie | Get AI config (API key masked). |
| `PUT` | `/api/v1/settings/ai` | Cookie | Create or update AI config. |
| `DELETE` | `/api/v1/settings/ai` | Cookie | Delete AI config. |
| `POST` | `/api/v1/settings/ai/test` | Cookie | Test AI provider connection (latency probe). |
| `GET` | `/api/v1/settings/ai/usage` | Cookie | Get AI usage stats with daily breakdown. |
| `POST` | `/api/v1/contracts/assist` | Cookie | Streaming AI contract assistant. |

### AI Config Request

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "base_url": null
}
```

Providers: `anthropic`, `openai`, `openrouter`, `ollama`.

---

## Webhooks

External integration endpoints called by notification platforms. No console authentication — each platform uses its own verification.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/telegram/webhook/{channel_id}` | Telegram secret | Telegram callback query (approve/deny buttons). |
| `POST` | `/api/v1/slack/interactions` | HMAC-SHA256 | Slack App button interactions. 5-minute replay protection. |
| `GET` | `/api/v1/slack/manifest` | None | Slack App manifest for installation. |
| `POST` | `/api/v1/discord/interactions` | Ed25519 | Discord component button interactions. |

---

## Statistics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/stats/overview` | Either | Dashboard home stats (pending approvals, active agents, events/denials in 24h). |
| `GET` | `/api/v1/stats/contracts` | Cookie | Per-contract evaluation stats with time range. |
