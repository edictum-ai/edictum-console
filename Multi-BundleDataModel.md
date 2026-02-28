# PROMPT: Multi-Bundle Data Model — Named Bundle Lineages

> **Problem:** The Bundle model treats all versions as a single lineage per tenant. One tenant gets one version counter — upload "devops-agent" as v1, "research-agent" as v2, they're just versions 1 and 2 of the same unnamed lineage. Real tenants govern multiple agents with different bundles.
>
> **Fix:** Add `name` column to Bundle, scope versions per (tenant_id, name). Each bundle name has its own version history, deployments, and evolution.
>
> **Scope:** Console backend + frontend API client types. No UI changes. The edictum library SDK changes are in a separate companion spec (`Multi-BundleSDK.md`).
>
> **Breaking change:** This is pre-release with no external consumers. Old route paths (`/bundles/{version}`, `/bundles/current`) are removed, not aliased. Clean break.

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
    # SAFE: At migration time, the old constraint is (tenant_id, version) — unique.
    # So the join on (tenant_id, bundle_version) returns exactly one bundle per deployment.
    # After migration, versions are scoped per (tenant_id, name), but that doesn't exist yet.
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

**`list_tenant_bundles` — now returns all versions across all bundle names:**

Keep this function as-is (returns all bundles for tenant, ordered by version desc). The frontend will group by name. Alternatively, add a new function:

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

**`get_deployed_envs_map` — scope by bundle name:**

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

**`get_current_bundle` — scope by bundle name:**

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

**`get_bundle_by_version` — scope by bundle name:**

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

The API becomes name-scoped. **Clean break** — old routes (`/bundles/{version}`, `/bundles/current`) are removed entirely. No aliases, no backward compatibility shims. This is pre-release with no external consumers.

**New route structure:**

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

**Upload (POST /bundles)** — unchanged path, but now extracts `metadata.name` and uses it for versioning:
```python
@router.post("", response_model=BundleResponse, status_code=201)
async def upload(body: BundleUploadRequest, ...):
    bundle = await upload_bundle(db=db, tenant_id=auth.tenant_id, ...)
    # bundle.name is now populated from YAML metadata
    push.push_to_dashboard(auth.tenant_id, {
        "type": "bundle_uploaded",
        "bundle_name": bundle.name,  # NEW
        "version": bundle.version,
        "revision_hash": bundle.revision_hash,
        "uploaded_by": auth.user_id or "unknown",
    })
    return _bundle_to_response(bundle)
```

**List bundles (GET /bundles)** — now returns bundle summaries, not all versions:
```python
@router.get("", response_model=list[BundleSummaryResponse])
async def list_bundles(auth, db):
    names = await list_bundle_names(db, auth.tenant_id)
    # TODO: batch deployed_envs query across all bundle names to avoid N+1
    # At 20 bundles this is ~20 lightweight indexed queries — acceptable for v1
    result = []
    for entry in names:
        # Get deployed envs across all versions of this bundle
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

**IMPORTANT — Route ordering:** FastAPI matches routes top-to-bottom. `/{name}/current` must be registered BEFORE `/{name}/{version}`, otherwise "current" gets matched as a version path parameter. Alternatively, constrain `version` to int in the path. Since version is already typed as `int` in the function signature, FastAPI will reject non-integer paths and fall through. Verify this works in tests.

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

No changes needed — the evaluate endpoint takes raw YAML content, not a bundle name/version reference.

### `src/edictum_server/routes/stats.py` + stats_service

The contract stats endpoint (`GET /api/v1/stats/contracts`) currently aggregates by `decision_name` from event payloads. It does NOT need a bundle_name scope because events are already tenant-scoped and the `decision_name` in the payload is what matters for coverage display. **No changes needed** unless we later want to filter stats by bundle.

The overview stats (`GET /api/v1/stats/overview`) also stays unchanged — it reports tenant-wide numbers.

---

## 6. SSE & Push Infrastructure Changes

### 6a. PushManager — Connection Metadata (`push/manager.py`)

Currently `PushManager` stores `dict[str, set[asyncio.Queue]]` — bare queues per env. No idea who's connected or what they're running.

Add `AgentConnection` dataclass:

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class AgentConnection:
    queue: asyncio.Queue[dict[str, Any]]
    env: str
    tenant_id: uuid.UUID               # from auth context — enables tenant-scoped push
    bundle_name: str | None             # from SSE query param
    policy_version: str | None          # revision_hash agent is currently running
    agent_id: str                       # from auth header (X-Edictum-Agent-Id)
    connected_at: datetime = field(default_factory=datetime.utcnow)
```

