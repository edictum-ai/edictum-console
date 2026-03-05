# SSE Events

Edictum Console uses Server-Sent Events (SSE) to push real-time updates to agents and dashboards. Two separate streams serve different audiences with different event types.

## When to use this

Read this page when you are debugging SSE connections, building a custom SSE client, or understanding which events fire on which actions. Every event type, its payload schema, and the conditions that trigger it are documented here.

---

## Agent Stream

```
GET /api/v1/stream?env={env}&bundle_name={name}&policy_version={hash}&tags={json}
Auth: API key (Authorization: Bearer edk_...)
```

Agents connect to this endpoint to receive contract updates, approval decisions, and assignment changes in real time.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `env` | Yes | Environment to subscribe to (e.g., `production`, `staging`) |
| `bundle_name` | No | Filter `contract_update` events to this bundle only. When omitted, all `contract_update` events for the tenant are forwarded. |
| `policy_version` | No | SHA-256 revision hash the agent is currently running. Used for drift detection on the fleet status endpoint. |
| `tags` | No | JSON-encoded agent tags (e.g., `{"team": "platform"}`). Used for assignment rule matching. |

### Connection Behavior

On connect, the stream endpoint:

1. Validates the API key and resolves `tenant_id` + `env`
2. Auto-registers the agent if not already known (creates an `agent_registrations` row)
3. Resolves bundle assignment if `bundle_name` is not provided (explicit assignment → rule match → agent-provided)
4. Subscribes the connection to `PushManager._connections[env]`
5. Sends a keepalive comment (`: keepalive`) periodically

On disconnect, the connection is removed from the PushManager. Stale connections are cleaned up every 5 minutes.

### Agent Events

#### `contract_update`

Fired when a bundle is deployed to the agent's environment.

```
event: contract_update
data: {
  "type": "contract_update",
  "bundle_name": "devops-agent",
  "version": 3,
  "revision_hash": "abc123def456...",
  "signature": "ed25519-hex-signature|null",
  "public_key": "ed25519-hex-public-key|null",
  "yaml_bytes": "base64-encoded-yaml-content"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Always `"contract_update"` |
| `bundle_name` | `string` | Name of the deployed bundle |
| `version` | `int` | Bundle version number |
| `revision_hash` | `string` | SHA-256 hash of the YAML content |
| `signature` | `string\|null` | Hex-encoded Ed25519 signature |
| `public_key` | `string\|null` | Hex-encoded Ed25519 public key for verification |
| `yaml_bytes` | `string` | Base64-encoded YAML bundle content |

The SDK decodes `yaml_bytes` from base64 and passes it to `Edictum.reload()` for atomic contract swap. If `bundle_name` was provided on connection, only updates matching that bundle are forwarded.

#### `approval_decided`

Fired when a human approves or denies a pending approval request for this agent.

```
event: approval_decided
data: {
  "type": "approval_decided",
  "approval_id": "uuid",
  "status": "approved",
  "decided_by": "admin@example.com",
  "decision_reason": "Looks safe to proceed"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Always `"approval_decided"` |
| `approval_id` | `string` | UUID of the approval request |
| `status` | `string` | `"approved"` or `"denied"` |
| `decided_by` | `string` | Email or identifier of the decision-maker |
| `decision_reason` | `string\|null` | Optional reason provided with the decision |

#### `assignment_changed`

Fired when an agent's bundle assignment changes (via bulk assign or rule update).

```
event: assignment_changed
data: {
  "type": "assignment_changed",
  "agent_id": "my-agent",
  "bundle_name": "new-bundle",
  "source": "explicit"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Always `"assignment_changed"` |
| `agent_id` | `string` | The affected agent |
| `bundle_name` | `string\|null` | New bundle assignment (null if unassigned) |
| `source` | `string` | Assignment source: `"explicit"`, `"rule"`, or `"none"` |

---

## Dashboard Stream

```
GET /api/v1/stream/dashboard
Auth: Session cookie (HttpOnly)
```

Dashboard users connect to this endpoint to receive real-time updates across all environments for their tenant.

### Dashboard Events

The dashboard stream forwards events matching this whitelist:

| Event Type | Trigger |
|------------|---------|
| `approval_created` | Agent creates a new approval request |
| `approval_decided` | Human approves or denies an approval |
| `approval_timeout` | Pending approval expires |
| `assignment_changed` | Agent bundle assignment modified |
| `bundle_uploaded` | New bundle version uploaded |
| `composition_changed` | Composition created, updated, or deleted |
| `contract_created` | New contract added to library |
| `contract_update` | Bundle deployed to an environment |
| `contract_updated` | Existing contract version updated |
| `event_created` | New audit event ingested |
| `api_key_created` | New API key created |
| `api_key_revoked` | API key revoked |
| `bundle_deployed` | Bundle deployed to environment |
| `signing_key_rotated` | Ed25519 signing key rotated |

#### `approval_created`

```json
{
  "type": "approval_created",
  "approval_id": "uuid",
  "agent_id": "my-agent",
  "tool_name": "delete_user",
  "message": "Agent wants to delete user account",
  "env": "production",
  "timeout_seconds": 300,
  "contract_name": "require-approval-for-deletes"
}
```

#### `approval_timeout`

```json
{
  "type": "approval_timeout",
  "approval_id": "uuid",
  "agent_id": "my-agent",
  "tool_name": "delete_user"
}
```

#### `bundle_uploaded`

```json
{
  "type": "bundle_uploaded",
  "bundle_name": "devops-agent",
  "version": 3,
  "revision_hash": "abc123...",
  "uploaded_by": "user_123"
}
```

#### `event_created`

```json
{
  "type": "event_created",
  "event_id": "uuid",
  "agent_id": "my-agent",
  "tool_name": "read_file",
  "verdict": "allow"
}
```

---

## PushManager Architecture

The PushManager is an in-process event dispatcher using asyncio queues. No external message broker is required.

```
PushManager
├── _connections: dict[env, list[AgentConnection]]
│   Each AgentConnection holds:
│   ├── queue: asyncio.Queue
│   ├── env, tenant_id, agent_id
│   ├── bundle_name, policy_version
│   ├── connected_at, is_closed
│
├── _dashboard_connections: dict[tenant_id, list[DashboardConnection]]
│   Each DashboardConnection holds:
│   ├── queue: asyncio.Queue
│   ├── tenant_id, connected_at
```

### Dispatch Methods

| Method | Target | Filtering |
|--------|--------|-----------|
| `push_to_env(env, data, tenant_id)` | All agents in environment | Tenant match. For `contract_update` events, additionally filters by `bundle_name` — only agents subscribed to that bundle receive the event. |
| `push_to_dashboard(tenant_id, data)` | All dashboard connections for tenant | Event type must be in the whitelist. |
| `push_to_agent(agent_id, data, tenant_id)` | Specific agent across all environments | Exact agent_id + tenant_id match. |

### Connection Lifecycle

1. **Subscribe:** Agent/dashboard connects, a new `asyncio.Queue` is created and added to the connection map
2. **Receive:** The SSE endpoint reads from the queue in a loop, yielding events as SSE text
3. **Unsubscribe:** On disconnect, the connection is removed from the map
4. **Cleanup:** A background task runs every 5 minutes, removing connections that are closed or older than 1 hour

### Event Format on the Wire

Events are sent as standard SSE with the event type derived from `data["type"]`:

```
event: contract_update
data: {"type": "contract_update", "bundle_name": "devops-agent", ...}

event: approval_created
data: {"type": "approval_created", "approval_id": "...", ...}
```

The `event:` line enables `EventSource` clients to listen for specific event types with `addEventListener()`.
