# PROMPT: Multi-Bundle Data Model — Named Bundle Lineages

> **Problem:** The Bundle model treats all versions as a single lineage per tenant. One tenant gets one version counter — upload "devops-agent" as v1, "research-agent" as v2, they're just versions 1 and 2 of the same unnamed lineage. Real tenants govern multiple agents with different bundles.
>
> **Fix:** Add `name` column to Bundle, scope versions per (tenant_id, name). Each bundle name has its own version history, deployments, and evolution.
>
> **Scope:** Backend only. Model, migration, service, routes, schemas, SSE, tests. Frontend API client types updated but no UI changes in this prompt.

---

## Required Reading

1. `CLAUDE.md` — Principles 2, 8 (tenant isolation on every query)
2. `CONVENTIONS.md` — Terminology, code conventions
3. `SDK_COMPAT.md` — Agent SSE contract, API paths
4. `src/edictum_server/db/models.py` — Current Bundle + Deployment models
5. `src/edictum_server/services/bundle_service.py` — Current upload, list, versioning logic
6. `src/edictum_server/routes/bundles.py` — Current route handlers
7. `src/edictum_server/services/deployment_service.py` — Current deploy logic + SSE push
8. `src/edictum_server/routes/stream.py` — Agent SSE subscription (currently env-only)
9. `tests/test_bundles.py` — Current test patterns
10. `tests/test_adversarial/test_s3_tenant_isolation.py` — Tenant isolation tests

---

## 1. Model Changes

### `src/edictum_server/db/models.py`

**Bundle:**
```python
class Bundle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bundles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "version", name="uq_bundle_tenant_name_version"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String, index=True)  # NEW — from YAML metadata.name
    version: Mapped[int]
    revision_hash: Mapped[str] = mapped_column(String(64))
    yaml_bytes: Mapped[bytes] = mapped_column(LargeBinary)
    signature: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    source_hub_slug: Mapped[str | None] = mapped_column(String, nullable=True)
    source_hub_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String)

    tenant: Mapped[Tenant] = relationship(back_populates="bundles")
```

Changes:
- Add `name: Mapped[str]` column with index
- Change unique constraint from `(tenant_id, version)` to `(tenant_id, name, version)`

**Deployment:**
```python
class Deployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "deployments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    bundle_name: Mapped[str] = mapped_column(String)  # NEW
    env: Mapped[str] = mapped_column(String)
    bundle_version: Mapped[int]
    deployed_by: Mapped[str] = mapped_column(String)

    tenant: Mapped[Tenant] = relationship(back_populates="deployments")
```

Changes:
- Add `bundle_name: Mapped[str]` column

---

## 2. Migration

**File:** `alembic/versions/003_add_bundle_name.py`

This is a multi-step migration because the column must be backfilled before it can be non-nullable.

```python
"""Add name column to bundles and bundle_name to deployments.

Scopes bundle versioning per (tenant_id, name) instead of (tenant_id).
"""

from __future__ import annotations

import yaml
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"

def upgrade() -> None:
    # --- Step 1: Add nullable columns ---
    op.add_column("bundles", sa.Column("name", sa.String(), nullable=True))
    op.add_column("deployments", sa.Column("bundle_name", sa.String(), nullable=True))

    # --- Step 2: Backfill bundle.name from YAML metadata ---
    conn = op.get_bind()
    bundles = conn.execute(sa.text("SELECT id, yaml_bytes FROM bundles")).fetchall()
    for bundle_id, yaml_bytes in bundles:
        try:
            parsed = yaml.safe_load(yaml_bytes)
            name = parsed.get("metadata", {}).get("name", "unnamed")
        except Exception:
            name = "unnamed"
        conn.execute(
            sa.text("UPDATE bundles SET name = :name WHERE id = :id"),
            {"name": name, "id": bundle_id},
        )

    # --- Step 3: Backfill deployment.bundle_name from joined bundle ---
    # For each deployment, look up the bundle by (tenant_id, bundle_version)
    # and copy the name we just set.
    conn.execute(sa.text("""
        UPDATE deployments SET bundle_name = (
            SELECT b.name FROM bundles b
            WHERE b.tenant_id = deployments.tenant_id
            AND b.version = deployments.bundle_version
        )
    """))
    # Any deployments that couldn't be resolved (orphaned) get "unnamed"
    conn.execute(sa.text(
        "UPDATE deployments SET bundle_name = 'unnamed' WHERE bundle_name IS NULL"
    ))

    # --- Step 4: Make columns non-nullable ---
    op.alter_column("bundles", "name", nullable=False)
    op.alter_column("deployments", "bundle_name", nullable=False)

    # --- Step 5: Drop old constraint, add new ---
    op.drop_constraint("uq_bundle_tenant_version", "bundles", type_="unique")
    op.create_unique_constraint(
        "uq_bundle_tenant_name_version", "bundles", ["tenant_id", "name", "version"]
    )

    # --- Step 6: Add index on name for fast lookups ---
    op.create_index("ix_bundles_name", "bundles", ["name"])
    op.create_index("ix_deployments_bundle_name", "deployments", ["bundle_name"])


def downgrade() -> None:
    op.drop_index("ix_deployments_bundle_name", "deployments")
    op.drop_index("ix_bundles_name", "bundles")
    op.drop_constraint("uq_bundle_tenant_name_version", "bundles", type_="unique")
    op.create_unique_constraint(
        "uq_bundle_tenant_version", "bundles", ["tenant_id", "version"]
    )
    op.alter_column("bundles", "name", nullable=True)
    op.drop_column("deployments", "bundle_name")
    op.drop_column("bundles", "name")
```