Change `_connections` from `dict[str, set[Queue]]` to `dict[str, set[AgentConnection]]`.

**`subscribe()` now accepts metadata and returns `AgentConnection`:**

```python
def subscribe(
    self,
    env: str,
    *,
    tenant_id: uuid.UUID,
    agent_id: str,
    bundle_name: str | None = None,
    policy_version: str | None = None,
) -> AgentConnection:
    conn = AgentConnection(
        queue=asyncio.Queue(),
        env=env,
        tenant_id=tenant_id,
        bundle_name=bundle_name,
        policy_version=policy_version,
        agent_id=agent_id,
    )
    self._connections[env].add(conn)
    return conn
```

**`unsubscribe()` takes `AgentConnection`:**

```python
def unsubscribe(self, env: str, conn: AgentConnection) -> None:
    self._connections[env].discard(conn)
    if not self._connections[env]:
        del self._connections[env]
```

**`push_to_env()` gains tenant + bundle filtering:**

```python
def push_to_env(
    self,
    env: str,
    data: dict[str, Any],
    *,
    tenant_id: uuid.UUID,  # NEW — required, enables tenant isolation on push
) -> None:
    for conn in self._connections.get(env, set()):
        # Tenant isolation: only push to connections from the same tenant
        if conn.tenant_id != tenant_id:
            continue
        # Bundle filtering: if connection has a bundle_name filter and event
        # is a contract_update, only push if bundle_name matches
        if (
            conn.bundle_name
            and data.get("type") == "contract_update"
            and data.get("bundle_name") != conn.bundle_name
        ):
            continue
        conn.queue.put_nowait(data)
```

**NOTE:** This fixes a latent tenant isolation gap — old `push_to_env` broadcast to ALL agents on an env regardless of tenant. With `AgentConnection.tenant_id`, the push is now tenant-scoped. All callers of `push_to_env` must pass `tenant_id`.

**`get_agent_connections()` for fleet dashboard:**

```python
def get_agent_connections(
    self,
    tenant_id: uuid.UUID,
    bundle_name: str | None = None,
) -> list[AgentConnection]:
    """Return active connections for a tenant, optionally filtered by bundle_name."""
    result = []
    for env_conns in self._connections.values():
        for conn in env_conns:
            if conn.tenant_id != tenant_id:
                continue
            if bundle_name and conn.bundle_name != bundle_name:
                continue
            result.append(conn)
    return result
```

Update `_DASHBOARD_EVENT_TYPES` to include any new event types as needed.

### 6b. SSE Stream Route — Accept Query Params (`routes/stream.py`)

```python
@router.get("")
async def stream(
    env: str = Query(...),
    bundle_name: str | None = Query(default=None),       # NEW — optional filter
    policy_version: str | None = Query(default=None),     # NEW — drift tracking
    _auth: AuthContext = Depends(require_api_key),
    push: PushManager = Depends(get_push_manager),
) -> EventSourceResponse:
    conn = push.subscribe(
        env,
        tenant_id=_auth.tenant_id,
        agent_id=_auth.agent_id or "unknown",
        bundle_name=bundle_name,
        policy_version=policy_version,
    )

    async def event_stream():
        try:
            async for event in _event_generator(conn.queue):
                yield event
        finally:
            push.unsubscribe(env, conn)

    return EventSourceResponse(event_stream())
```

