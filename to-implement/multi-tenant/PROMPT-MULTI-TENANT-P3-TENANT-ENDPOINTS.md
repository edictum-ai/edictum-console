# P3: Tenant Management Endpoints, Updated getMe, Login Flow

> **Scope:** Tenant CRUD endpoints, slug resolution, updated auth/me response, login session changes
> **Depends on:** P1 (data model), P2 (auth layer with roles)
> **Blocks:** P7 (frontend auth context needs updated getMe), P8 (routes need slug resolution)
> **Deliverable:** Tenant list/create/update/switch endpoints, slug resolution, expanded getMe response with tenants array

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "API Changes" section (Tenant Management, Modified Endpoints)
2. `src/edictum_server/routes/auth.py` — Current login, getMe, setup endpoints
3. `src/edictum_server/auth/local.py` — Session creation, authentication
4. `src/edictum_server/main.py` — `_bootstrap_admin()` lifespan
5. `src/edictum_server/services/membership_service.py` — (from P1)
6. `src/edictum_server/services/role_service.py` — (from P1) `generate_slug()`

---

## Files to Create/Modify

### `src/edictum_server/services/tenant_service.py` (new, <150 lines)

```python
async def list_user_tenants(db, user_id) -> list[dict]
    # Returns [{id, name, slug, role}] for all accepted memberships

async def create_tenant(db, name, creator_user_id) -> Tenant
    # Creates tenant with generated slug, creates owner membership for creator

async def update_tenant(db, tenant_id, name=None, slug=None) -> Tenant
    # Update name and/or slug. Validate slug uniqueness.

async def get_tenant_by_slug(db, slug) -> Tenant | None

async def switch_active_tenant(redis, session_id, user_id, target_tenant_id, db) -> dict
    # Verify user has accepted membership in target tenant
    # Update session's active_tenant_id and role
    # Return new active tenant info
```

### `src/edictum_server/routes/tenants.py` (new, <150 lines)

```
GET    /api/v1/tenants                 → list_user_tenants (require_dashboard_auth)
POST   /api/v1/tenants                 → create_tenant (require_dashboard_auth)
PUT    /api/v1/tenants/{tenant_id}     → update_tenant (require_role("admin"))
POST   /api/v1/tenants/switch          → switch_active_tenant (require_dashboard_auth)
GET    /api/v1/tenants/by-slug/{slug}  → get_tenant_by_slug (require_dashboard_auth, verify membership)
```

### `src/edictum_server/routes/auth.py` (modify)

1. **`GET /api/v1/auth/me`** — expand response:
   ```python
   class TenantInfo(BaseModel):
       id: str
       name: str
       slug: str
       role: str  # owner|admin|member|viewer

   class MeResponse(BaseModel):
       user_id: str
       email: str
       display_name: str | None
       active_tenant: TenantInfo
       tenants: list[TenantInfo]
   ```
   Query user's memberships, join with tenants to get name+slug.

2. **`POST /api/v1/auth/login`** — after verifying credentials:
   - Query user's accepted memberships
   - If no memberships: return error (user exists but has no team)
   - Set `active_tenant_id` to first membership's tenant_id
   - Set `role` in session from that membership
   - Include tenants list in login response

3. **`POST /api/v1/setup`** — update to:
   - Create tenant with `generate_slug(tenant_name)`
   - Create user (no `tenant_id`, no `is_admin`)
   - Create owner membership
   - Create session with `role="owner"`

### `src/edictum_server/main.py` (modify)

Update `_bootstrap_admin()`:
- Create tenant with slug
- Create user without `tenant_id` or `is_admin`
- Create `TenantMembership` with `role="owner"`, `accepted_at=now()`

### `src/edictum_server/schemas/tenants.py` (new, <50 lines)

Pydantic schemas for tenant endpoints:
```python
class CreateTenantRequest(BaseModel):
    name: str  # min 2, max 100

class UpdateTenantRequest(BaseModel):
    name: str | None = None
    slug: str | None = None  # validated: lowercase, hyphens only, max 48

class SwitchTenantRequest(BaseModel):
    tenant_id: str

class TenantInfoResponse(BaseModel):
    id: str
    name: str
    slug: str
    role: str
```

---

## Wiring Instructions

1. Register `tenants_router` in `main.py`: `app.include_router(tenants_router)`
2. The `MeResponse` schema replaces the current `getMe` return type — update imports.
3. Login flow must handle users with zero memberships (edge case: user stub created via invitation but invitation not yet accepted).
4. The `switch` endpoint updates the Redis session in-place — use `LocalAuthProvider`'s Redis client or pass it through `app.state.auth_provider`.

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/edictum_server/` passes
- [ ] All files under 200 lines, `from __future__ import annotations`

### API Tests (`tests/test_tenant_endpoints.py`)
- [ ] `GET /api/v1/tenants` returns list of user's teams with id, name, slug, role
- [ ] `POST /api/v1/tenants` creates new tenant + owner membership, returns slug
- [ ] `POST /api/v1/tenants` with duplicate name returns 409
- [ ] `PUT /api/v1/tenants/{id}` updates name, regenerates slug if name changed
- [ ] `PUT /api/v1/tenants/{id}` by non-admin returns 403
- [ ] `POST /api/v1/tenants/switch` with valid tenant_id updates session
- [ ] `POST /api/v1/tenants/switch` with unjoined tenant returns 403
- [ ] `POST /api/v1/tenants/switch` with pending (unaccepted) membership returns 403
- [ ] `GET /api/v1/tenants/by-slug/{slug}` returns tenant info for members
- [ ] `GET /api/v1/tenants/by-slug/{slug}` returns 404 for non-members
- [ ] `GET /api/v1/auth/me` returns expanded response with tenants array and active_tenant
- [ ] Login sets active_tenant_id in session from first membership
- [ ] Setup creates tenant with slug + owner membership (no is_admin)
- [ ] Bootstrap lifespan creates tenant with slug + owner membership
