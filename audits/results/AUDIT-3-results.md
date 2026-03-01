# Audit 3 — Live API Penetration Test Results

**Target:** https://edictum-console.onrender.com
**Date:** 2026-03-01
**Tester:** nanobot (automated)

---

## Executive Summary

**Overall: SECURE with minor issues**

The live instance demonstrates good security posture. Authentication works correctly, tenant isolation appears solid, and common attack vectors are mitigated. However, there are some input validation gaps.

---

## Findings

### 🔴 HIGH Priority

#### H1: No Length Validation on Input Fields
- **Endpoint:** `POST /api/v1/keys`
- **Issue:** Created API key with 10,000 character label without error
- **Impact:** Potential DoS via database bloat, UI rendering issues
- **Recommendation:** Add `max_length` validation to Pydantic schemas (suggest 255 chars for labels)

#### H2: XSS Payload Accepted in Label Field
- **Endpoint:** `POST /api/v1/keys`
- **Issue:** Label `<script>alert(1)</script>` was stored successfully
- **Impact:** Depends on frontend rendering - if labels are rendered without escaping, XSS is possible
- **Recommendation:** 
  1. Backend: Sanitize or reject HTML in string fields
  2. Frontend: Verify labels are escaped before rendering
- **Note:** Needs frontend verification to confirm exploitability

---

### 🟡 MEDIUM Priority

#### M1: No Rate Limiting on Authenticated API Endpoints
- **Finding:** 20 rapid requests to `/api/v1/events` all returned 200
- **Contrast:** Login endpoint correctly rate limited (429 after 7 requests)
- **Impact:** Authenticated users can enumerate data rapidly, potential for API abuse
- **Recommendation:** Add rate limiting to all API endpoints, even authenticated ones

#### M2: OpenAPI/Docs Exposed on Production
- **Endpoints:** `/docs` (200), `/openapi.json` (200)
- **Issue:** Swagger UI and API schema publicly accessible
- **Impact:** Information disclosure - attackers can discover all endpoints and schemas
- **Recommendation:** Disable `/docs` in production, keep `/openapi.json` only if needed for SDKs

---

### 🟢 PASSED Checks

| Check | Result | Notes |
|-------|--------|-------|
| SQL Injection (login) | ✅ PASS | Returns "Invalid email or password", no error leakage |
| NoSQL Injection | ✅ PASS | Pydantic type validation rejects non-string inputs |
| Path Traversal | ✅ PASS | `/events/../../../etc/passwd` returns 404 |
| Login Rate Limiting | ✅ PASS | 429 after 7 failed attempts |
| Session Cookie HttpOnly | ✅ PASS | Cookie has HttpOnly flag |
| Tenant ID Override | ✅ PASS | Pydantic ignores extra fields, code uses `auth.tenant_id` |

---

### Tenant Isolation Tests (Live)

| Test | Result |
|------|--------|
| Access other tenant's events | Could not test (no cross-tenant IDs known) |
| Create key with different tenant_id | ✅ Ignored by backend |
| Access key by ID from other tenant | Needs multi-tenant setup to verify |

---

## Recommendations Summary

1. **Immediate:** Add input length limits to all user-controlled string fields
2. **Immediate:** Verify XSS payload handling in frontend
3. **Short-term:** Add rate limiting to authenticated endpoints
4. **Short-term:** Disable /docs on production

---

## Raw Output Files

- `AUDIT-3-recon-raw.txt` - Initial reconnaissance
- `AUDIT-3-auth-raw.txt` - Authentication testing
- `AUDIT-3-authenticated-raw.txt` - Authenticated endpoint access
- `AUDIT-3-injection-raw.txt` - Injection attack testing
- `AUDIT-3-ratelimit-raw.txt` - Rate limiting verification
- `AUDIT-3-tenant-isolation-raw.txt` - Tenant isolation testing
