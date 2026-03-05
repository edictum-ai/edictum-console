# Live Contract Updates (Hot-Reload)

Deploy a contract change in the console. Connected agents pick it up instantly — no restart, no redeployment, no downtime. This is the core value proposition of the console: governance updates propagate to your entire agent fleet in seconds.

## When to use this

Read this page when you need to understand how contract updates reach running agents. This covers the SSE push mechanism, the `contract_update` event format, auto-reconnect behavior, drift detection, and key rotation. If you are setting up an agent for the first time, start with [How It Works](how-it-works.md).

## The Problem

Without the console, changing a contract means:

1. Edit the YAML file
2. Rebuild or redeploy the agent
3. Restart every agent process
4. Hope no active sessions are disrupted

With 3 agents, this is annoying. With 30, it is operationally painful. With 300, it is untenable. At 3 AM, it is unacceptable.

## How SSE Push Works

```
Admin deploys bundle in dashboard
        |
        v
  ┌──────────────────┐
  │ Console backend   │
  │                   │
  │ 1. Store bundle   │
  │ 2. Sign (Ed25519) │
  │ 3. Record deploy  │
  │ 4. Push SSE event │
  └────────┬──────────┘
           │
           │  contract_update event
           │  (to all agents subscribed to this bundle + env)
           │
     ┌─────┼─────┐
     │     │     │
     v     v     v
  Agent  Agent  Agent
  A      B      C
     │     │     │
     │     │     │  Edictum.reload()
     │     │     │  Atomically swaps contracts
     v     v     v
  New contracts enforced (zero downtime)
```

### The `contract_update` Event

When a bundle is deployed, the console pushes an SSE event with this payload:

| Field | Type | Description |
|-------|------|-------------|
| `bundle_name` | string | Name of the deployed bundle |
| `version` | integer | Bundle version number |
| `revision_hash` | string | SHA-256 of the YAML content |
| `signature` | string | Ed25519 signature (hex-encoded) |
| `public_key` | string | Signing public key (hex-encoded) |
| `yaml_bytes` | string | Full YAML content (base64-encoded) |

The SDK decodes `yaml_bytes`, verifies the signature against the public key, and calls `Edictum.reload()` to atomically swap the contract pipeline. If signature verification fails, the update is rejected and the agent continues enforcing its current contracts.

### Bundle-Filtered Streams

Agents subscribe to SSE with parameters that filter the stream:

```
GET /api/v1/stream?env=production&bundle_name=my-contracts&policy_version=abc123
```

| Parameter | Purpose |
|-----------|---------|
| `env` | Only receive events for this environment |
| `bundle_name` | Only receive `contract_update` events for this bundle |
| `policy_version` | Current SHA-256 hash (for drift detection) |

An agent subscribed to `bundle_name=frontend-rules` will not receive updates when `backend-rules` is deployed. No noise, no wasted bandwidth.

### What `reload()` Does

`Edictum.reload()` is an atomic swap. It does not partially update contracts.

```
1. Decode base64 yaml_bytes
2. Parse YAML and validate schema
3. Compile contracts (same pipeline as from_yaml())
4. If any step fails: log error, keep current contracts (fail-closed)
5. If all steps pass: atomically replace pipeline contracts
6. Update policy_version to new revision_hash
```

During the swap, any in-flight tool calls complete with the old contracts. New tool calls after the swap use the new contracts. There is no window where contracts are partially loaded.

## Auto-Reconnect

SSE connections drop. Networks are unreliable. The SDK reconnects automatically with exponential backoff:

```
Connection drops
    |
    +-- Wait 1s, reconnect
    |     |
    |     +-- Success? Reset backoff. Resume stream.
    |     |
    |     +-- Fail? Wait 2s, reconnect
    |           |
    |           +-- Fail? Wait 4s, reconnect
    |                 |
    |                 +-- Fail? Wait 8s, reconnect
    |                       |
    |                       ... (doubles each time)
    |                       |
    |                       +-- Capped at 60s max
```

| Parameter | Value |
|-----------|-------|
| Initial delay | 1 second |
| Maximum delay | 60 seconds |
| Backoff multiplier | 2x |
| Stable threshold | 60 seconds of connected time before resetting backoff |

The stable threshold prevents rapid reconnect cycling. If a connection stays up for 60 seconds, the backoff resets to 1 second. If it drops again within 60 seconds, the backoff continues from where it left off.

During disconnection, the agent continues enforcing its last-known contracts. Audit events buffer in memory (up to 10,000). When the connection resumes, the agent receives any contract updates it missed, and buffered events flush to the server.

## Drift Detection

When an agent connects via SSE, it reports its `policy_version` — the SHA-256 revision hash of its current contract bundle. The console compares this against the latest deployed bundle for that agent's environment and bundle assignment.

```
Agent connects with policy_version=abc123
    |
    v
Console checks: latest deployed bundle for this agent
    |
    ├── Deployed bundle hash = abc123  →  Status: CURRENT
    ├── Deployed bundle hash = def456  →  Status: DRIFT
    └── No policy_version reported     →  Status: UNKNOWN
```

| Status | Meaning | Action |
|--------|---------|--------|
| `current` | Agent enforces the latest deployed bundle | None needed |
| `drift` | Agent enforces a stale bundle | Agent will receive the update via SSE |
| `unknown` | Agent did not report a policy version | Check SDK version |

Drift status is visible on the fleet monitoring page for every connected agent. A drifted agent typically picks up the latest bundle within seconds — the console pushes the update as soon as the SSE connection is established.

Drift can also occur when an agent reconnects after an extended disconnection. The SSE stream sends any pending `contract_update` events on reconnect, so drift resolves automatically.

## Key Rotation

Ed25519 signing keys can be rotated without disrupting connected agents.

```
Admin clicks "Rotate Signing Key" in Settings
    |
    v
Console generates new Ed25519 keypair
    |
    v
Old key marked as inactive
    |
    v
All currently-deployed bundles re-signed with new key
    |
    v
Re-signed bundles pushed to agents via SSE (contract_update events)
    |
    v
Agents receive new bundles with new signatures
Verify against new public key (included in event)
reload() atomically swaps contracts
```

Key rotation is a single action in the dashboard danger zone. The private key is encrypted at rest with NaCl SecretBox (using `EDICTUM_SIGNING_KEY_SECRET`). The old key is deactivated, not deleted — audit records still reference it.

## Event Types on the SSE Stream

The agent SSE stream carries more than just contract updates:

| Event | Trigger | Agent Action |
|-------|---------|-------------|
| `contract_update` | Bundle deployed | `reload()` — swap contracts |
| `approval_decided` | Approval decided | Poll resolution completes, tool executes or denies |
| `assignment_changed` | Bundle assignment changed | Fetch new bundle, `reload()` |

The dashboard has its own SSE stream (`GET /api/v1/stream/dashboard`) that carries real-time updates for the web UI: new events, approval state changes, agent connections, and deployment notifications.

## Next Steps

- [Contracts](contracts.md) -- the three-level contract model and how bundles are assembled
- [Approvals](approvals.md) -- HITL approval lifecycle and notification channels
- [Security Model](security-model.md) -- Ed25519 signing, key encryption, and verification
