# P1: Multi-Tenant Data Model, Migration, Membership Service

> **Scope:** Database schema changes, Alembic migration, membership service
> **Depends on:** Nothing (foundation prompt)
> **Blocks:** P2-P12 (everything depends on the data model)
> **Deliverable:** New `tenant_memberships` table, `slug` on tenants, `display_name` on users, `tenant_id` and `is_admin` removed from users, migration with backfill, membership service with CRUD operations

---

## Required Reading

Before writing any code, read these files:

1. `CLAUDE.md` — Non-negotiable principles, coding standards, DDD layer rules
2. `SPEC-MULTI-TENANT-UX.md` — Full spec, especially "Data Model Changes" and "Migration Strategy"
3. `CONVENTIONS.md` — Code conventions, `from __future__ import annotations` required
4. `src/edictum_server/db/models.py` — Current models (User, Tenant, all tenant-scoped tables)
5. `src/edictum_server/db/base.py` — Base mixins (UUIDPrimaryKeyMixin, TimestampMixin)
6. `src/edictum_server/auth/dependencies.py` — Current `DashboardAuthContext`, `AuthContext`
7. `src/edictum_server/auth/local.py` — `LocalAuthProvider`, session schema
8. `src/edictum_server/main.py` — `_bootstrap_admin()` lifespan function
9. `src/edictum_server/routes/auth.py` — Login, setup, getMe endpoints
10. `tests/conftest.py` — Test fixtures, TENANT_A_ID, TENANT_B_ID setup
11. `alembic/versions/` — Existing migrations (to understand naming conventions)

---

## Shared Modules

No new shared modules in this prompt — this is pure backend.

---

## Files to Create/Modify

### New Files

#### `src/edictum_server/db/models.py` (modify)

Add `TenantMembership` model:

```
TenantMembership
- id: UUID PK (UUIDPrimaryKeyMixin)
- tenant_id: FK -> tenants.id (indexed)
- user_id: FK -> users.id (indexed)
- role: String (owner|admin|member|viewer)
- invitation_token: String (nullable, unique, indexed) — secrets.token_urlsafe(32)
- invited_by: FK -> users.id (nullable)
- invited_at: DateTime (server_default=func.now())
- accepted_at: DateTime (nullable)
- token_expires_at: DateTime (nullable)
- created_at: TimestampMixin
- UniqueConstraint(tenant_id, user_id)
```

Modify `Tenant` model:
- Add `slug: Mapped[str]` (unique, indexed)
- Add `memberships` relationship to TenantMembership

Modify `User` model:
- Add `display_name: Mapped[str | None]`
- Remove `tenant_id` FK
- Remove `is_admin`
- Add `memberships` relationship to TenantMembership

#### `src/edictum_server/services/membership_service.py` (new, <200 lines)

Domain logic for memberships. Functions:

```python
async def get_membership(db, user_id, tenant_id) -> TenantMembership | None
async def get_user_memberships(db, user_id) -> list[TenantMembership]
async def get_tenant_members(db, tenant_id) -> list[TenantMembership]
async def create_membership(db, tenant_id, user_id, role, invited_by=None) -> TenantMembership
async def update_membership_role(db, membership_id, new_role) -> TenantMembership
async def delete_membership(db, membership_id) -> None
async def accept_invitation(db, membership_id) -> TenantMembership
async def get_membership_by_token(db, token) -> TenantMembership | None
```

#### `src/edictum_server/services/role_service.py` (new, <100 lines)

Role hierarchy and permission map:

```python
ROLE_HIERARCHY = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {"manage_team", "transfer_ownership", "manage_keys", "deploy_contracts", "approve", "view"},
    "admin": {"manage_team", "manage_keys", "deploy_contracts", "approve", "view"},
    "member": {"deploy_contracts", "approve", "view"},
    "viewer": {"view"},
}

def has_permission(role: str, permission: str) -> bool
def is_role_gte(role: str, min_role: str) -> bool
def generate_slug(name: str) -> str  # lowercase, hyphens, strip non-alnum, max 48 chars
```

#### `alembic/versions/006_add_tenant_memberships.py` (new)

Single migration that:
1. Adds `slug` column to `tenants` (unique, indexed). Backfill: lowercase name, replace spaces/underscores with hyphens, strip non-alphanumeric.
2. Adds `display_name` (nullable) to `users`.
3. Creates `tenant_memberships` table.
4. Backfills memberships from existing `users.tenant_id` + `users.is_admin`.
5. Drops `users.tenant_id` FK.
6. Drops `users.is_admin`.

**Important:** Use `op.execute()` for backfill SQL, not ORM (Alembic runs outside app context).

---

## Wiring Instructions

1. Update `models.py` imports in `__init__.py` or wherever models are collected for Alembic.
2. The migration must be idempotent-safe — check if columns exist before adding/dropping.
3. `generate_slug()` must handle edge cases: empty name, all-special-chars name, duplicate slugs (append `-2`, `-3` etc.).
4. No route changes in this prompt — P2 and P3 handle auth and endpoints.

---

## Verification Checklist

### Terminal
- [ ] `alembic upgrade head` runs without errors on a fresh DB
- [ ] `alembic downgrade -1` works (reverse migration)
- [ ] `alembic upgrade head` on a DB with existing users correctly backfills memberships
- [ ] Existing users with `is_admin=True` get `role="owner"` in their membership
- [ ] Existing users with `is_admin=False` get `role="member"` in their membership
- [ ] `User.tenant_id` and `User.is_admin` columns are gone after migration
- [ ] `Tenant.slug` is populated and unique after migration
- [ ] `ruff check src/edictum_server/` passes
- [ ] All new files have `from __future__ import annotations`
- [ ] All new files are under 200 lines

### Unit Tests
- [ ] Write tests in `tests/test_membership_service.py`:
  - Create membership, get by user+tenant, get by token
  - Role hierarchy checks (is_role_gte)
  - Permission checks (has_permission)
  - Slug generation (normal, spaces, special chars, duplicates)
  - Accept invitation (sets accepted_at)
  - Delete membership
- [ ] Existing tests may break — update `conftest.py`:
  - Test fixtures must create `TenantMembership` rows for test users
  - Remove references to `User.tenant_id` and `User.is_admin`
  - Auth context factories still work (tenant_id comes from fixtures, not User model)