**Filtering moves to `push_to_env()`** (in the PushManager), not in `_event_generator`. The generator stays simple — just reads from queue and yields SSE format. The filtering happens at push time, which is more efficient (no wasted queue writes).

```python
async def _event_generator(
    queue: asyncio.Queue[dict[str, Any]],
) -> AsyncGenerator[dict[str, str], None]:
    """Yield SSE-formatted events from the queue. Filtering is done at push time."""
    while True:
        try:
            data = await queue.get()
            yield {"event": data.get("type", "message"), "data": json.dumps(data)}
        except asyncio.CancelledError:
            return
```

**Note:** `_auth.agent_id` — currently `AuthContext` from `require_api_key` may not have `agent_id`. Check if the API key auth dependency extracts `X-Edictum-Agent-Id` header. If not, add it.

### 6c. SSE Event Payload — Add `public_key` (`services/deployment_service.py`)

The `deploy_bundle` function already loads the `SigningKey` row to sign the bundle. Include the public key in the SSE payload at zero cost:

```python
contract_data = {
    "type": "contract_update",
    "bundle_name": bundle_name,
    "version": version,
    "revision_hash": bundle.revision_hash,
    "signature": bundle.signature.hex() if bundle.signature else None,
    "public_key": signing_key.public_key.hex() if signing_key else None,  # NEW
    "yaml_bytes": base64.b64encode(bundle.yaml_bytes).decode(),
}
push_manager.push_to_env(env, contract_data, tenant_id=tenant_id)
push_manager.push_to_dashboard(tenant_id, contract_data)
```

SDK stores `public_key` but doesn't verify yet. When `edictum[verified]` ships, the field is already there.

### 6d. Dashboard stream

No changes — dashboard receives all events for the tenant. The frontend filters by selected bundle.

### 6e. `bundle_uploaded` event

Now includes `bundle_name`:
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

## 6f. Drift Detection (`services/drift_service.py`)

New service module. On inbound events, check if the agent's `policy_version` (revision_hash) matches what's currently deployed.

```python
async def check_drift(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    policy_version: str,  # revision_hash from event payload
    env: str,
) -> str:
    """Return 'current', 'drift', or 'unknown'.

    Looks up which bundle has this revision_hash, then checks if that
    bundle name's current deployment in env matches.
    """
    # Find bundle by revision_hash
    result = await db.execute(
        select(Bundle.name, Bundle.version)
        .where(Bundle.tenant_id == tenant_id, Bundle.revision_hash == policy_version)
        .limit(1)
    )
    row = result.first()
    if row is None:
        return "unknown"  # hash not found — old bundle or different tenant

    bundle_name, bundle_version = row
    # Get current deployed version for this (bundle_name, env)
    current = await get_current_bundle(db, tenant_id, env, bundle_name)
    if current is None:
        return "unknown"  # not deployed to this env
    if current.revision_hash == policy_version:
        return "current"
    return "drift"
```

**Migration note:** Add index `ix_bundles_revision_hash` on `Bundle.revision_hash` for fast lookup:

```python
# In 003_add_bundle_name.py upgrade():
op.create_index("ix_bundles_revision_hash", "bundles", ["revision_hash"])
```

**Integration with events route:** After `ingest_events()`, optionally check drift for events that have `payload.policy_version` and `payload.environment`. This is a **non-blocking, best-effort check** — don't fail event ingestion if drift check errors.

**Where drift status lives:** In-memory on `AgentConnection.policy_version`. The fleet status endpoint (§6g) cross-references against currently deployed `revision_hash` to compute `"current"` vs `"drift"` at read time. No DB table for drift status — it's transient.

---

## 6g. Agent Fleet Status Endpoint (`routes/agents.py`)

New route file:

```python
router = APIRouter(prefix="/api/v1/agents", tags=["agents"])

@router.get("/status", response_model=AgentFleetStatusResponse)
async def agent_status(
    bundle_name: str | None = Query(default=None),
    auth: AuthContext = Depends(require_dashboard_auth),
    push: PushManager = Depends(get_push_manager),
    db: AsyncSession = Depends(get_db),
):
    connections = push.get_agent_connections(auth.tenant_id, bundle_name)

    agents = []
    for conn in connections:
        # Determine drift status
        status = "unknown"
        if conn.policy_version and conn.bundle_name:
            status = await check_drift(db, auth.tenant_id, conn.policy_version, conn.env)

        agents.append(AgentStatusEntry(
            agent_id=conn.agent_id,
            env=conn.env,
            bundle_name=conn.bundle_name,
            policy_version=conn.policy_version,
            status=status,
            connected_at=conn.connected_at,
        ))

    return AgentFleetStatusResponse(agents=agents)
```

**Schemas** (new file `schemas/agents.py`):

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

**Register in `main.py`:** Add `app.include_router(agents_router)`.

**Frontend API** — add to `dashboard/src/lib/api/agents.ts` (new file):

```typescript
export interface AgentStatusEntry {
  agent_id: string
  env: string
  bundle_name: string | null
  policy_version: string | null
  status: "current" | "drift" | "unknown"
  connected_at: string
}

export interface AgentFleetStatus {
  agents: AgentStatusEntry[]
}

export function getAgentStatus(bundleName?: string) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  return request<AgentFleetStatus>(`/agents/status?${params}`)
}
```

Update `dashboard/src/lib/api/index.ts` re-exports accordingly.

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
  return request("/bundles")
}

/** List all versions for a named bundle. */
export function listBundleVersions(name: string) {
  return request(`/bundles/${encodeURIComponent(name)}`)
}

/** Upload a new bundle version (name extracted from YAML metadata). */
export function uploadBundle(yamlContent: string) {
  return request("/bundles", {
    method: "POST",
    body: JSON.stringify({ yaml_content: yamlContent }),
  })
}

