# P5: Invitation Acceptance Endpoints — Token Validation, Password Set, Accept Flow

> **Scope:** Public endpoints for invitation acceptance (no auth required)
> **Depends on:** P1 (data model), P4 (invitation creation in team service)
> **Blocks:** P11 (frontend invitation acceptance page)
> **Deliverable:** GET invitation details + POST accept invitation endpoints, token validation, password setting for new users

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Invitation Acceptance" endpoints, Security S9 (token brute force), S13 (info disclosure)
2. `src/edictum_server/services/membership_service.py` — `get_membership_by_token()`, `accept_invitation()`
3. `src/edictum_server/services/team_service.py` — (from P4) `invite_member()` creates the token
4. `src/edictum_server/auth/local.py` — Password hashing (`bcrypt`) for new user password set
5. `src/edictum_server/routes/auth.py` — Setup endpoint pattern (creates user + sets password, no auth)

---

## Files to Create/Modify

### `src/edictum_server/services/invitation_service.py` (new, <120 lines)

```python
async def get_invitation_details(db, token) -> InvitationDetails | None
    # Look up membership by invitation_token
    # If not found: return None (don't reveal existence)
    # Check token_expires_at vs now → expired flag
    # Check accepted_at → already_accepted flag
    # Join with Tenant for name, User for email
    # Join with inviter User for inviter email
    # Return InvitationDetails

async def accept_invitation(db, token, password=None, display_name=None) -> AcceptResult
    # Look up membership by token
    # If not found: raise NotFoundError
    # If expired: raise ExpiredError
    # If already accepted: raise ConflictError
    # If user has no password_hash and no password provided: raise ValidationError
    # If user has no password_hash: hash password, set on user
    # If display_name provided: set user.display_name
    # Set membership.accepted_at = now()
    # Clear invitation_token (prevent replay)
    # Return AcceptResult with tenant slug for redirect
```

### `src/edictum_server/schemas/invitations.py` (new, <50 lines)

```python
class InvitationDetailsResponse(BaseModel):
    tenant_name: str
    inviter_email: str
    role: str
    email: str  # invitee's email
    expired: bool
    already_accepted: bool

class AcceptInvitationRequest(BaseModel):
    password: str | None = None  # Required for new users (no existing password)
    display_name: str | None = None  # Optional, set on user if provided

class AcceptResult(BaseModel):
    message: str
    tenant_slug: str
    tenant_name: str
```

### `src/edictum_server/routes/invitations.py` (new, <80 lines)

Router prefix: `/api/v1/invitations`. **No auth dependencies** — these are public endpoints.

```
GET    /{token}         → get_invitation_details
POST   /{token}/accept  → accept_invitation
```

**Rate limiting:** Apply rate limiting on both endpoints to prevent token brute force (S9). Use the same rate limiting pattern as auth endpoints if one exists, or add simple IP-based limiting.

---

## Wiring Instructions

1. Register `invitations_router` in `main.py`: `app.include_router(invitations_router)`
2. These endpoints have NO auth dependencies — they must be accessible to unauthenticated users.
3. After accepting, the `invitation_token` on the membership row must be set to `None` to prevent replay attacks.
4. Password hashing: use the same bcrypt approach as `LocalAuthProvider` (import from auth module or shared utility).
5. The `GET` endpoint must return 200 with `expired: true` for expired tokens (don't 404 — that reveals token existence to brute-force attackers). Actually, for invalid/non-existent tokens, return 404. For expired tokens, return 200 with `expired: true`. The distinction is: a valid but expired token is a different UX than a completely invalid token.

---

## Verification Checklist

### Terminal
- [ ] `ruff check src/edictum_server/` passes
- [ ] All files under 200 lines

### API Tests (`tests/test_invitation_endpoints.py`)

**Happy path:**
- [ ] `GET /invitations/{token}` returns invitation details (tenant name, inviter, role, email)
- [ ] `POST /invitations/{token}/accept` with password for new user sets password + accepts
- [ ] `POST /invitations/{token}/accept` for existing user (no password needed) accepts
- [ ] After acceptance, `accepted_at` is set on membership
- [ ] After acceptance, `invitation_token` is cleared (null)
- [ ] Response includes `tenant_slug` for frontend redirect

**Error cases:**
- [ ] `GET /invitations/{invalid-token}` returns 404
- [ ] `GET /invitations/{expired-token}` returns 200 with `expired: true`
- [ ] `POST /invitations/{expired-token}/accept` returns 410 Gone
- [ ] `POST /invitations/{already-accepted-token}` returns 409 Conflict
- [ ] `POST /invitations/{token}/accept` for new user WITHOUT password returns 422
- [ ] `POST /invitations/{token}/accept` for new user WITH empty password returns 422
- [ ] Token replay: accepting same token twice returns 409 (token cleared after first accept)
- [ ] Brute force: random tokens return 404 (no timing leak between valid/invalid)
