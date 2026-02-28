# P1: Backend Endpoints for Contracts View

> **Scope:** 3 new endpoints + 1 SSE event + tests
> **Depends on:** Nothing — this is the first prompt
> **Deliverable:** All endpoints curl-testable, SSE event visible in browser console
> **Time budget:** Single session

---

## Required Reading

1. `contracts_spec.md` §2 (Backend Changes) — endpoint specs, request/response shapes
2. `CLAUDE.md` — Architecture principles, DDD layer rules, testing standards
3. `CONVENTIONS.md` — Terminology (no "guard", no "dry run"), code style
4. `SDK_COMPAT.md` — Existing bundle endpoints for consistency

## Architecture Exception — FIRST STEP

Before writing any code, amend `CLAUDE.md` Principle #2. Find the line:

> All governance runs in the agent process. The server NEVER evaluates contracts. Zero latency on tool calls.

Replace with:

> All governance runs in the agent process. The server NEVER evaluates contracts in production. Zero latency on tool calls. Server stores events, manages approvals, pushes contract updates.
> **Exception:** `POST /api/v1/bundles/evaluate` is a development-time playground endpoint for testing contracts in the dashboard. It is never called by agents. Production evaluation remains agent-side only.

---

## What to Build

### Endpoint 1: Evaluate (Playground)

`POST /api/v1/bundles/evaluate`

**Route file:** `src/edictum_server/routes/evaluate.py` (new file)

Follow the existing route pattern from `routes/bundles.py`:
- `router = APIRouter(prefix="/api/v1/bundles", tags=["bundles"])`
- Auth: `Depends(require_dashboard_auth)` — dashboard-only, not agents
- Thin handler: validate input (Pydantic), call service, return response
- No DB needed — this is stateless evaluation

**Service file:** `src/edictum_server/services/evaluate_service.py` (new file)

Business logic:
```python
from edictum import Edictum
from edictum.types import ToolEnvelope, Principal

async def evaluate_bundle(
    yaml_content: str,
    tool_name: str,
    tool_args: dict,
    environment: str = "production",
    agent_id: str = "test-agent",
    principal: dict | None = None,
) -> EvaluateResult:
    edictum_instance = Edictum.from_yaml_string(yaml_content)
    envelope = ToolEnvelope(
        tool_name=tool_name,
        args=tool_args,
        environment=environment,
        principal=Principal(**principal) if principal else None,
    )
    result = edictum_instance.evaluate(envelope)
    # Map to response dataclass/dict
```

Note: use `edictum_instance`, NOT `guard` (CONVENTIONS.md — "guard" is forbidden terminology).

**Request schema:**
```python
class EvaluateRequest(BaseModel):
    yaml_content: str
    tool_name: str
    tool_args: dict[str, Any]  # JSON object
    environment: str = "production"
    agent_id: str = "test-agent"
    principal: PrincipalInput | None = None

class PrincipalInput(BaseModel):
    user_id: str | None = None
    role: str | None = None
    claims: dict[str, Any] | None = None
```

**Response schema:**
```python
class ContractEvaluation(BaseModel):
    id: str
    type: str  # "pre" | "post" | "session" | "sandbox"
    matched: bool
    effect: str | None  # "deny" | "warn" | "approve" | "redact" | null
    message: str | None

class EvaluateResponse(BaseModel):
    verdict: str
    mode: str
    contracts_evaluated: list[ContractEvaluation]
    deciding_contract: str | None
    policy_version: str
    evaluation_time_ms: float
```

**Error handling:**
- Invalid YAML → 422 with message "Invalid YAML: {parse_error}"
- Invalid bundle structure → 422 with message from edictum validation
- Edictum library not importable → 500 (should not happen in production)

**Important:** Check the actual edictum library API. The `Edictum` class, `ToolEnvelope`, and `Principal` may have slightly different import paths or constructor signatures. Read the edictum source at `~/project/edictum/src/edictum/` to confirm. The pseudocode above is illustrative — match the actual API.

### Endpoint 2: Contract Coverage Stats

`GET /api/v1/stats/contracts`

**Route file:** Add to existing `src/edictum_server/routes/stats.py`