**IMPORTANT:** The backfill parses `yaml_bytes` to extract `metadata.name`. If YAML is malformed or has no metadata.name, it falls back to `"unnamed"`. This handles any garbage test data.

---

## 3. Service Changes

### `src/edictum_server/services/bundle_service.py`

**`upload_bundle` — extract name from YAML, version per (tenant_id, name):**

```python
async def upload_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    yaml_content: bytes,
    uploaded_by: str,
    source_hub_slug: str | None = None,
    source_hub_revision: str | None = None,
) -> Bundle:
    # Validate YAML parses cleanly
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    # Extract bundle name from metadata
    if not isinstance(parsed, dict):
        raise ValueError("Invalid YAML: expected a mapping at top level")
    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict) or not metadata.get("name"):
        raise ValueError("Missing required field: metadata.name")
    bundle_name = str(metadata["name"])

    revision_hash = hashlib.sha256(yaml_content).hexdigest()

    # Determine next version number for this (tenant, name)
    result = await db.execute(
        select(Bundle.version)
        .where(Bundle.tenant_id == tenant_id, Bundle.name == bundle_name)
        .order_by(Bundle.version.desc())
        .limit(1)
    )
    latest_version = result.scalar_one_or_none()
    next_version = (latest_version or 0) + 1

    bundle = Bundle(
        tenant_id=tenant_id,
        name=bundle_name,
        version=next_version,
        revision_hash=revision_hash,
        yaml_bytes=yaml_content,
        uploaded_by=uploaded_by,
        source_hub_slug=source_hub_slug,
        source_hub_revision=source_hub_revision,
    )
    db.add(bundle)
    await db.flush()
    return bundle
```

**New function — `list_bundle_names`:**

```python
async def list_bundle_names(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[dict]:
    """Return distinct bundle names with latest version and contract count."""
    result = await db.execute(
        select(
            Bundle.name,
            func.max(Bundle.version).label("latest_version"),
            func.count(Bundle.id).label("version_count"),
            func.max(Bundle.created_at).label("last_updated"),
        )
        .where(Bundle.tenant_id == tenant_id)
        .group_by(Bundle.name)
        .order_by(func.max(Bundle.created_at).desc())
    )
    return [
        {
            "name": row.name,
            "latest_version": row.latest_version,
            "version_count": row.version_count,
            "last_updated": row.last_updated,
        }
        for row in result.all()
    ]
```

**New function — `list_bundle_versions`:**

```python
async def list_bundle_versions(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str,
) -> list[Bundle]:
    """Return all versions for a named bundle, ordered by version DESC."""
    result = await db.execute(
        select(Bundle)
        .where(Bundle.tenant_id == tenant_id, Bundle.name == bundle_name)
        .order_by(Bundle.version.desc())
    )
    return list(result.scalars().all())
```

**Update `list_tenant_bundles`** — keep but it now returns all versions across all names. Used internally only:

```python
async def list_tenant_bundles(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> list[Bundle]:
    """Return all bundles for a tenant across all names, ordered by version DESC."""
    result = await db.execute(
        select(Bundle).where(Bundle.tenant_id == tenant_id).order_by(Bundle.version.desc())
    )
    return list(result.scalars().all())
```

