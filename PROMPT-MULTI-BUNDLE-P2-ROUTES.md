# PROMPT-MULTI-BUNDLE-P2-ROUTES — Routes, Schemas, Route Tests

> **Scope:** Pydantic schemas, bundle routes (name-scoped), deployment route filter, new tests.
> **Depends on:** P1 (model + service changes must be complete).
> **Deliverable:** All new API endpoints working, old routes removed, new tests passing.
> **Time budget:** ~45 min

---

## Required Reading

Before writing any code, read these files:

1. `Multi-BundleDataModel.md` §4 (Schemas), §5 (Routes), §8 (Tests)
2. `src/edictum_server/schemas/bundles.py` — Current schemas
3. `src/edictum_server/routes/bundles.py` — Current routes (will be rewritten)
4. `src/edictum_server/routes/deployments.py` — Current deployments route
5. `src/edictum_server/routes/evaluate.py` — Evaluate route (no changes, but verify no conflicts)
6. `tests/test_bundles.py` — Updated in P1 with new SAMPLE_YAML

---

## Shared Modules — Do NOT Duplicate

| What | Where | Use |
|------|-------|-----|
| `BundleResponse` schema | `schemas/bundles.py` | Edit in place |
| `DeploymentResponse` schema | `schemas/bundles.py` | Edit in place |
| Bundle service functions | `services/bundle_service.py` | Import — DO NOT redefine |
| Auth dependencies | `auth/dependencies.py` | Import |

---

## Files to Modify

### 1. `src/edictum_server/schemas/bundles.py`

**Changes:**
- `BundleResponse`: Add `name: str` field
- `DeploymentResponse`: Add `bundle_name: str` field (no `tenant_id` — caller knows their tenant)
- Add `BundleSummaryResponse` class: `name`, `latest_version`, `version_count`, `last_updated`, `deployed_envs`
- `BundleUploadRequest` and `DeployRequest`: No changes
- Keep `BundleWithDeploymentsResponse` — used by `GET /bundles/{name}`

**Target:** ~75 lines (currently 55).

### 2. `src/edictum_server/routes/bundles.py`

**Rewrite route structure.** Remove old routes, add name-scoped routes.

Old routes (REMOVE):
- `GET /bundles` → returned `list[BundleWithDeploymentsResponse]`
- `GET /bundles/current` → took `env` query param
- `GET /bundles/{version}` → version as path param
- `GET /bundles/{version}/yaml`
- `POST /bundles/{version}/deploy`

New routes:
- `POST /bundles` → upload (unchanged path, extracts name from YAML)
- `GET /bundles` → returns `list[BundleSummaryResponse]` (bundle names with aggregates)
- `GET /bundles/{name}` → returns `list[BundleWithDeploymentsResponse]` (versions for a name)
- `GET /bundles/{name}/{version}` → get specific version (version typed as `int` — rejects non-int paths)
- `GET /bundles/{name}/{version}/yaml` → raw YAML content
- `POST /bundles/{name}/{version}/deploy` → deploy to environment
- `GET /bundles/{name}/current` → currently deployed version for env

**IMPORTANT — Route ordering:** Register `/{name}/current` BEFORE `/{name}/{version}`. Since `version` is typed as `int`, FastAPI will reject `"current"` as non-integer and match the correct route. But register in this order as a safety measure. Verify in tests.

**N+1 note:** The `GET /bundles` endpoint calls `get_deployed_envs_map()` per bundle name. Add comment:
```python
# TODO: batch deployed_envs query across all bundle names to avoid N+1
# At 20 bundles this is ~20 lightweight indexed queries — acceptable for v1
```

**`_bundle_to_response` helper:** Update to include `name` field in the response.

**`bundle_uploaded` dashboard push:** The upload route pushes a `bundle_uploaded` event to the dashboard via `push_to_dashboard()`. Update the payload to include `bundle_name: bundle.name`. See spec §6e.

**Target:** ~180 lines (currently 181). Similar size — the routes are just restructured.

### 3. `src/edictum_server/routes/deployments.py`

**Changes:**
- Add `bundle_name: str | None = Query(default=None)` parameter to `list_deployments()`
- Add `Deployment.bundle_name == bundle_name` filter when provided

**Target:** ~42 lines (currently 36).

### 4. `src/edictum_server/routes/evaluate.py`

**No changes.** Evaluate takes raw YAML content, not a bundle name/version reference. Verify no route path conflicts.

### 5. New tests in `tests/test_bundles.py`

Add these tests (use `SAMPLE_YAML_A` and `SAMPLE_YAML_B` from P1):

- `test_upload_extracts_name` — POST returns name + version 1
- `test_upload_same_name_increments_version` — second upload → version 2
- `test_upload_different_name_starts_at_v1` — different name → independent version 1
- `test_list_bundles_returns_summaries` — GET /bundles returns distinct names
- `test_list_versions_for_bundle` — GET /bundles/{name} returns versions desc
- `test_list_versions_unknown_bundle` — 404 for nonexistent name
- `test_get_yaml_by_name_version` — GET /bundles/{name}/{version}/yaml works
- `test_deploy_by_name` — POST /bundles/{name}/{version}/deploy works
- `test_deploy_wrong_name_returns_error` — deploy nonexistent name → 422
- `test_upload_missing_metadata_name` — no metadata.name → 422
- `test_deployed_envs_scoped_by_bundle` — envs don't leak across bundle names
- `test_get_current_bundle_by_name` — GET /bundles/{name}/current?env=... works

### 6. New adversarial tests in `tests/test_adversarial/test_s3_tenant_isolation.py`

- `test_bundle_versions_not_visible_across_tenants` — upload as A, list versions as B → 404
- `test_deploy_cross_tenant_bundle` — deploy A's bundle as B → 404 or 422

---

## Verification Checklist

After implementation, verify:

- [ ] `POST /api/v1/bundles` with valid YAML → 201, response includes `name`
- [ ] `POST /api/v1/bundles` with no `metadata.name` → 422
- [ ] `GET /api/v1/bundles` → list of `BundleSummaryResponse` (not individual versions)
- [ ] `GET /api/v1/bundles/devops-agent` → versions for that name, desc order
- [ ] `GET /api/v1/bundles/nonexistent` → 404
- [ ] `GET /api/v1/bundles/devops-agent/1` → specific version
- [ ] `GET /api/v1/bundles/devops-agent/1/yaml` → raw YAML with correct content-type
- [ ] `POST /api/v1/bundles/devops-agent/1/deploy` → 201 with `bundle_name` in response
- [ ] `GET /api/v1/bundles/devops-agent/current?env=production` → deployed bundle
- [ ] Route ordering: `GET /bundles/devops-agent/current` doesn't conflict with `GET /bundles/devops-agent/{version}`
- [ ] `GET /api/v1/deployments?bundle_name=devops-agent` → filtered results
- [ ] Cross-tenant: upload as A, access as B → 404 (not 200 with empty data)
- [ ] ALL tests pass: `pytest tests/ -v`
- [ ] No file exceeds 200 lines
