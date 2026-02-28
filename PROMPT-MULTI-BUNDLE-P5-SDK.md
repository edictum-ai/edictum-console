# PROMPT-MULTI-BUNDLE-P5-SDK — edictum Library SDK Changes

> **Scope:** `~/project/edictum` — the edictum library. Server SDK client, contract source, audit sink.
> **Depends on:** P2+P3 (console API must be stable before SDK is updated to match).
> **Deliverable:** SDK passes `env` + `bundle_name` + `policy_version` on SSE connect, includes `bundle_name` in audit events, stores public_key for future verification.
> **Time budget:** ~30 min
> **Repo:** `~/project/edictum` (NOT edictum-console)

---

## Required Reading

1. `~/project/edictum-console/Multi-BundleSDK.md` — Full SDK spec
2. `~/project/edictum/src/edictum/server/client.py` — Generic HTTP client (138 lines)
3. `~/project/edictum/src/edictum/server/contract_source.py` — SSE watcher (81 lines)
4. `~/project/edictum/src/edictum/server/audit_sink.py` — Event emitter (103 lines)
5. `~/project/edictum/tests/test_server/test_client.py` — Client tests
6. `~/project/edictum/tests/test_server/test_contract_source.py` — Contract source tests
7. `~/project/edictum/tests/test_server/test_audit_sink.py` — Audit sink tests

---

## Files to Modify (all in `~/project/edictum`)

### 1. `src/edictum/server/client.py`

**Add `env` and `bundle_name` to `__init__`:**

```python
def __init__(
    self,
    base_url: str,
    api_key: str,
    *,
    agent_id: str = "default",
    env: str = "production",          # NEW — fixes SSE bug
    bundle_name: str = "default",     # NEW — which bundle this agent tracks
    timeout: float = 30.0,
    max_retries: int = 3,
) -> None:
```

Store both as instance attributes. No header changes. No method signature changes.

### 2. `src/edictum/server/contract_source.py`

**Update `watch()` to pass query params and track state:**

- Build `params` dict: `env` (from client), `bundle_name` (from client), `policy_version` (from `_current_revision`)
- Pass `params` to `aconnect_sse(http_client, "GET", "/api/v1/stream", params=params)`
- After yielding a `contract_update`, update `self._current_revision = data["revision_hash"]`
- Store `self._last_public_key = data.get("public_key")` for future verification
- On reconnect, the updated `_current_revision` is passed as `policy_version` param

**Add instance attributes:**
- `self._current_revision: str | None = None`
- `self._last_public_key: str | None = None`

### 3. `src/edictum/server/audit_sink.py`

**Update `_map_event()`:**
- Add `"bundle_name": self._client.bundle_name` to the payload dict
- Update `"environment"` to fall back to `self._client.env`: `getattr(event, "environment", None) or self._client.env`

### 4. No changes to `approval_backend.py` or `backend.py`

### 5. Tests

**`tests/test_server/test_client.py`** — Add:
- `test_client_stores_bundle_name` + `test_client_default_bundle_name`
- `test_client_stores_env` + `test_client_default_env`

**`tests/test_server/test_contract_source.py`** — Add:
- `test_watch_passes_env_and_bundle_name_in_sse_params` — mock SSE, verify params
- `test_watch_passes_policy_version_after_first_update` — simulate reconnect
- `test_watch_stores_public_key` — verify `_last_public_key` after event

**`tests/test_server/test_audit_sink.py`** — Add:
- `test_event_mapping_includes_bundle_name`
- `test_event_mapping_uses_client_env_as_fallback`

---

## Verification Checklist

- [ ] `EdictumServerClient("url", "key").env == "production"` (default)
- [ ] `EdictumServerClient("url", "key").bundle_name == "default"` (default)
- [ ] `EdictumServerClient("url", "key", env="staging", bundle_name="x").env == "staging"`
- [ ] `ServerContractSource.watch()` SSE connection includes `?env=production&bundle_name=default`
- [ ] After receiving `contract_update` with `revision_hash`, `_current_revision` is updated
- [ ] On reconnect, `policy_version` param matches last received `revision_hash`
- [ ] `_last_public_key` stored from event data
- [ ] `ServerAuditSink._map_event()` payload includes `bundle_name`
- [ ] `ServerAuditSink._map_event()` uses `client.env` as fallback for `environment`
- [ ] ALL existing tests pass: `pytest tests/ -v`
- [ ] No file exceeds 200 lines
- [ ] `from __future__ import annotations` in all modified files