**Update `get_deployed_envs_map` — scope by bundle name:**

```python
async def get_deployed_envs_map(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str,  # NEW parameter
) -> dict[int, list[str]]:
    """Return version -> deployed envs for a specific named bundle."""
    ranked = (
        select(
            Deployment.env,
            Deployment.bundle_version,
            func.row_number()
            .over(
                partition_by=Deployment.env,
                order_by=Deployment.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            Deployment.tenant_id == tenant_id,
            Deployment.bundle_name == bundle_name,  # NEW filter
        )
        .subquery()
    )

    result = await db.execute(
        select(ranked.c.bundle_version, ranked.c.env).where(ranked.c.rn == 1)
    )

    mapping: dict[int, list[str]] = defaultdict(list)
    for version, env in result.all():
        mapping[version].append(env)
    for envs in mapping.values():
        envs.sort()
    return dict(mapping)
```

**Update `get_current_bundle` — scope by bundle name:**

```python
async def get_current_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    env: str,
    bundle_name: str,  # NEW parameter
) -> Bundle | None:
    """Return the latest deployed bundle for a given (env, bundle_name)."""
    result = await db.execute(
        select(Bundle)
        .join(
            Deployment,
            (Deployment.tenant_id == Bundle.tenant_id)
            & (Deployment.bundle_name == Bundle.name)
            & (Deployment.bundle_version == Bundle.version),
        )
        .where(
            Deployment.tenant_id == tenant_id,
            Deployment.env == env,
            Deployment.bundle_name == bundle_name,
        )
        .order_by(Deployment.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
```

**Update `get_bundle_by_version` — scope by bundle name:**

```python
async def get_bundle_by_version(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str,  # NEW parameter
    version: int,
) -> Bundle | None:
    result = await db.execute(
        select(Bundle).where(
            Bundle.tenant_id == tenant_id,
            Bundle.name == bundle_name,
            Bundle.version == version,
        )
    )
    return result.scalar_one_or_none()
```

### `src/edictum_server/services/deployment_service.py`

**`deploy_bundle` — pass bundle_name to Deployment and SSE push:**

```python
async def deploy_bundle(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    bundle_name: str,  # NEW parameter
    version: int,
    env: str,
    deployed_by: str,
    signing_secret: bytes,
    push_manager: PushManager,
) -> Deployment:
    bundle = await get_bundle_by_version(db, tenant_id, bundle_name, version)
    if bundle is None:
        raise ValueError(f"Bundle '{bundle_name}' version {version} not found")

    # ... signing logic unchanged ...

    deployment = Deployment(
        tenant_id=tenant_id,
        bundle_name=bundle_name,  # NEW
        env=env,
        bundle_version=version,
        deployed_by=deployed_by,
    )
    db.add(deployment)
    await db.flush()

    contract_data = {
        "type": "contract_update",
        "bundle_name": bundle_name,  # NEW — agents filter by this
        "version": version,
        "revision_hash": bundle.revision_hash,
        "signature": bundle.signature.hex() if bundle.signature else None,
        "yaml_bytes": base64.b64encode(bundle.yaml_bytes).decode(),
    }
    push_manager.push_to_env(env, contract_data)
    push_manager.push_to_dashboard(tenant_id, contract_data)

    return deployment
```

---

## 4. Schema Changes

### `src/edictum_server/schemas/bundles.py`

```python
class BundleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str  # NEW
    version: int
    revision_hash: str
    signature_hex: str | None = None
    source_hub_slug: str | None = None
    source_hub_revision: str | None = None
    uploaded_by: str
    created_at: datetime


class BundleWithDeploymentsResponse(BundleResponse):
    deployed_envs: list[str] = []


class BundleSummaryResponse(BaseModel):
    """Summary of a named bundle (for the bundle list)."""
    name: str
    latest_version: int
    version_count: int
    last_updated: datetime
    deployed_envs: list[str] = []  # envs where any version of this bundle is deployed


class DeploymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bundle_name: str  # NEW
    env: str
    bundle_version: int
    deployed_by: str
    created_at: datetime
```

---

## 5. Route Changes

### `src/edictum_server/routes/bundles.py`

The API becomes name-scoped. New route structure:

