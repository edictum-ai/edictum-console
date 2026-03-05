# SDK Compatibility

The `edictum[server]` SDK connects agents to the console. This page documents the exact API contract between them — paths, headers, response schemas, and SSE event names. The console server MUST match these expectations.

## When to use this

Read this page when you are building or debugging the connection between an agent running `edictum[server]` and a console instance. If an agent can't fetch bundles, post events, or receive SSE updates, the mismatch is documented here. This page is the source of truth for SDK version v0.12+.

---

## Authentication

Every SDK request includes:

```
Authorization: Bearer {api_key}
X-Edictum-Agent-Id: {agent_id}
Content-Type: application/json
```

- `api_key`: format `edk_{env}_{random}` (e.g., `edk_production_CZxKQvN3mHz...`)
- `agent_id`: string identifier, default `"default"`

---

## Error Handling

| Status | SDK Behavior |
|--------|-------------|
| 4xx | `EdictumServerError(status_code, response.text)` — no retry |
| 5xx | Exponential backoff retry (0.5s, 1s, 2s), max 3 attempts, then raise |
| Connection error | Same retry as 5xx |

---

## API Endpoints

### Bundles

**List bundle names (summaries):**

```
GET /api/v1/bundles
```

```json
[
  {
    "name": "devops-agent",
    "latest_version": 3,
    "version_count": 3,
    "last_updated": "2026-03-01T12:00:00Z",
    "deployed_envs": ["production", "staging"]
  }
]
```

**List versions for a named bundle:**

```
GET /api/v1/bundles/{name}
```

```json
[
  {
    "id": "uuid",
    "tenant_id": "uuid",
    "name": "devops-agent",
    "version": 3,
    "revision_hash": "abc123...",
    "signature_hex": "hex|null",
    "source_hub_slug": "string|null",
    "source_hub_revision": "string|null",
    "uploaded_by": "user_id",
    "created_at": "2026-03-01T12:00:00Z",
    "deployed_envs": ["production"]
  }
]
```

**Upload a bundle version:**

Name extracted from YAML `metadata.name`.

```
POST /api/v1/bundles
Body: {"yaml_content": "string"}
Response: BundleResponse (see above, without deployed_envs)
```

**Get currently deployed bundle:**

```
GET /api/v1/bundles/{name}/current?env={env}
```

Response includes `yaml_bytes` (base64-encoded YAML content) in addition to standard `BundleResponse` fields.

**Get bundle YAML:**

```
GET /api/v1/bundles/{name}/{version}/yaml
Response: raw YAML bytes (Content-Type: application/x-yaml)
```

**Deploy a bundle version:**

```
POST /api/v1/bundles/{name}/{version}/deploy
Body: {"env": "production"}
```

```json
{
  "id": "uuid",
  "env": "production",
  "bundle_name": "devops-agent",
  "bundle_version": 3,
  "deployed_by": "user_id",
  "created_at": "2026-03-01T12:00:00Z"
}
```

**Evaluate bundle (dashboard playground only):**

Not used by the SDK. Development-time endpoint for testing contracts in the dashboard.

```
POST /api/v1/bundles/evaluate
Body: {
  "yaml_content": "string",
  "tool_name": "string",
  "tool_args": {},
  "environment": "string|null",
  "agent_id": "string|null",
  "principal": {"user_id": "string", "role": "string", "claims": {}} | null
}
```

```json
{
  "verdict": "string",
  "mode": "string",
  "contracts_evaluated": [],
  "deciding_contract": "string|null",
  "policy_version": "string",
  "evaluation_time_ms": 1.23
}
```

---

### Deployments

**List deployments:**

