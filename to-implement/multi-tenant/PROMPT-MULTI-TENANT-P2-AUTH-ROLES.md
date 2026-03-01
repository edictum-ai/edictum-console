# P2: Auth Layer — require_role Dependency, Session Schema, Endpoint Gating

> **Scope:** RBAC dependency, DashboardAuthContext changes, session schema update, gate all existing endpoints
> **Depends on:** P1 (data model, membership service, role service)
> **Blocks:** P4 (team management endpoints need role gates)
> **Deliverable:** `require_role(min_role)` FastAPI dependency, updated session schema, all existing endpoints gated by role

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Role Enforcement" section, role gates table
2. `src/edictum_server/auth/provider.py` — `DashboardAuthContext` dataclass (lives HERE, not dependencies.py), `AuthProvider` ABC with `create_session()` signature
3. `src/edictum_server/auth/dependencies.py` — `AuthContext`, `require_dashboard_auth`, `get_current_tenant`
4. `src/edictum_server/auth/local.py` — `LocalAuthProvider`, session creation/read, Redis session schema
4. `src/edictum_server/services/membership_service.py` — (from P1) `get_membership()`
5. `src/edictum_server/services/role_service.py` — (from P1) `ROLE_HIERARCHY`, `is_role_gte()`
6. All route files in `src/edictum_server/routes/` — to understand current auth dependencies on each endpoint

---

## Files to Modify

### `src/edictum_server/auth/provider.py` (modify)

1. Update `DashboardAuthContext` (this class lives in `provider.py`, NOT `dependencies.py`):
   ```python
   @dataclass(frozen=True, slots=True)
   class DashboardAuthContext:
       user_id: uuid.UUID
       tenant_id: uuid.UUID
       email: str
       role: str  # "owner" | "admin" | "member" | "viewer"
       # is_admin: REMOVED
   ```

2. Update `AuthProvider` ABC — `create_session()` signature:
   ```python
   # Change: is_admin: bool → role: str
   async def create_session(self, user_id, tenant_id, email, role: str) -> str:
   ```

### `src/edictum_server/auth/dependencies.py` (modify)

Add `require_role(min_role: str)` dependency factory:
   ```python
   def require_role(min_role: str) -> Callable:
       """Require at least this role in the active tenant. API keys bypass."""
       async def dependency(auth: AuthContext = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)) -> AuthContext:
           if auth.auth_type == "api_key":
               return auth
           membership = await get_membership(db, user_id=auth.user_id, tenant_id=auth.tenant_id)
           if not membership or not is_role_gte(membership.role, min_role):
               raise HTTPException(403, "Insufficient permissions")
           return auth
       return dependency
   ```

### `src/edictum_server/auth/local.py` (modify)

1. Update session JSON schema: `{user_id, tenant_id, email, role}` (was `{user_id, tenant_id, email, is_admin}`)
2. `create_session()`: accept `role` parameter instead of `is_admin` (must match updated ABC signature in `provider.py`)
3. `authenticate()`: read `role` from session, construct `DashboardAuthContext` with `role`

### Route Files — Apply Role Gates

Update every route file's auth dependencies per the spec table:

| File | Endpoint | Change |
|------|----------|--------|
| `routes/keys.py` | `GET /keys` | Keep `require_dashboard_auth` (viewer implicit) |
| `routes/keys.py` | `POST /keys` | Add `Depends(require_role("admin"))` |
| `routes/keys.py` | `DELETE /keys/{id}` | Add `Depends(require_role("admin"))` |
| `routes/bundles.py` | `POST /bundles` | Add `Depends(require_role("member"))` |
| `routes/bundles.py` | `POST /bundles/{name}/deploy` | Add `Depends(require_role("member"))` |
| `routes/approvals.py` | `PUT /approvals/{id}` | Add `Depends(require_role("member"))` |
| `routes/notifications.py` | `POST /channels` | Add `Depends(require_role("admin"))` |
| `routes/notifications.py` | `PUT /channels/{id}` | Add `Depends(require_role("admin"))` |
| `routes/notifications.py` | `DELETE /channels/{id}` | Add `Depends(require_role("admin"))` |
| `routes/notifications.py` | `POST /channels/{id}/test` | Add `Depends(require_role("admin"))` |
| `routes/evaluate.py` | `POST /bundles/evaluate` | Add `Depends(require_role("member"))` |
| `routes/settings.py` | `POST /rotate-signing-key` | Add `Depends(require_role("owner"))` |
| `routes/settings.py` | `DELETE /purge-events` | Add `Depends(require_role("owner"))` |

**Not listed but important:** All remaining POST/PUT/DELETE routes not in this table must also be reviewed. Any mutation endpoint using `require_dashboard_auth` or `get_current_tenant` should use `require_role()` instead. All GET endpoints are implicitly `viewer` (any authenticated member).

**Pattern:** Chain the role dependency after the auth dependency:
```python
@router.post("/keys")
async def create_key(
    data: CreateKeyRequest,
    auth: AuthContext = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
```

Note: `require_role` internally calls `get_current_tenant`, so you replace the existing auth dependency with `require_role(...)` — don't double-depend.

---

## Wiring Instructions

1. `require_role` uses `get_current_tenant` internally (handles both API key and dashboard auth). On API key auth, it short-circuits and returns immediately.
2. Existing `require_dashboard_auth` is still used for endpoints that need dashboard-only auth but no specific role (e.g., `getMe()`).
3. `get_current_tenant` remains unchanged — it resolves auth type but doesn't check roles.
4. The login flow (`routes/auth.py`) will be updated in P3 to create sessions with `role` instead of `is_admin`. For now, ensure `LocalAuthProvider.authenticate()` handles both old (`is_admin`) and new (`role`) session formats gracefully during the transition.

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/edictum_server/` passes
- [ ] `mypy src/edictum_server/` passes (no type errors from `role` vs `is_admin` change)
- [ ] All files under 200 lines
- [ ] `from __future__ import annotations` in all modified files

### Tests
- [ ] Write `tests/test_role_enforcement.py`:
  - Viewer can GET endpoints
  - Viewer gets 403 on POST /keys
  - Member can POST /bundles
  - Member gets 403 on POST /keys
  - Admin can POST /keys, DELETE /keys
  - Admin gets 403 on POST /rotate-signing-key
  - Owner can do everything
  - API key auth bypasses all role checks (any endpoint works)
- [ ] Update existing tests in `conftest.py`:
  - Auth context fixtures include `role` field
  - No references to `is_admin` in auth contexts
- [ ] Existing endpoint tests still pass (the default test auth should be `owner` role to avoid breaking existing tests)
