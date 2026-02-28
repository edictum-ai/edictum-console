# SDK Compatibility Contract

> The `edictum[server]` SDK (in `~/project/edictum/src/edictum/server/`) expects these exact API paths, headers, response schemas, and SSE event names. The console server MUST match.
> Source: edictum v0.12+

## Authentication

Every request includes:
```
Authorization: Bearer {api_key}
X-Edictum-Agent-Id: {agent_id}
Content-Type: application/json
```

- `api_key`: format `edk_{env}_{random}` (e.g., `edk_production_CZxKQvN3mHz...`)
- `agent_id`: string identifier, default `"default"`

## Error Handling

- **4xx** → `EdictumServerError(status_code, response.text)` — no retry
- **5xx** → exponential backoff retry (0.5s, 1s, 2s), max 3 attempts, then raise
- **Connection errors** → same retry as 5xx

## API Endpoints

### Bundles (Name-Scoped Routes)

**List bundle names (summaries):**
```
GET /api/v1/bundles
Response: [
  {
    "name": "devops-agent",
    "latest_version": 3,
    "version_count": 3,
    "last_updated": "ISO8601",
    "deployed_envs": ["production", "staging"]
  }
]
```

**List versions for a named bundle:**
```
GET /api/v1/bundles/{name}
Response: [
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
    "created_at": "ISO8601",
    "deployed_envs": ["production"]
  }
]
```

**Upload a bundle version (name extracted from YAML `metadata.name`):**
```
POST /api/v1/bundles
Body: {"yaml_content": "string"}
Response: BundleResponse (see above, without deployed_envs)
```

**Deploy a bundle version:**
```
POST /api/v1/bundles/{name}/{version}/deploy
Body: {"env": "production"}
Response: {
  "id": "uuid",
  "env": "production",
  "bundle_name": "devops-agent",
  "bundle_version": 3,
  "deployed_by": "user_id",
  "created_at": "ISO8601"
}
```

**Get bundle YAML:**
```
GET /api/v1/bundles/{name}/{version}/yaml
Response: raw YAML bytes (Content-Type: application/x-yaml)
```

**Get currently deployed bundle for a (name, env):**
```
GET /api/v1/bundles/{name}/current?env={env}
Response: BundleResponse
```

**Evaluate bundle (dashboard playground only, not used by SDK):**
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
Response: {
  "verdict": "string",
  "mode": "string",
  "contracts_evaluated": [...],
  "deciding_contract": "string|null",
  "policy_version": "string",
  "evaluation_time_ms": float
}
```

### Deployments

**List deployments:**
```
GET /api/v1/deployments?bundle_name={name}&env={env}&limit={n}
Response: DeploymentResponse[]
```
- `bundle_name` (optional): filter by bundle name
- `env` (optional): filter by environment
- `limit` (optional, default 50): max results

### Approvals

**Create approval request:**
```
POST /api/v1/approvals
Body: {
  "agent_id": "string",
  "tool_name": "string",
  "tool_args": {},
  "message": "string",
  "timeout": 300,
  "timeout_effect": "deny" | "allow"
}
Response: {"id": "string", "status": "pending"}
```
SDK uses: `response["id"]`

**Poll for decision:**
```
GET /api/v1/approvals/{approval_id}
Response (approved): {"status": "approved", "decided_by": "string", "decision_reason": "string|null"}
Response (denied):   {"status": "denied", "decided_by": "string", "decision_reason": "string|null"}
Response (timeout):  {"status": "timeout"}
```
SDK checks: `response["status"]` must be one of `"approved"`, `"denied"`, `"timeout"`
SDK reads: `response.get("decided_by")`, `response.get("decision_reason")`
Poll interval: 2.0 seconds (configurable)

### Audit Events

**Batch post:**
```
POST /api/v1/events
Body: {
  "events": [
    {
      "call_id": "string",
      "agent_id": "string",
      "tool_name": "string",
      "verdict": "string",
      "mode": "enforce" | "report",
      "timestamp": "ISO8601",
      "payload": {
        "tool_args": {},
        "side_effect": "string",
        "environment": "string",
        "principal": null | {},
        "decision_source": "string",
        "decision_name": "string",
        "reason": null | "string",
        "policy_version": "string",
        "bundle_name": "string|null"
      }
    }
  ]
}
Response: {"accepted": int, "duplicates": int}
```
SDK does NOT validate response shape — any 2xx is success.
Batching: 50 events or 5 seconds, whichever comes first. Max buffer: 10,000.

Note: `bundle_name` in event payload is optional (SDK v0.12+). Older agents omit it.

### Session Storage

**Get value:**
```
GET /api/v1/sessions/{key}
Response: {"value": "string|null"}
404: key does not exist → SDK returns None
```
SDK reads: `response.get("value")`

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
Body: {"amount": float}
Response: {"value": float}
```
SDK reads: `response["value"]` as the new counter value.

### SSE Stream

**Subscribe to contract updates:**
```
GET /api/v1/stream?env={env}&bundle_name={name}&policy_version={hash}
Header: Accept: text/event-stream
Auth: Bearer {api_key}
```

Query parameters:
- `env` (required): environment to subscribe to
- `bundle_name` (optional): filter `contract_update` events to this bundle only. When omitted, all `contract_update` events for the tenant are forwarded (backward compatible).
- `policy_version` (optional): revision_hash the agent is currently running. Used for drift detection on the fleet status endpoint.

**`contract_update` event (on deploy):**
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

**CRITICAL:** Event name MUST be `contract_update`.

Fields:
- `bundle_name`: name of the deployed bundle
- `public_key`: hex-encoded public key for signature verification (from signing key row). SDK stores but doesn't verify yet — ready for `edictum[verified]`.

**`bundle_uploaded` event (on upload):**
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
- Parses `event.data` as JSON
- Yields the parsed dict
- Auto-reconnects with exponential backoff (1s initial, 60s max)

### Agent Fleet Status (Dashboard-only)

**Get connected agents:**
```
GET /api/v1/agents/status?bundle_name={name}
Auth: Dashboard session cookie
Response: {
  "agents": [
    {
      "agent_id": "string",
      "env": "production",
      "bundle_name": "devops-agent|null",
      "policy_version": "abc123...|null",
      "status": "current" | "drift" | "unknown",
      "connected_at": "ISO8601"
    }
  ]
}
```

- `bundle_name` (optional): filter to agents running this bundle
- `status` is computed at read time: compares `policy_version` against the currently deployed `revision_hash` for the agent's env.

## SDK Classes

| Class | Purpose | Key Config |
|-------|---------|------------|
| `EdictumServerClient` | HTTP client | `base_url`, `api_key`, `agent_id`, `timeout=30`, `max_retries=3` |
| `ServerApprovalBackend` | HITL approvals | `poll_interval=2.0` |
| `ServerAuditSink` | Batched events | `batch_size=50`, `flush_interval=5.0`, `max_buffer_size=10_000` |
| `ServerBackend` | Session state | Fail-closed (errors propagate → deny) |
| `ServerContractSource` | SSE contracts | `reconnect_delay=1.0`, `max_reconnect_delay=60.0` |

## Standalone Mode (No Server)

edictum works without a server:
```python
guard = Edictum.from_yaml("contracts.yaml")  # No server_url, no api_key
```
- Contracts from local YAML
- Session state: `MemoryBackend` (in-process)
- Approvals: `LocalApprovalBackend` (CLI prompt)
- Audit: `StdoutAuditSink` or `FileAuditSink`
- No network calls. The server is always optional.
