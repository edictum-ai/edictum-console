# PROMPT-MULTI-BUNDLE-P3-PUSH — PushManager, SSE, Agent Fleet, Drift

> **Scope:** PushManager refactor with AgentConnection metadata, SSE stream query params, agent fleet status endpoint, drift detection service.
> **Depends on:** P1 (drift_service.py, updated deployment_service.py) + P2 (routes must exist for fleet endpoint).
> **Deliverable:** PushManager tracks connection metadata, SSE filters by bundle_name + tenant, drift detection works, fleet endpoint returns live agent status.
> **Time budget:** ~60 min

---

## Required Reading

Before writing any code, read these files:

1. `Multi-BundleDataModel.md` §6a–6g (full SSE & Push section)
2. `src/edictum_server/push/manager.py` — Current PushManager (92 lines)
3. `src/edictum_server/routes/stream.py` — Current SSE endpoints (83 lines)
4. `src/edictum_server/services/deployment_service.py` — push_to_env caller
5. `src/edictum_server/services/signing_service.py` — for public_key access
6. `src/edictum_server/auth/dependencies.py` — AuthContext fields (check if agent_id exists)
7. `src/edictum_server/routes/events.py` — Event ingestion (for drift check integration)

---

## Shared Modules — Do NOT Duplicate

| What | Where | Use |
|------|-------|-----|
| PushManager | `push/manager.py` | Edit in place |
| drift_service | `services/drift_service.py` | Created in P1 |
| bundle_service | `services/bundle_service.py` | Import for get_current_bundle |
| Auth dependencies | `auth/dependencies.py` | Import |

---

## Files to Modify

### 1. `src/edictum_server/push/manager.py`

**Major refactor.** Currently 92 lines. Target: ~150 lines.

**Add `AgentConnection` dataclass:**
```python
@dataclass
class AgentConnection:
    queue: asyncio.Queue[dict[str, Any]]
    env: str
    tenant_id: uuid.UUID
    bundle_name: str | None
    policy_version: str | None
    agent_id: str
    connected_at: datetime
```

**Change `_connections`** from `dict[str, set[Queue]]` to `dict[str, set[AgentConnection]]`.

**Update `subscribe()`** to accept metadata params, return `AgentConnection`.

**Update `unsubscribe()`** to take `AgentConnection` instead of bare queue.

**Update `push_to_env()`** to:
1. Accept `tenant_id` parameter (required)
2. Filter by `conn.tenant_id == tenant_id` (fixes latent tenant isolation gap)
3. Filter `contract_update` events by `conn.bundle_name` when set

**Add `get_agent_connections(tenant_id, bundle_name?)`** for the fleet endpoint.

**Dashboard methods** (`subscribe_dashboard`, `unsubscribe_dashboard`, `push_to_dashboard`): No changes to structure, but verify they still work after the agent-side refactor.

**Export `AgentConnection`** from the module.

### 2. `src/edictum_server/routes/stream.py`

**Changes:**
- Agent stream endpoint: Add `bundle_name` and `policy_version` optional query params
- Pass all metadata to `push.subscribe()`: `tenant_id`, `agent_id`, `bundle_name`, `policy_version`
- Update cleanup in `finally` to call `push.unsubscribe(env, conn)` with `AgentConnection`
- `_event_generator` stays simple — filtering now happens at push time in PushManager

**Check:** Does `AuthContext` from `require_api_key` have `agent_id`? The auth dependency extracts `X-Edictum-Agent-Id` header. If `agent_id` is not on `AuthContext`, add it or default to `"unknown"`.

**Target:** ~90 lines (currently 83).

### 3. `src/edictum_server/services/deployment_service.py`

**Changes:**
- `push_to_env()` call now passes `tenant_id`: `push_manager.push_to_env(env, contract_data, tenant_id=tenant_id)`
- Add `public_key` to `contract_update` SSE payload: `signing_key.public_key.hex() if signing_key else None`

