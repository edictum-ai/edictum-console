# SPEC: Multi-Bundle SDK Changes — edictum Library

> **Companion to:** `Multi-BundleDataModel.md` (console backend spec)
>
> **Problem:** The edictum server SDK (`src/edictum/server/`) has zero awareness of bundle names. After the console backend adds named bundle lineages, the SDK must know which bundle it's tracking — for SSE filtering, API paths, and audit context.
>
> **Scope:** `~/project/edictum` — the edictum library. Changes to `src/edictum/server/` only. No core library changes.
>
> **Breaking change:** API paths change (`/bundles/{version}` → `/bundles/{name}/{version}`). This is pre-release with no external consumers. Clean break, no backward compat.

---

## Required Reading

1. `~/project/edictum-console/Multi-BundleDataModel.md` — The console spec (new routes, SSE changes, PushManager, drift detection)
2. `~/project/edictum-console/SDK_COMPAT.md` — Current API contract
3. `~/project/edictum/src/edictum/server/client.py` — Generic HTTP client
4. `~/project/edictum/src/edictum/server/contract_source.py` — SSE watcher (main target)
5. `~/project/edictum/src/edictum/server/audit_sink.py` — Event emitter
6. `~/project/edictum/src/edictum/server/approval_backend.py` — Approval poller
7. `~/project/edictum/src/edictum/server/backend.py` — Session store

---

## 1. `EdictumServerClient` — Add `bundle_name` and `env`

### `src/edictum/server/client.py`

```python
class EdictumServerClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        agent_id: str = "default",
        env: str = "production",      # NEW — fixes existing bug (SSE requires env)
        bundle_name: str = "default",  # NEW — which bundle this agent tracks
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.agent_id = agent_id
        self.env = env                    # NEW
        self.bundle_name = bundle_name    # NEW
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: httpx.AsyncClient | None = None
```

Changes:
- Add `env: str = "production"` — fixes existing bug where `ServerContractSource.watch()` connects without the required `env` param
- Add `bundle_name: str = "default"` — identifies which bundle lineage this agent tracks
- Both have defaults for backward compat
- Neither is sent as an HTTP header — they're used by components to construct API paths and SSE query params

---

## 2. `ServerContractSource` — SSE with `env` + `bundle_name` + `policy_version`

### `src/edictum/server/contract_source.py`

The SSE connection passes `env`, `bundle_name`, and the current `policy_version` (revision hash) as query params. The server uses these for:
- `env` (required): which environment channel to subscribe to
- `bundle_name` (optional): server-side filtering of `contract_update` events
- `policy_version` (optional): drift detection — server knows what version the agent is running

```python
class ServerContractSource:
    def __init__(
        self,
        client: EdictumServerClient,
        *,
        reconnect_delay: float = 1.0,
        max_reconnect_delay: float = 60.0,
    ) -> None:
        self._client = client
        self._reconnect_delay = reconnect_delay
        self._max_reconnect_delay = max_reconnect_delay
        self._connected = False
        self._closed = False
        self._current_revision: str | None = None  # tracks revision_hash of last applied bundle

    async def watch(self) -> AsyncIterator[dict]:
        """SSE event loop — connects with env + bundle_name + policy_version."""
        delay = self._reconnect_delay
        while not self._closed:
            try:
                http_client = self._client._ensure_client()
                params: dict[str, str] = {"env": self._client.env}
                if self._client.bundle_name:
                    params["bundle_name"] = self._client.bundle_name
                if self._current_revision:
                    params["policy_version"] = self._current_revision
                async with aconnect_sse(
                    http_client, "GET", "/api/v1/stream", params=params
                ) as source:
                    delay = self._reconnect_delay
                    async for event in source.aiter_sse():
                        if self._closed:
                            return
                        if event.event == "contract_update":
                            try:
                                data = json.loads(event.data)
                                # Track the revision we're now running
                                if "revision_hash" in data:
                                    self._current_revision = data["revision_hash"]
                                # Store public_key for future verification
                                if "public_key" in data:
                                    self._last_public_key = data["public_key"]
                                yield data
                            except json.JSONDecodeError:
                                logger.warning("Invalid JSON in SSE event")
            except Exception:
                if self._closed:
                    return
                await asyncio.sleep(delay)
                delay = min(delay * 2, self._max_reconnect_delay)
```