**Service file:** `src/edictum_server/services/stats_service.py` — add a new function (or create this file if stats service doesn't exist yet)

**Query parameters:**
- `since: str | None` — ISO8601 start of period (default: 24h ago)
- `until: str | None` — ISO8601 end of period (default: now)

**SQL logic:**
```sql
SELECT
  payload->>'decision_name' AS decision_name,
  COUNT(*) AS total_evaluations,
  COUNT(*) FILTER (WHERE verdict = 'denied') AS total_denials,
  COUNT(*) FILTER (WHERE verdict LIKE '%warn%') AS total_warnings,
  MAX(timestamp) AS last_triggered
FROM events
WHERE tenant_id = :tenant_id
  AND timestamp >= :since
  AND payload->>'decision_name' IS NOT NULL
GROUP BY payload->>'decision_name'
```

**Note on SQLite compatibility:** Tests use SQLite, which doesn't support `FILTER (WHERE ...)`. Use `CASE WHEN ... THEN 1 ELSE 0 END` wrapped in `SUM()` for portability, or use SQLAlchemy's `case()` expression builder.

Also return `total_events` (total count in period) and `period_start`/`period_end`.

**Response schema:**
```python
class ContractCoverage(BaseModel):
    decision_name: str
    total_evaluations: int
    total_denials: int
    total_warnings: int
    last_triggered: str | None  # ISO8601

class ContractStatsResponse(BaseModel):
    coverage: list[ContractCoverage]
    total_events: int
    period_start: str
    period_end: str
```

### Endpoint 3: List Deployments

`GET /api/v1/deployments`

**Route file:** `src/edictum_server/routes/deployments.py` (new file) or add to `routes/bundles.py` if it makes more sense given the existing structure.

**Query parameters:**
- `env: str | None` — filter by environment
- `limit: int = 50` — max results

**Logic:** Query `Deployment` model (already exists in `db/models.py`), filter by `tenant_id`, optional `env` filter, order by `created_at DESC`, limit.

**Response:** Reuse the existing `DeploymentResponse` type from `routes/bundles.py` if one exists, or define it matching the existing frontend type in `api/bundles.ts`:

```python
class DeploymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    env: str
    bundle_version: int
    deployed_by: str
    created_at: str  # ISO8601
```

### SSE Event: bundle_uploaded

**File:** `src/edictum_server/push/manager.py`

Add `"bundle_uploaded"` to the `_DASHBOARD_EVENT_TYPES` frozenset.

**File:** `src/edictum_server/routes/bundles.py`

In the `upload()` endpoint, after `await db.commit()`, add:

```python
push.push_to_dashboard(auth.tenant_id, {
    "type": "bundle_uploaded",
    "version": bundle.version,
    "revision_hash": bundle.revision_hash,
    "uploaded_by": auth.user_id,
})
```

Make sure the `push` dependency is injected: `push: PushManager = Depends(get_push_manager)`. Check if it's already there — `upload()` may already have push for the `contract_update` event on deploy.

---

## Register Routes

In `src/edictum_server/main.py`, register the new router(s):

```python
from edictum_server.routes.evaluate import router as evaluate_router
app.include_router(evaluate_router)
# If deployments is a new file:
from edictum_server.routes.deployments import router as deployments_router
app.include_router(deployments_router)
```

The stats route already exists — you're adding to it.

---

## Tests

### Positive tests: `tests/test_evaluate.py` (new)

```python
async def test_evaluate_deny(client: AsyncClient) -> None:
    """Evaluate a tool call that should be denied by block-sensitive-reads."""
    resp = await client.post("/api/v1/bundles/evaluate", json={
        "yaml_content": DEVOPS_AGENT_YAML,
        "tool_name": "read_file",
        "tool_args": {"path": "/home/.env"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "denied"
    assert data["deciding_contract"] == "block-sensitive-reads"
    assert data["evaluation_time_ms"] >= 0

async def test_evaluate_allow(client: AsyncClient) -> None:
    """Evaluate a tool call that should be allowed."""
    resp = await client.post("/api/v1/bundles/evaluate", json={
        "yaml_content": DEVOPS_AGENT_YAML,
        "tool_name": "read_file",
        "tool_args": {"path": "/workspace/src/main.py"},
    })
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "allowed"

async def test_evaluate_invalid_yaml(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/bundles/evaluate", json={
        "yaml_content": "not: valid: yaml: [",
        "tool_name": "read_file",
        "tool_args": {},
    })
    assert resp.status_code == 422

async def test_evaluate_observe_mode(client: AsyncClient) -> None:
    """Observe-mode contract should return call_would_deny, not denied."""
    # Use YAML with mode: observe
    ...

async def test_evaluate_sandbox(client: AsyncClient) -> None:
    """Sandbox contract should deny file access outside boundary."""
    # Use governance-v5 YAML
    ...
```

Use the devops-agent YAML and governance-v5 YAML as test constants (copy from `contracts_spec.md`).

### Positive tests: `tests/test_contract_stats.py` (new)

```python
async def test_contract_stats_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/stats/contracts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["coverage"] == []
    assert data["total_events"] == 0

async def test_contract_stats_with_events(client: AsyncClient, db_session: AsyncSession) -> None:
    """Seed events with decision_name, verify aggregation."""
    # Insert events with payload containing decision_name
    # Verify coverage counts
    ...

async def test_contract_stats_time_filter(client: AsyncClient, db_session: AsyncSession) -> None:
    """Events outside the since/until window should be excluded."""
    ...
```

### Positive tests: `tests/test_deployments.py` (new)

```python
async def test_list_deployments_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/deployments")
    assert resp.status_code == 200
    assert resp.json() == []

async def test_list_deployments_filtered(client: AsyncClient, db_session: AsyncSession) -> None:
    """Filter by env returns only matching deployments."""
    ...

async def test_list_deployments_limit(client: AsyncClient, db_session: AsyncSession) -> None:
    """Limit parameter caps results."""
    ...
```

### SSE test: add to existing SSE test file or `tests/test_bundles.py`

```python
async def test_upload_fires_bundle_uploaded_sse(client: AsyncClient, push_manager: PushManager) -> None:
    """Upload should fire bundle_uploaded SSE event."""
    # Subscribe to push_manager dashboard channel
    # Upload a bundle
    # Assert bundle_uploaded event was pushed
    ...
```

### Adversarial tests: `tests/test_adversarial/test_evaluate_security.py` (new)

```python
pytestmark = pytest.mark.security

async def test_evaluate_requires_dashboard_auth(no_auth_client: AsyncClient) -> None:
    """Evaluate endpoint must reject unauthenticated requests."""
    resp = await no_auth_client.post("/api/v1/bundles/evaluate", json={...})
    assert resp.status_code == 401

async def test_evaluate_rejects_api_key_auth(client_with_api_key: AsyncClient) -> None:
    """Evaluate is dashboard-only — API keys must be rejected."""
    # If you have a fixture for API key auth, use it
    ...

async def test_contract_stats_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable,
) -> None:
    """Stats from tenant A must not be visible to tenant B."""
    # Seed events for tenant A
    # Switch to tenant B
    # Assert stats are empty
    ...

async def test_deployments_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    set_auth_tenant_b: Callable,
) -> None:
    """Deployments from tenant A must not be visible to tenant B."""
    ...
```

---

## File Size Check

Each new file should be well under 200 lines:
- `routes/evaluate.py` — ~60 lines (router + handler + schemas)
- `services/evaluate_service.py` — ~40 lines
- `routes/deployments.py` — ~40 lines (if separate)
- Stats additions — ~30 lines added to existing file
- Each test file — ~80-120 lines

---

## Verification Checklist

After implementation, verify:

- [ ] `curl -X POST localhost:8000/api/v1/bundles/evaluate -H 'Content-Type: application/json' -d '{"yaml_content": "...", "tool_name": "read_file", "tool_args": {"path": "/home/.env"}}'` → 200 with `verdict: denied`
- [ ] Same curl with `path: /workspace/main.py` → 200 with `verdict: allowed`
- [ ] `curl localhost:8000/api/v1/stats/contracts` → 200 with empty coverage
- [ ] `curl localhost:8000/api/v1/deployments` → 200 with empty array
- [ ] Upload a bundle via existing endpoint → check browser SSE console for `bundle_uploaded` event
- [ ] `pytest tests/test_evaluate.py -v` → all green
- [ ] `pytest tests/test_contract_stats.py -v` → all green
- [ ] `pytest tests/test_deployments.py -v` → all green
- [ ] `pytest tests/test_adversarial/ -v -m security` → all green
- [ ] `ruff check src/edictum_server/routes/evaluate.py src/edictum_server/services/evaluate_service.py`
- [ ] No `any` types in Python (use `dict[str, Any]` from typing, not bare `dict`)
- [ ] No "guard", "dry run", "rule", "policy" terminology in code/comments