**Note:** The `deploy_bundle` function already loads the `SigningKey` row. Access `public_key` from it.

### 4. `src/edictum_server/routes/bundles.py`

**Changes:**
- Update `push.push_to_env()` calls in the upload route to pass `tenant_id`
- The `bundle_uploaded` dashboard push already uses `push_to_dashboard(tenant_id, ...)` — no change needed

### 5. Create `src/edictum_server/schemas/agents.py`

**New file:**
```python
class AgentStatusEntry(BaseModel):
    agent_id: str
    env: str
    bundle_name: str | None
    policy_version: str | None
    status: str  # "current", "drift", "unknown"
    connected_at: datetime

class AgentFleetStatusResponse(BaseModel):
    agents: list[AgentStatusEntry]
```

**Target:** ~25 lines.

### 6. Create `src/edictum_server/routes/agents.py`

**New file.** Single endpoint:
- `GET /api/v1/agents/status` — requires `require_dashboard_auth`
- Optional `bundle_name` query param filter
- Gets connections from `push.get_agent_connections(auth.tenant_id, bundle_name)`
- For each connection with `policy_version` and `bundle_name`, calls `check_drift()`
- Returns `AgentFleetStatusResponse`

**Target:** ~45 lines.

### 7. `src/edictum_server/main.py`

**Changes:**
- Import and register `agents_router`: `app.include_router(agents_router)`

### 8. Tests

**New test file: `tests/test_push_manager.py`**

Unit tests for PushManager refactor:
- `test_subscribe_returns_agent_connection` — verify metadata fields
- `test_push_to_env_filters_by_tenant` — tenant A push doesn't reach tenant B queue
- `test_push_to_env_filters_by_bundle_name` — contract_update for "devops-agent" doesn't reach connection filtering for "research-agent"
- `test_push_to_env_no_filter_receives_all` — connection with no bundle_name gets everything
- `test_get_agent_connections_by_tenant` — only returns connections for specified tenant
- `test_get_agent_connections_by_bundle_name` — optional filter works
- `test_unsubscribe_removes_connection` — cleanup works

**New tests in `tests/test_stream.py` (or add to existing):**
- `test_stream_accepts_bundle_name_param` — 200 with optional param
- `test_stream_accepts_policy_version_param` — 200 with optional param

**New test file: `tests/test_agents.py`**
- `test_agent_status_empty` — no connections → empty list
- `test_agent_status_returns_connected_agents` — verify agent entries
- `test_agent_status_tenant_isolation` — A's agents not visible to B
- `test_agent_status_bundle_filter` — only matching bundle's agents returned

**New test file: `tests/test_drift.py`**
- `test_drift_current` — agent running deployed version → "current"
- `test_drift_stale` — agent running old version → "drift"
- `test_drift_unknown_hash` — unrecognized revision_hash → "unknown"
- `test_drift_not_deployed` — bundle exists but not deployed to env → "unknown"

---

## Verification Checklist

After implementation, verify:

- [ ] `PushManager.subscribe()` returns `AgentConnection` with all metadata fields
- [ ] `push_to_env()` with tenant_id A doesn't push to tenant B's connections
- [ ] `push_to_env()` with `contract_update` event doesn't push to connections filtering for a different `bundle_name`
- [ ] `push_to_env()` without bundle filter pushes `contract_update` to all (backward compat)
- [ ] SSE stream endpoint accepts `bundle_name` and `policy_version` query params
- [ ] `contract_update` SSE payload includes `public_key` field
- [ ] `GET /api/v1/agents/status` returns connected agents for the tenant
- [ ] `GET /api/v1/agents/status?bundle_name=X` filters by bundle
- [ ] Agent fleet endpoint is tenant-scoped (adversarial test)
- [ ] Drift detection: "current" when hash matches deployed, "drift" when stale
- [ ] ALL existing tests pass: `pytest tests/ -v`
- [ ] No file exceeds 200 lines
- [ ] `from __future__ import annotations` in all new files