Key changes:
- Passes `env` from `client.env` (fixes existing bug)
- Passes `bundle_name` for server-side filtering
- Passes `policy_version` for drift tracking (updated after each received bundle)
- Stores `_current_revision` — updated when a `contract_update` is received
- Stores `_last_public_key` — for future `edictum[verified]` signature verification

**On reconnect:** The SSE reconnection passes the *current* `policy_version`, so the server always knows what the agent is running even after network blips.

---

## 3. `ServerAuditSink` — Add `bundle_name` to event payload

### `src/edictum/server/audit_sink.py`

Include `bundle_name` in the payload so events can be attributed to a specific bundle. Also include `environment` from the client for drift detection on the server:

```python
def _map_event(self, event: Any) -> dict[str, Any]:
    return {
        "call_id": event.call_id,
        "agent_id": self._client.agent_id,
        "tool_name": event.tool_name,
        "verdict": event.action.value,
        "mode": event.mode,
        "timestamp": event.timestamp.isoformat(),
        "payload": {
            "tool_args": event.tool_args,
            "side_effect": getattr(event, "side_effect", None),
            "environment": getattr(event, "environment", None) or self._client.env,  # UPDATED — fallback to client env
            "principal": getattr(event, "principal", None),
            "decision_source": getattr(event, "decision_source", None),
            "decision_name": getattr(event, "decision_name", None),
            "reason": getattr(event, "reason", None),
            "policy_version": getattr(event, "policy_version", None),
            "bundle_name": self._client.bundle_name,  # NEW
        },
    }
```

This is additive — the server's event ingestion stores the full `payload` dict as JSON. The server-side drift detection (§6f in console spec) uses `payload.policy_version` + `payload.environment` + `payload.bundle_name` to determine if the agent is on the current deployed version.

---

## 4. `ServerApprovalBackend` — No changes needed

Approval requests are tool-level, not bundle-level. The `contract_name` field (added in an earlier console change) already identifies which contract triggered the approval. The bundle name could be added later if we want to filter approval queues by bundle, but it's not needed for v1.

---

## 5. `ServerBackend` (Sessions) — No changes needed

Session keys are application-level (e.g., `"agent:tool_count"`, `"agent:daily_limit"`). They're already namespaced by the caller. Adding bundle-scoping to sessions would be a larger design change that's out of scope for this spec.

---

## 6. Tests

### Update `tests/test_server/test_client.py`

```python
def test_client_stores_bundle_name():
    client = EdictumServerClient("http://localhost", "key", bundle_name="devops-agent")
    assert client.bundle_name == "devops-agent"

def test_client_default_bundle_name():
    client = EdictumServerClient("http://localhost", "key")
    assert client.bundle_name == "default"

def test_client_stores_env():
    client = EdictumServerClient("http://localhost", "key", env="staging")
    assert client.env == "staging"

def test_client_default_env():
    client = EdictumServerClient("http://localhost", "key")
    assert client.env == "production"
```

### Update `tests/test_server/test_contract_source.py`

Add tests for `watch()` passing query params in SSE connection:

