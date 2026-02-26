# SDK Compatibility Contract

> The `edictum[server]` SDK (in `~/project/edictum/src/edictum/server/`) expects these exact API paths, headers, response schemas, and SSE event names. The console server MUST match.
> Source: edictum v0.11.3

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
        "policy_version": "string"
      }
    }
  ]
}
Response: {"accepted": int, "duplicates": int}
```
SDK does NOT validate response shape — any 2xx is success.
Batching: 50 events or 5 seconds, whichever comes first. Max buffer: 10,000.

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
GET /api/v1/stream
Header: Accept: text/event-stream
Auth: Bearer {api_key}
```

**Event format:**
```
event: contract_update
data: {"version": 7, "revision_hash": "abc123", ...}
```

**CRITICAL:** Event name MUST be `contract_update`. The existing edictum-server sends `bundle_deployed` — this is a bug that must be fixed.

SDK behavior:
- `ServerContractSource` listens for `event.event == "contract_update"`
- Parses `event.data` as JSON
- Yields the parsed dict
- Auto-reconnects with exponential backoff (1s initial, 60s max)

### Bundles (Dashboard-only, not used by SDK)

**Get bundle YAML (NEW — needed for contract push):**
```
GET /api/v1/bundles/{version}/yaml
Auth: Bearer {api_key}
Response: raw YAML bytes (Content-Type: application/x-yaml)
```
This endpoint does not exist yet. Needed as fallback if SSE payload doesn't include YAML bytes.

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