```
POST   /api/v1/bundles                          → upload (name extracted from YAML)
GET    /api/v1/bundles                          → list distinct bundle names (summaries)
GET    /api/v1/bundles/{name}                   → list versions for a named bundle
GET    /api/v1/bundles/{name}/{version}         → get specific version
GET    /api/v1/bundles/{name}/{version}/yaml    → get YAML content
POST   /api/v1/bundles/{name}/{version}/deploy  → deploy to environment
GET    /api/v1/bundles/{name}/current           → get currently deployed version for env
```

**Key implementation notes:**

**Upload (POST /bundles)** — unchanged path, now extracts `metadata.name`:
```python
@router.post("", response_model=BundleResponse, status_code=201)
async def upload(body: BundleUploadRequest, ...):
    bundle = await upload_bundle(db=db, tenant_id=auth.tenant_id, ...)
    push.push_to_dashboard(auth.tenant_id, {
        "type": "bundle_uploaded",
        "bundle_name": bundle.name,  # NEW
        "version": bundle.version,
        "revision_hash": bundle.revision_hash,
        "uploaded_by": auth.user_id or "unknown",
    })
    return _bundle_to_response(bundle)
```

**`_bundle_to_response` — include name:**
```python
def _bundle_to_response(bundle: Bundle) -> BundleResponse:
    return BundleResponse(
        id=bundle.id,
        tenant_id=bundle.tenant_id,
        name=bundle.name,  # NEW
        version=bundle.version,
        revision_hash=bundle.revision_hash,
        signature_hex=bundle.signature.hex() if bundle.signature is not None else None,
        source_hub_slug=bundle.source_hub_slug,
        source_hub_revision=bundle.source_hub_revision,
        uploaded_by=bundle.uploaded_by,
        created_at=bundle.created_at,
    )
```

**List bundles (GET /bundles)** — returns bundle summaries:
```python
@router.get("", response_model=list[BundleSummaryResponse])
async def list_bundles(auth, db):
    names = await list_bundle_names(db, auth.tenant_id)
    result = []
    for entry in names:
        envs_map = await get_deployed_envs_map(db, auth.tenant_id, entry["name"])
        all_envs = sorted({env for envs in envs_map.values() for env in envs})
        result.append(BundleSummaryResponse(
            name=entry["name"],
            latest_version=entry["latest_version"],
            version_count=entry["version_count"],
            last_updated=entry["last_updated"],
            deployed_envs=all_envs,
        ))
    return result
```

**List versions (GET /bundles/{name}):**
```python
@router.get("/{name}", response_model=list[BundleWithDeploymentsResponse])
async def list_versions(name: str, auth, db):
    bundles = await list_bundle_versions(db, auth.tenant_id, name)
    if not bundles:
        raise HTTPException(status_code=404, detail=f"Bundle '{name}' not found")
    envs_map = await get_deployed_envs_map(db, auth.tenant_id, name)
    return [
        BundleWithDeploymentsResponse(
            **_bundle_to_response(b).model_dump(),
            deployed_envs=envs_map.get(b.version, []),
        )
        for b in bundles
    ]
```

**Get version (GET /bundles/{name}/{version}):**
```python
@router.get("/{name}/{version}", response_model=BundleResponse)
async def get_version(name: str, version: int, auth, db):
    bundle = await get_bundle_by_version(db, auth.tenant_id, name, version)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"Bundle '{name}' v{version} not found")
    return _bundle_to_response(bundle)
```

**Get YAML (GET /bundles/{name}/{version}/yaml):**
```python
@router.get("/{name}/{version}/yaml")
async def get_yaml(name: str, version: int, auth, db):
    bundle = await get_bundle_by_version(db, auth.tenant_id, name, version)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"Bundle '{name}' v{version} not found")
    return Response(content=bundle.yaml_bytes, media_type="application/x-yaml")
```

**Deploy (POST /bundles/{name}/{version}/deploy):**
```python
@router.post("/{name}/{version}/deploy", response_model=DeploymentResponse, status_code=201)
async def deploy(name: str, version: int, body: DeployRequest, auth, db, push):
    deployment = await deploy_bundle(
        db=db, tenant_id=auth.tenant_id,
        bundle_name=name, version=version,
        env=body.env, deployed_by=auth.user_id or "unknown",
        signing_secret=signing_secret, push_manager=push,
    )
    await db.commit()
    return DeploymentResponse(
        id=deployment.id,
        bundle_name=deployment.bundle_name,
        env=deployment.env,
        bundle_version=deployment.bundle_version,
        deployed_by=deployment.deployed_by,
        created_at=deployment.created_at,
    )
```