```python
async def test_watch_passes_env_and_bundle_name_in_sse_params():
    """Verify SSE connection includes env and bundle_name query params."""
    client = EdictumServerClient(
        "http://localhost", "key",
        env="staging", bundle_name="devops-agent", agent_id="test",
    )
    source = ServerContractSource(client)
    # Mock httpx_sse.aconnect_sse, capture call args
    # assert captured_params == {"env": "staging", "bundle_name": "devops-agent"}

async def test_watch_passes_policy_version_after_first_update():
    """After receiving a contract_update, reconnect includes policy_version."""
    # Simulate: connect → receive event with revision_hash → disconnect → reconnect
    # Verify second connection includes policy_version param

async def test_watch_stores_public_key():
    """contract_update with public_key stores it for future verification."""
    # Simulate: receive event with public_key field
    # assert source._last_public_key == expected_key
```

### Update `tests/test_server/test_audit_sink.py`

```python
async def test_event_mapping_includes_bundle_name():
    client = EdictumServerClient("http://localhost", "key", bundle_name="devops-agent")
    sink = ServerAuditSink(client)
    event = make_test_event()
    mapped = sink._map_event(event)
    assert mapped["payload"]["bundle_name"] == "devops-agent"

async def test_event_mapping_uses_client_env_as_fallback():
    client = EdictumServerClient("http://localhost", "key", env="staging")
    sink = ServerAuditSink(client)
    event = make_test_event()  # event with no environment attr
    mapped = sink._map_event(event)
    assert mapped["payload"]["environment"] == "staging"
```

---

## 7. SDK_COMPAT.md Updates (in edictum-console repo)

After both specs are implemented, update `SDK_COMPAT.md` in the console repo:

```markdown
### SSE Subscription

GET /api/v1/stream?env={env}&bundle_name={bundle_name}&policy_version={revision_hash}

- `env` (required): Environment to subscribe to
- `bundle_name` (optional): Filter contract_update events to this bundle only.
  When omitted, all contract_update events for the env are forwarded.
- `policy_version` (optional): The revision_hash of the bundle the agent is currently
  running. Used for drift detection on the server.

### SSE Event: contract_update

event: contract_update
data: {
  "type": "contract_update",
  "bundle_name": "devops-agent",
  "version": 7,
  "revision_hash": "abc123...",
  "signature": "hex-or-null",
  "public_key": "ed25519-pub-hex-or-null",
  "yaml_bytes": "base64..."
}

### Audit Event Payload

POST /api/v1/events
{
  "call_id": "...",
  "agent_id": "...",
  "tool_name": "...",
  "payload": {
    "bundle_name": "devops-agent",
    "environment": "production",
    ...
  }
}
```

---

## 8. Checklist

### Client
- [ ] `EdictumServerClient.__init__` accepts `env` param (default `"production"`) — fixes existing bug
- [ ] `EdictumServerClient.__init__` accepts `bundle_name` param (default `"default"`)
- [ ] Both stored as instance attributes

### Contract Source (SSE)
- [ ] `ServerContractSource.watch()` passes `env` as SSE query param
- [ ] `ServerContractSource.watch()` passes `bundle_name` as SSE query param
- [ ] `ServerContractSource.watch()` passes `policy_version` on reconnect (after first event)
- [ ] `ServerContractSource` tracks `_current_revision` — updated on each `contract_update`
- [ ] `ServerContractSource` stores `_last_public_key` from events (for future `edictum[verified]`)

### Audit Sink
- [ ] `ServerAuditSink._map_event()` includes `bundle_name` in payload
- [ ] `ServerAuditSink._map_event()` falls back to `client.env` for `environment` field

### No Changes
- [ ] No changes to `ServerApprovalBackend`
- [ ] No changes to `ServerBackend`

### Tests
- [ ] Tests: client stores `bundle_name` and `env`, defaults work
- [ ] Tests: contract_source passes `env` + `bundle_name` to SSE connection
- [ ] Tests: contract_source passes `policy_version` on reconnect after first event
- [ ] Tests: contract_source stores `_last_public_key`
- [ ] Tests: audit_sink includes `bundle_name` in mapped events
- [ ] Tests: audit_sink uses `client.env` as fallback for environment
- [ ] All existing tests still pass