```
GET /api/v1/deployments?bundle_name={name}&env={env}&limit={n}
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `bundle_name` | No | — | Filter by bundle name |
| `env` | No | — | Filter by environment |
| `limit` | No | 50 | Max results |

---

### Approvals

**Create approval request:**

```
POST /api/v1/approvals
```

```json
{
  "agent_id": "string",
  "tool_name": "string",
  "tool_args": {},
  "message": "string",
  "timeout": 300,
  "timeout_effect": "deny"
}
```

Response: `{"id": "string", "status": "pending", ...}`

SDK reads: `response["id"]`

**Poll for decision:**

```
GET /api/v1/approvals/{approval_id}
```

| Status | Response |
|--------|----------|
| Approved | `{"status": "approved", "decided_by": "string", "decision_reason": "string\|null"}` |
| Denied | `{"status": "denied", "decided_by": "string", "decision_reason": "string\|null"}` |
| Timeout | `{"status": "timeout"}` |

SDK checks: `response["status"]` — must be one of `"approved"`, `"denied"`, `"timeout"`.

Poll interval: 2.0 seconds (configurable).

---

### Audit Events

**Batch post:**

```
POST /api/v1/events
```

```json
{
  "events": [
    {
      "call_id": "string",
      "agent_id": "string",
      "tool_name": "string",
      "verdict": "string",
      "mode": "enforce",
      "timestamp": "2026-03-01T12:00:00Z",
      "payload": {
        "tool_args": {},
        "side_effect": "string",
        "environment": "string",
        "principal": null,
        "decision_source": "string",
        "decision_name": "string",
        "reason": null,
        "policy_version": "string",
        "bundle_name": "string|null"
      }
    }
  ]
}
```

Response: `{"accepted": 1, "duplicates": 0}`

SDK does NOT validate response shape — any 2xx is success. Batching: 50 events or 5 seconds, whichever comes first. Max buffer: 10,000. `bundle_name` in payload is optional (SDK v0.12+).

---

### Session Storage

**Get value:**

```
GET /api/v1/sessions/{key}
Response: {"value": "string|null"}
404: key does not exist → SDK returns None
```

**Set value:**

```
PUT /api/v1/sessions/{key}
Body: {"value": "string"}
Response: any 2xx
```

**Delete:**

```
DELETE /api/v1/sessions/{key}
Response: any 2xx (404 is OK — SDK ignores it)
```

**Atomic increment:**

```
POST /api/v1/sessions/{key}/increment
Body: {"amount": 1.0}
Response: {"value": 42.0}
```

SDK reads: `response["value"]` as the new counter value.

---

### SSE Stream

**Subscribe to contract updates:**

```
GET /api/v1/stream?env={env}&bundle_name={name}&policy_version={hash}
Header: Accept: text/event-stream
Auth: Bearer {api_key}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `env` | Yes | Environment to subscribe to |
| `bundle_name` | No | Filter `contract_update` events to this bundle only. When omitted, all events for the tenant are forwarded. |
| `policy_version` | No | Revision hash the agent is currently running. Used for drift detection. |

**`contract_update` event:**

```
event: contract_update
data: {
  "type": "contract_update",
  "bundle_name": "devops-agent",
  "version": 3,
  "revision_hash": "abc123...",
  "signature": "hex|null",
  "public_key": "hex|null",
  "yaml_bytes": "base64-encoded YAML"
}
```

Event name MUST be `contract_update`. The `public_key` field is the hex-encoded Ed25519 public key for future signature verification (`edictum[verified]`).

**`bundle_uploaded` event:**

```
event: bundle_uploaded
data: {
  "type": "bundle_uploaded",
  "bundle_name": "devops-agent",
  "version": 3,
  "revision_hash": "abc123...",
  "uploaded_by": "user_123"
}
```

SDK behavior:

- `ServerContractSource` listens for `event.event == "contract_update"`
- Parses `event.data` as JSON, yields the parsed dict
- Auto-reconnects with exponential backoff (1s initial, 60s max)

---

### Agent Fleet Status (Dashboard-only)

```
GET /api/v1/agents/status?bundle_name={name}
Auth: Dashboard session cookie
```

```json
{
  "agents": [
    {
      "agent_id": "string",
      "env": "production",
      "bundle_name": "devops-agent",
      "policy_version": "abc123...",
      "status": "current",
      "connected_at": "2026-03-01T12:00:00Z"
    }
  ]
}
```

`status` is computed at read time: compares `policy_version` against the currently deployed `revision_hash` for the agent's environment. Values: `current`, `drift`, `unknown`.

---

## SDK Classes

| Class | Purpose | Key Config |
|-------|---------|------------|
| `EdictumServerClient` | HTTP client | `base_url`, `api_key`, `agent_id`, `timeout=30`, `max_retries=3` |
| `ServerApprovalBackend` | HITL approvals | `poll_interval=2.0` |
| `ServerAuditSink` | Batched events | `batch_size=50`, `flush_interval=5.0`, `max_buffer_size=10_000` |
| `ServerBackend` | Session state | Fail-closed (errors propagate to deny) |
| `ServerContractSource` | SSE contracts | `reconnect_delay=1.0`, `max_reconnect_delay=60.0` |

---

## Standalone Mode

edictum works without a server:

```python
guard = Edictum.from_yaml("contracts.yaml")  # No server_url, no api_key
```

- Contracts from local YAML
- Session state: `MemoryBackend` (in-process)
- Approvals: `LocalApprovalBackend` (CLI prompt)
- Audit: `StdoutAuditSink` or `FileAuditSink`
- No network calls. The server is always optional.