**Current bundle (GET /bundles/{name}/current):**
```python
@router.get("/{name}/current", response_model=BundleResponse)
async def current(name: str, env: str = Query(...), auth, db):
    bundle = await get_current_bundle(db, auth.tenant_id, env, name)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"No deployed bundle '{name}' for env '{env}'")
    return _bundle_to_response(bundle)
```

**IMPORTANT — Route ordering:** FastAPI matches routes top-to-bottom. `/{name}/current` must be registered BEFORE `/{name}/{version}`, otherwise "current" gets matched as a version path parameter. Since `version` is typed as `int` in the function signature, FastAPI will reject non-integer paths and fall through. Verify this works in tests.

### `src/edictum_server/routes/deployments.py`

Add `bundle_name` filter:

```python
@router.get("", response_model=list[DeploymentResponse])
async def list_deployments(
    env: str | None = Query(default=None),
    bundle_name: str | None = Query(default=None),  # NEW
    limit: int = Query(default=50, ge=1, le=200),
    auth, db,
):
    stmt = (
        select(Deployment)
        .where(Deployment.tenant_id == auth.tenant_id)
        .order_by(Deployment.created_at.desc())
        .limit(limit)
    )
    if env is not None:
        stmt = stmt.where(Deployment.env == env)
    if bundle_name is not None:
        stmt = stmt.where(Deployment.bundle_name == bundle_name)
    # ...
```

### `src/edictum_server/routes/evaluate.py`

No changes needed — takes raw YAML content, not a bundle name/version reference.

### `src/edictum_server/routes/stats.py`

No changes needed — stats aggregate by `decision_name` from event payloads, already tenant-scoped.

---

## 6. SSE Changes

### Agent stream (`routes/stream.py`)

Currently agents subscribe by `env` only. With multi-bundle, an agent subscribed to "production" receives `contract_update` events for ALL bundles deployed to production. The SDK filters client-side by `bundle_name` in the event payload.

**No server-side change needed.** The `contract_update` event already includes `bundle_name` (from deployment_service changes). The SDK filters by checking `event.data["bundle_name"]`.

**Update `SDK_COMPAT.md`** to document `bundle_name` in `contract_update`:

```
event: contract_update
data: {"bundle_name": "devops-agent", "version": 7, "revision_hash": "abc123", ...}
```

### Dashboard stream

No changes — dashboard receives all events for the tenant. Frontend filters by selected bundle.

### `bundle_uploaded` event now includes `bundle_name`:
```json
{
  "type": "bundle_uploaded",
  "bundle_name": "devops-agent",
  "version": 3,
  "revision_hash": "abc...",
  "uploaded_by": "user_123"
}
```

---

## 7. Frontend API Client Updates

### `dashboard/src/lib/api/bundles.ts`

Update types and functions to match new routes:

```typescript
// --- Bundle summary (from GET /bundles) ---

export interface BundleSummary {
  name: string
  latest_version: number
  version_count: number
  last_updated: string
  deployed_envs: string[]
}

// --- Existing types updated ---

export interface BundleResponse {
  id: string
  tenant_id: string
  name: string  // NEW
  version: number
  revision_hash: string
  signature_hex: string | null
  source_hub_slug: string | null
  source_hub_revision: string | null
  uploaded_by: string
  created_at: string
}

export interface BundleWithDeployments extends BundleResponse {
  deployed_envs: string[]
}

export interface DeploymentResponse {
  id: string
  bundle_name: string  // NEW
  env: string
  bundle_version: number
  deployed_by: string
  created_at: string
}

// --- API functions ---

/** List distinct bundle names with summaries. */
export function listBundles() {
  return request<BundleSummary[]>("/bundles")
}

/** List all versions for a named bundle. */
export function listBundleVersions(name: string) {
  return request<BundleWithDeployments[]>(`/bundles/${encodeURIComponent(name)}`)
}

/** Upload a new bundle version (name extracted from YAML metadata). */
export function uploadBundle(yamlContent: string) {
  return request<BundleResponse>("/bundles", {
    method: "POST",
    body: JSON.stringify({ yaml_content: yamlContent }),
  })
}

/** Deploy a bundle version to an environment. */
export function deployBundle(name: string, version: number, env: string) {
  return request<DeploymentResponse>(
    `/bundles/${encodeURIComponent(name)}/${version}/deploy`,
    { method: "POST", body: JSON.stringify({ env }) },
  )
}

/** Get raw YAML for a specific bundle version. */
export async function getBundleYaml(name: string, version: number): Promise<string> {
  const res = await fetch(
    `${API_BASE}/bundles/${encodeURIComponent(name)}/${version}/yaml`,
    { credentials: "include" },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.text()
}

/** Get currently deployed bundle for a (name, env). */
export function getCurrentBundle(name: string, env: string) {
  return request<BundleResponse>(
    `/bundles/${encodeURIComponent(name)}/current?env=${encodeURIComponent(env)}`,
  )
}

/** List deployments, optionally filtered by bundle_name and/or env. */
export function listDeployments(bundleName?: string, env?: string, limit = 50) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  if (env) params.set("env", env)
  params.set("limit", String(limit))
  return request<DeploymentResponse[]>(`/deployments?${params}`)
}

// evaluate stays unchanged — takes raw YAML, not name/version
```