/** Deploy a bundle version to an environment. */
export function deployBundle(name: string, version: number, env: string) {
  return request(
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
  return request(
    `/bundles/${encodeURIComponent(name)}/current?env=${encodeURIComponent(env)}`,
  )
}

/** List deployments, optionally filtered by bundle_name and/or env. */
export function listDeployments(bundleName?: string, env?: string, limit = 50) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  if (env) params.set("env", env)
  params.set("limit", String(limit))
  return request(`/deployments?${params}`)
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

**CRITICAL:** All test YAML across ALL test files must now include `metadata.name`. This affects:
- `tests/test_bundles.py` — `SAMPLE_YAML` constant
- `tests/test_adversarial/test_s3_tenant_isolation.py` — any inline YAML
- `tests/test_deployments.py` — any test data that creates bundles
- `tests/test_evaluate.py` — evaluate takes raw YAML so it still works, but update for consistency
- Any conftest helpers that create bundles

Replace `SAMPLE_YAML` with two named variants:

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


async def test_deploy_wrong_name_returns_error(client):
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

Update the `_deploy_via_db` helper to include `bundle_name`:
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

Update existing `SAMPLE_YAML` in the adversarial test file to include `metadata.name`.

### Update `tests/test_deployments.py`

Ensure deployment listing respects `bundle_name` filter and test data includes `bundle_name`.

### Update `tests/test_contract_stats.py`

No changes needed — stats are based on event payloads, not bundle model.

### Update `tests/test_evaluate.py`

No changes needed — evaluate takes raw YAML.

---

## 9. Checklist

### Model & Migration
- [ ] Model: `Bundle.name` column added, new unique constraint `(tenant_id, name, version)`
- [ ] Model: `Deployment.bundle_name` column added
- [ ] Migration: backfill from `yaml_bytes`, fallback to "unnamed"
- [ ] Migration: `ix_bundles_revision_hash` index added (for drift lookups)
- [ ] Migration: verify downgrade path
- [ ] `alembic upgrade head` succeeds on fresh DB
- [ ] `alembic upgrade head` succeeds on DB with existing rows (backfill)

### Services
- [ ] Service: `upload_bundle` extracts `metadata.name`, validates it exists
- [ ] Service: `upload_bundle` versions per `(tenant_id, name)`
- [ ] Service: all query functions accept `bundle_name` parameter
- [ ] Service: new `drift_service.py` — `check_drift()` function

### Routes
- [ ] Routes: `GET /bundles` returns summaries (names, not all versions)
- [ ] Routes: `GET /bundles/{name}` returns versions for that bundle
- [ ] Routes: `GET /bundles/{name}/{version}` + `/yaml`
- [ ] Routes: `POST /bundles/{name}/{version}/deploy`
- [ ] Routes: `GET /bundles/{name}/current`
- [ ] Routes: verify FastAPI route ordering (no conflicts between `{name}/current` and `{name}/{version}`)
- [ ] Routes: old `/bundles/{version}` and `/bundles/current` routes removed (clean break)
- [ ] Deployments route: `bundle_name` query filter
- [ ] New route: `GET /api/v1/agents/status` — agent fleet status endpoint
- [ ] Register `agents_router` in `main.py`

### Schemas
- [ ] Schemas: `BundleResponse.name`, `DeploymentResponse.bundle_name`, new `BundleSummaryResponse`
- [ ] Schemas: new `schemas/agents.py` — `AgentStatusEntry`, `AgentFleetStatusResponse`

### Push & SSE Infrastructure
- [ ] PushManager: `AgentConnection` dataclass with `tenant_id`, `agent_id`, `bundle_name`, `policy_version`, `connected_at`
- [ ] PushManager: `subscribe()` accepts metadata, returns `AgentConnection`
- [ ] PushManager: `unsubscribe()` takes `AgentConnection`
- [ ] PushManager: `push_to_env()` filters by `tenant_id` (fixes latent isolation gap) + `bundle_name`
- [ ] PushManager: `get_agent_connections(tenant_id, bundle_name?)` for fleet dashboard
- [ ] SSE: Agent stream accepts `bundle_name` + `policy_version` query params
- [ ] SSE: `contract_update` and `bundle_uploaded` include `bundle_name`
- [ ] SSE: `contract_update` includes `public_key` (from signing key row)
- [ ] SSE: When `bundle_name` set on connection, only matching `contract_update` pushed
- [ ] SSE: When `bundle_name` omitted, all events forwarded (backward compatible)
- [ ] All callers of `push_to_env` updated to pass `tenant_id`

### SDK_COMPAT & Docs
- [ ] SDK_COMPAT.md: SSE stream query params (`bundle_name`, `policy_version`)
- [ ] SDK_COMPAT.md: `contract_update` payload with `bundle_name` + `public_key`
- [ ] SDK_COMPAT.md: agent fleet status endpoint documented

### Frontend API Client
- [ ] Frontend API client: bundle types + functions updated
- [ ] Frontend API client: new `api/agents.ts` — `getAgentStatus()`
- [ ] Frontend API index: re-exports updated

### Tests
- [ ] Tests: all SAMPLE_YAML across ALL test files includes `metadata.name`
- [ ] Tests: multi-bundle upload, versioning, listing, deploy
- [ ] Tests: cross-tenant isolation on name-scoped routes
- [ ] Tests: upload with missing `metadata.name` → 422
- [ ] Tests: PushManager tenant filtering (push_to_env doesn't cross tenants)
- [ ] Tests: PushManager bundle_name filtering on contract_update events
- [ ] Tests: agent fleet status endpoint returns connected agents
- [ ] Tests: drift detection — current vs drift vs unknown
- [ ] All existing tests pass (update any that use old route signatures)