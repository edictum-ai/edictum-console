# PROMPT-MULTI-BUNDLE-P1-MODEL — Model, Migration, Services

> **Scope:** Database model changes, Alembic migration, service layer updates.
> **Depends on:** Nothing (foundation prompt).
> **Deliverable:** `alembic upgrade head` succeeds, service functions accept `bundle_name`, all existing tests updated and passing.
> **Time budget:** ~45 min

---

## Required Reading

Before writing any code, read these files:

1. `Multi-BundleDataModel.md` §1 (Model Changes), §2 (Migration), §3 (Service Changes)
2. `CLAUDE.md` — Principles 2 (server never evaluates), 8 (tenant isolation)
3. `src/edictum_server/db/models.py` — Current Bundle + Deployment models
4. `src/edictum_server/services/bundle_service.py` — Current service functions
5. `src/edictum_server/services/deployment_service.py` — Current deploy logic
6. `tests/test_bundles.py` — Current SAMPLE_YAML and test helpers
7. `tests/test_adversarial/test_s3_tenant_isolation.py` — Current test data
8. `tests/test_deployments.py` — Current test data

---

## Shared Modules — Do NOT Duplicate

| What | Where | Use |
|------|-------|-----|
| Bundle model | `db/models.py` | Edit in place |
| Deployment model | `db/models.py` | Edit in place |
| bundle_service | `services/bundle_service.py` | Edit in place |
| deployment_service | `services/deployment_service.py` | Edit in place |

---

## Files to Modify

### 1. `src/edictum_server/db/models.py`

**Changes:**
- `Bundle`: Add `name: Mapped[str] = mapped_column(String, index=True)`
- `Bundle`: Change `__table_args__` unique constraint from `(tenant_id, version)` to `(tenant_id, name, version)`
- `Deployment`: Add `bundle_name: Mapped[str] = mapped_column(String)`

**Target:** ~165 lines (currently 156).

### 2. `alembic/versions/003_add_bundle_name.py`

**Create new file.** Multi-step migration:
1. Add nullable `name` column to bundles, nullable `bundle_name` to deployments
2. Backfill `bundles.name` from `yaml_bytes` (parse YAML, extract `metadata.name`, fallback to `"unnamed"`)
3. Backfill `deployments.bundle_name` from joined bundle (SAFE: old constraint is `(tenant_id, version)` — unique join)
4. Make columns non-nullable
5. Drop old constraint `uq_bundle_tenant_version`, create new `uq_bundle_tenant_name_version`
6. Add indexes: `ix_bundles_name`, `ix_deployments_bundle_name`, `ix_bundles_revision_hash`
7. Downgrade reverses all steps

See `Multi-BundleDataModel.md` §2 for exact SQL.

### 3. `src/edictum_server/services/bundle_service.py`

**Changes:**
- `upload_bundle()`: Extract `metadata.name` from parsed YAML, validate it exists, version per `(tenant_id, name)`
- Add `list_bundle_names(db, tenant_id) -> list[dict]` — distinct names with aggregates
- Add `list_bundle_versions(db, tenant_id, bundle_name) -> list[Bundle]` — versions for one name
- `get_deployed_envs_map()`: Add `bundle_name` parameter, filter deployments by it
- `get_current_bundle()`: Add `bundle_name` parameter
- `get_bundle_by_version()`: Add `bundle_name` parameter
- Keep `list_tenant_bundles()` for now (still useful internally)

**Target:** ~200 lines (currently 158). May need to split if it grows past 200.

### 4. `src/edictum_server/services/deployment_service.py`

**Changes:**
- `deploy_bundle()`: Add `bundle_name` parameter, pass to `get_bundle_by_version()`, store on `Deployment`
- Include `bundle_name` in the `contract_update` SSE event data dict
- **Do NOT change `push_to_env()` signature yet** — that's P3. Just add `bundle_name` to the data dict passed to `push_to_env()`.
- `public_key` in SSE payload is deferred to P3 (requires PushManager refactor).

**Target:** ~90 lines (currently 81).

### 5. Create `src/edictum_server/services/drift_service.py`

**New file.** Single function:
```python
async def check_drift(db, tenant_id, policy_version, env) -> str
```
Returns `"current"`, `"drift"`, or `"unknown"`. Looks up bundle by `revision_hash`, cross-references with current deployment.

**Target:** ~40 lines.

### 6. Update ALL test SAMPLE_YAML

**CRITICAL:** Every test file that creates bundles must use YAML with `metadata.name`. Update:
- `tests/test_bundles.py` — Replace `SAMPLE_YAML` with `SAMPLE_YAML_A` (name: devops-agent) and `SAMPLE_YAML_B` (name: research-agent). Update `_deploy_via_db` helper to include `bundle_name`.
- `tests/test_adversarial/test_s3_tenant_isolation.py` — Update any inline YAML constants
- `tests/test_deployments.py` — Update test data
- Any other test files that create Bundle or Deployment rows directly

---

## Verification Checklist

After implementation, verify:

- [ ] `alembic upgrade head` on fresh DB creates tables with new columns and constraints
- [ ] `alembic downgrade -1` then `upgrade head` works (round-trip)
- [ ] `upload_bundle()` with YAML containing `metadata.name: "devops-agent"` returns `bundle.name == "devops-agent"` and `bundle.version == 1`
- [ ] Second upload with same `metadata.name` returns `version == 2`
- [ ] Upload with different `metadata.name` returns `version == 1` (independent lineage)
- [ ] Upload with missing `metadata.name` raises `ValueError("Missing required field: metadata.name")`
- [ ] `list_bundle_names()` returns distinct names with correct aggregates
- [ ] `list_bundle_versions()` returns only versions for the specified name
- [ ] `get_deployed_envs_map()` scoped by bundle_name — doesn't include other bundle's deployments
- [ ] `get_current_bundle()` with bundle_name returns correct bundle
- [ ] `get_bundle_by_version()` with bundle_name returns correct bundle
- [ ] `check_drift()` returns "current" when revision matches, "drift" when it doesn't
- [ ] ALL existing tests pass (run `pytest tests/ -v`)
- [ ] No file exceeds 200 lines
- [ ] `from __future__ import annotations` at top of every new .py file