### `dashboard/src/lib/api/index.ts`

Update re-exports:
```typescript
export { listBundles, listBundleVersions, uploadBundle, deployBundle, getBundleYaml, getCurrentBundle, evaluateBundle, listDeployments } from "./bundles"
export type { BundleSummary, BundleResponse, BundleWithDeployments, DeploymentResponse, EvaluateRequest, EvaluateResponse, ContractEvaluation } from "./bundles"
```

---

## 8. Tests

### Update `tests/test_bundles.py`

**CRITICAL:** All test YAML must now include `metadata.name`. Update `SAMPLE_YAML`:

```python
SAMPLE_YAML_A = """
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: devops-agent
defaults:
  mode: enforce
contracts:
  - id: test-deny
    type: pre
    tool: shell
    when:
      tool_name:
        equals: dangerous_tool
    then:
      effect: deny
      message: blocked
""".strip()

SAMPLE_YAML_B = """
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: research-agent
defaults:
  mode: observe
contracts:
  - id: web-sandbox
    type: sandbox
    tools: ["web_fetch"]
    within: ["https://example.com"]
""".strip()
```

**New tests to add:**

```python
async def test_upload_extracts_name(client):
    resp = await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    assert resp.status_code == 201
    assert resp.json()["name"] == "devops-agent"
    assert resp.json()["version"] == 1


async def test_upload_same_name_increments_version(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    # Upload again with same metadata.name
    resp = await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    assert resp.json()["name"] == "devops-agent"
    assert resp.json()["version"] == 2


async def test_upload_different_name_starts_at_v1(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})
    assert resp.json()["name"] == "research-agent"
    assert resp.json()["version"] == 1  # Independent lineage


async def test_list_bundles_returns_summaries(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    resp = await client.get("/api/v1/bundles")
    data = resp.json()
    assert len(data) == 2  # Two distinct bundles
    names = {b["name"] for b in data}
    assert names == {"devops-agent", "research-agent"}
    devops = next(b for b in data if b["name"] == "devops-agent")
    assert devops["latest_version"] == 2
    assert devops["version_count"] == 2


async def test_list_versions_for_bundle(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    resp = await client.get("/api/v1/bundles/devops-agent")
    data = resp.json()
    assert len(data) == 2
    assert data[0]["version"] == 2  # desc order
    assert data[1]["version"] == 1


async def test_list_versions_unknown_bundle(client):
    resp = await client.get("/api/v1/bundles/nonexistent")
    assert resp.status_code == 404


async def test_get_yaml_by_name_version(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.get("/api/v1/bundles/devops-agent/1/yaml")
    assert resp.status_code == 200
    assert b"devops-agent" in resp.content


async def test_deploy_by_name(client, db_session):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.post(
        "/api/v1/bundles/devops-agent/1/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 201
    assert resp.json()["bundle_name"] == "devops-agent"
    assert resp.json()["bundle_version"] == 1


async def test_deploy_wrong_name_404(client):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    resp = await client.post(
        "/api/v1/bundles/research-agent/1/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422  # bundle not found


async def test_upload_missing_metadata_name(client):
    bad_yaml = "apiVersion: edictum/v1\nkind: ContractBundle\ncontracts: []\n"
    resp = await client.post("/api/v1/bundles", json={"yaml_content": bad_yaml})
    assert resp.status_code == 422
    assert "metadata.name" in resp.json()["detail"]


async def test_deployed_envs_scoped_by_bundle(client, db_session):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_B})

    # Deploy devops to production, research to staging
    await _deploy_via_db(db_session, "devops-agent", 1, "production", _T0)
    await _deploy_via_db(db_session, "research-agent", 1, "staging", _T0)

    resp = await client.get("/api/v1/bundles/devops-agent")
    devops = {b["version"]: b for b in resp.json()}
    assert devops[1]["deployed_envs"] == ["production"]

    resp = await client.get("/api/v1/bundles/research-agent")
    research = {b["version"]: b for b in resp.json()}
    assert research[1]["deployed_envs"] == ["staging"]
```

