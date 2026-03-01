# P6: Adversarial Tests — S9-S13 + Update Existing S3 Tests

> **Scope:** Security boundary tests for all new multi-tenant features + update existing tenant isolation tests
> **Depends on:** P1-P5 (all backend features must be implemented)
> **Blocks:** Nothing (but must pass before frontend work ships)
> **Deliverable:** 5 new adversarial test files (S9-S13), updated conftest.py, updated existing S3 tests

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Security Considerations" section, attack surfaces S9-S13
2. `CLAUDE.md` — "Adversarial Testing Discipline" section, "switch hats" rule
3. `tests/test_adversarial/` — All existing adversarial test files (understand patterns)
4. `tests/conftest.py` — Fixtures, how two tenants are set up, auth context factories
5. `src/edictum_server/services/team_service.py` — (from P4) business rules
6. `src/edictum_server/services/invitation_service.py` — (from P5) token handling
7. `src/edictum_server/auth/dependencies.py` — (from P2) `require_role`

---

## Files to Create/Modify

### `tests/conftest.py` (modify)

Update fixtures for the new data model:

1. Create `TenantMembership` rows for test users (instead of `User.tenant_id`)
2. Add `slug` to test tenants
3. Auth context factories: replace `is_admin` with `role`
4. Add new fixtures:
   - `membership_a_owner` — owner membership for tenant A
   - `membership_a_member` — member membership for tenant A
   - `membership_a_viewer` — viewer membership for tenant A
   - `membership_b_owner` — owner membership for tenant B
   - `user_multi_tenant` — a user with memberships in both tenant A and B
   - `pending_invitation` — a membership with `accepted_at=None` and valid token
   - `expired_invitation` — a membership with expired `token_expires_at`

### `tests/test_adversarial/test_s9_invitation_bypass.py` (new)

**Attack: Invitation token brute force + replay**

Tests (minimum 8):
- [ ] Random 32-char tokens return 404 (not 200 with empty data)
- [ ] Short tokens (< 32 chars) return 404
- [ ] Empty token returns 404
- [ ] SQL injection in token parameter returns 404 (not 500)
- [ ] Expired token: GET returns details with `expired: true`, POST returns 410
- [ ] Accepted token: POST returns 409 (token already used)
- [ ] Replay: accept token, try again with same token, verify 404 or 409 (token cleared)
- [ ] Timing: response time for valid token ~= response time for invalid token (no timing oracle)

### `tests/test_adversarial/test_s10_role_escalation.py` (new)

**Attack: Member promotes self to admin, cross-tenant role changes**

Tests (minimum 10):
- [ ] Member calls PUT /team/members/{self} with role=admin → 403
- [ ] Member calls PUT /team/members/{other} with role=admin → 403
- [ ] Viewer calls PUT /team/members/{other} with role=member → 403
- [ ] Admin calls PUT /team/members/{other} with role=admin → 403 (only owner can promote to admin)
- [ ] Admin calls PUT /team/members/{other} with role=owner → 403
- [ ] Member calls POST /team/invite → 403
- [ ] Viewer calls DELETE /team/members/{other} → 403
- [ ] Cross-tenant: admin of tenant A calls PUT /team/members/{user-in-B} → 404 (user not in their tenant)
- [ ] Tampered request: change role to invalid value (e.g., "superadmin") → 422
- [ ] Direct API call bypassing UI: member sends raw PUT with role=owner → 403

### `tests/test_adversarial/test_s11_tenant_switch.py` (new)

**Attack: Switch to unauthorized tenant, access data from wrong tenant**

Tests (minimum 8):
- [ ] Switch to tenant user doesn't belong to → 403
- [ ] Switch to tenant where membership is pending (not accepted) → 403
- [ ] Switch to non-existent tenant_id → 404
- [ ] After switching: verify all GET endpoints return data scoped to new tenant (not old)
- [ ] Switch to revoked membership (deleted membership) → 403
- [ ] Switch with invalid tenant_id format → 422
- [ ] Slug resolution: access /tenants/by-slug/{other-tenant-slug} when not a member → 404
- [ ] After failed switch: verify session still points to original tenant (no partial update)

### `tests/test_adversarial/test_s12_owner_protection.py` (new)

**Attack: Remove owner, demote owner, create orphan tenant**

Tests (minimum 8):
- [ ] DELETE /team/members/{owner_id} → 403 (can't remove owner)
- [ ] Owner tries DELETE /team/members/{self} → 403 (can't remove self)
- [ ] PUT /team/members/{owner_id} with role=admin → 403 (can't demote owner)
- [ ] PUT /team/members/{owner_id} with role=viewer → 403
- [ ] Transfer ownership to non-member → 404
- [ ] Transfer ownership to pending (unaccepted) invitation → 422
- [ ] Transfer ownership by non-owner → 403
- [ ] After transfer: verify old owner is now admin, new owner is owner
- [ ] After transfer: old owner can no longer transfer ownership → 403

### `tests/test_adversarial/test_s13_invitation_leak.py` (new)

**Attack: Email enumeration via invitation flow**

Tests (minimum 5):
- [ ] Invite existing user (in another tenant): response is identical to inviting new user (no "user already exists" hint)
- [ ] Invite non-existent email: response is identical shape and timing
- [ ] Invite email already in this tenant: returns 409 (acceptable — they're in the team, admin knows this)
- [ ] GET /invitations/{token} does NOT reveal invitee's other team memberships
- [ ] Error messages don't include user IDs or internal details

### Update `tests/test_adversarial/test_s3_tenant_isolation.py` (modify)

Update existing tests to work with membership-based tenant resolution:
- Replace `User.tenant_id` references with membership lookups
- Verify all existing cross-tenant tests still pass
- Add: user with memberships in both tenants can only see data for their active tenant (not the other)

---

## Wiring Instructions

1. All adversarial tests must be marked with `@pytest.mark.security`
2. Use the same test client pattern as existing adversarial tests
3. Each test file should be self-contained — create its own fixtures or use shared conftest fixtures
4. For timing tests (S9), use `time.perf_counter()` and verify response times are within 2x of each other (approximate — not a hard security guarantee, but flags obvious timing oracles)

---

## Verification Checklist

- [ ] `pytest tests/test_adversarial/ -v` — all pass
- [ ] `pytest tests/test_adversarial/ -m security -v` — all are collected (marker applied)
- [ ] At least 39 new adversarial tests across the 5 files
- [ ] Existing S3 tests updated and passing
- [ ] `conftest.py` fixtures work with both old and new tests
- [ ] `ruff check tests/` passes
- [ ] No test uses `time.sleep()` (no flaky waits)
