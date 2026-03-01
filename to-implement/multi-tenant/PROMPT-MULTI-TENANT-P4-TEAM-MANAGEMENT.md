# P4: Team Management Endpoints — Invite, List, Remove, Role Changes

> **Scope:** Team management API endpoints (CRUD members, invitations, ownership transfer)
> **Depends on:** P1 (data model), P2 (role enforcement), P3 (tenant service)
> **Blocks:** P10 (frontend team management tab)
> **Deliverable:** Full team management API: list members, invite by email, remove member, change role, transfer ownership

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "API Changes > Team Management" section, "Security Considerations" S10, S12
2. `src/edictum_server/services/membership_service.py` — (from P1) existing CRUD functions
3. `src/edictum_server/services/role_service.py` — (from P1) `ROLE_HIERARCHY`, `is_role_gte()`, `has_permission()`
4. `src/edictum_server/auth/dependencies.py` — (from P2) `require_role()`
5. `src/edictum_server/routes/approvals.py` — Pattern reference for thin route handlers

---

## Files to Create

### `src/edictum_server/services/team_service.py` (new, <200 lines)

Business logic for team operations. All functions receive typed params, return typed results. No HTTP imports.

```python
async def list_members(db, tenant_id) -> list[MemberInfo]
    # Returns all memberships for tenant, joined with user for email/display_name
    # Includes both accepted and pending members

async def invite_member(db, tenant_id, email, role, invited_by_user_id) -> InvitationResult
    # If user doesn't exist: create User stub (password_hash=None, display_name=None)
    # If user exists and already in this tenant: raise ConflictError
    # Create membership with accepted_at=None, generate invitation_token, set token_expires_at (7 days)
    # Return token + constructed invitation URL
    # IMPORTANT: Don't reveal whether user already exists (S13)

async def remove_member(db, tenant_id, target_user_id, requester_user_id) -> None
    # Can't remove owner (S12)
    # Can't remove yourself (use "leave" in future)
    # Requester must be admin+ (enforced at route level, but double-check)
    # Delete the membership row

async def change_role(db, tenant_id, target_user_id, new_role, requester_user_id) -> MemberInfo
    # Owner can promote to admin, admin can set member/viewer
    # Admin cannot promote to admin or owner (S10)
    # Cannot change owner's role (S12)
    # Cannot change own role

async def transfer_ownership(db, tenant_id, new_owner_user_id, current_owner_user_id) -> None
    # Requester must be current owner
    # New owner must be an existing accepted member of this tenant
    # Set new_owner.role = "owner", set current_owner.role = "admin"
    # Atomic operation (single transaction)
```

### `src/edictum_server/schemas/team.py` (new, <80 lines)

```python
class MemberInfo(BaseModel):
    user_id: str
    email: str
    display_name: str | None
    role: str
    accepted_at: str | None
    invited_at: str

class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str  # validate: must be admin, member, or viewer (not owner)

class InvitationResult(BaseModel):
    invitation_token: str
    invitation_url: str

class ChangeRoleRequest(BaseModel):
    role: str  # validate: must be admin, member, or viewer

class TransferOwnershipRequest(BaseModel):
    user_id: str  # UUID of new owner
```

### `src/edictum_server/routes/team.py` (new, <120 lines)

Thin handlers. Router prefix: `/api/v1/team`

```
GET    /                    → list_members       auth: require_dashboard_auth (viewer implicit)
POST   /invite              → invite_member       auth: require_role("admin")
DELETE /members/{user_id}   → remove_member       auth: require_role("admin")
PUT    /members/{user_id}   → change_role         auth: require_role("admin")
POST   /transfer-ownership  → transfer_ownership  auth: require_role("owner")
```

Each handler: validate input -> call service -> commit -> return response.

---

## Wiring Instructions

1. Register `team_router` in `main.py`: `app.include_router(team_router)`
2. The `invitation_url` in `InvitationResult` is constructed as: `{EDICTUM_BASE_URL}/dashboard/accept-invite/{token}`. Read `EDICTUM_BASE_URL` from settings/config.
3. Service layer raises domain exceptions (`ConflictError`, `ForbiddenError`, `NotFoundError`). Routes catch and map to HTTP status codes.
4. All operations are tenant-scoped: `auth.tenant_id` passed to every service call.

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/edictum_server/` passes
- [ ] All files under 200 lines

### API Tests (`tests/test_team_endpoints.py`)

**Happy path:**
- [ ] `GET /team` returns members with email, role, display_name, accepted_at
- [ ] `GET /team` includes pending invitations (accepted_at=null)
- [ ] `POST /team/invite` with new email creates user stub + pending membership + returns token
- [ ] `POST /team/invite` with existing user (in another tenant) creates pending membership
- [ ] `POST /team/invite` response does not reveal whether user already exists (S13)
- [ ] `DELETE /team/members/{id}` removes non-admin member
- [ ] `PUT /team/members/{id}` changes member to viewer
- [ ] `PUT /team/members/{id}` owner promotes member to admin
- [ ] `POST /team/transfer-ownership` transfers owner role, demotes old owner to admin

**Error cases:**
- [ ] `POST /team/invite` with email already in this tenant returns 409
- [ ] `POST /team/invite` with role="owner" returns 422
- [ ] `DELETE /team/members/{owner_id}` returns 403 (can't remove owner, S12)
- [ ] `PUT /team/members/{id}` admin tries to promote to admin returns 403 (S10)
- [ ] `PUT /team/members/{id}` admin tries to promote to owner returns 403 (S10)
- [ ] `PUT /team/members/{id}` member changes own role returns 403
- [ ] `PUT /team/members/{owner_id}` change owner's role returns 403 (S12)
- [ ] `POST /team/transfer-ownership` by non-owner returns 403
- [ ] `POST /team/transfer-ownership` to non-member returns 404
- [ ] `POST /team/transfer-ownership` to pending (unaccepted) member returns 422
- [ ] All endpoints return 403 for viewer role
- [ ] All mutating endpoints return 403 for member role