**Update the `_deploy_via_db` helper** to include `bundle_name`:
```python
async def _deploy_via_db(db, bundle_name, version, env, at):
    db.add(Deployment(
        tenant_id=TENANT_A_ID,
        bundle_name=bundle_name,
        env=env,
        bundle_version=version,
        deployed_by="test",
        created_at=at,
    ))
    await db.commit()
```

### Update `tests/test_adversarial/test_s3_tenant_isolation.py`

Add cross-tenant tests for bundle-name-scoped queries:

```python
async def test_bundle_versions_not_visible_across_tenants(client, set_auth_tenant_b):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})

    set_auth_tenant_b()
    resp = await client.get("/api/v1/bundles/devops-agent")
    assert resp.status_code == 404  # not visible, not empty list


async def test_deploy_cross_tenant_bundle(client, set_auth_tenant_b):
    await client.post("/api/v1/bundles", json={"yaml_content": SAMPLE_YAML_A})

    set_auth_tenant_b()
    resp = await client.post(
        "/api/v1/bundles/devops-agent/1/deploy",
        json={"env": "production"},
    )
    assert resp.status_code in (404, 422)  # cannot deploy another tenant's bundle
```

**Update existing `SAMPLE_YAML`** in the adversarial test file to include `metadata.name`.

### Update other test files

- `tests/test_deployments.py` — add `bundle_name` to test data
- `tests/test_bundle_sse.py` — verify `bundle_name` in SSE event payload
- `tests/test_contract_stats.py` — no changes needed (event-based)
- `tests/test_evaluate.py` — no changes needed (takes raw YAML)

---

## 9. Checklist

- [ ] Model: `Bundle.name` column added, new unique constraint
- [ ] Model: `Deployment.bundle_name` column added
- [ ] Migration: backfill from `yaml_bytes`, fallback to "unnamed"
- [ ] Migration: verify downgrade path
- [ ] Service: `upload_bundle` extracts `metadata.name`, validates it exists
- [ ] Service: `upload_bundle` versions per `(tenant_id, name)`
- [ ] Service: all query functions accept `bundle_name` parameter
- [ ] Routes: `GET /bundles` returns summaries (names, not all versions)
- [ ] Routes: `GET /bundles/{name}` returns versions for that bundle
- [ ] Routes: `GET /bundles/{name}/{version}` + `/yaml`
- [ ] Routes: `POST /bundles/{name}/{version}/deploy`
- [ ] Routes: `GET /bundles/{name}/current`
- [ ] Routes: verify FastAPI route ordering (no conflicts between `{name}/current` and `{name}/{version}`)
- [ ] Schemas: `BundleResponse.name`, `DeploymentResponse.bundle_name`, new `BundleSummaryResponse`
- [ ] SSE: `contract_update` and `bundle_uploaded` include `bundle_name`
- [ ] SDK_COMPAT.md: updated with `bundle_name` in SSE events
- [ ] Deployments route: `bundle_name` query filter
- [ ] Frontend API client: types + functions updated
- [ ] Frontend API index: re-exports updated
- [ ] Tests: all SAMPLE_YAML includes `metadata.name`
- [ ] Tests: multi-bundle upload, versioning, listing, deploy
- [ ] Tests: cross-tenant isolation on name-scoped routes
- [ ] Tests: upload with missing `metadata.name` → 422
- [ ] All existing tests pass (update any that use old route signatures)
- [ ] `alembic upgrade head` succeeds on fresh DB
- [ ] `alembic upgrade head` succeeds on DB with existing rows (backfill)
