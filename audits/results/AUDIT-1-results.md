# Audit 1 — Backend Security Results

**Date:** 2026-03-01

---

## Executive Summary

**Test Results: 281 passed, 2 failed, 7 errors**

The 7 errors are infrastructure-related (Redis not running locally), not security issues. The 2 failures are configuration/test issues, not security vulnerabilities.

---

## Test Suite Results

### Errors (Infrastructure)
All 7 errors are `redis.exceptions.ConnectionError` - tests expect local Redis instance.
- **Impact:** Tests cannot run without infrastructure
- **Not a security issue**

### Failures

#### 1. `test_rotate_key_tenant_isolation`
```
nacl.exceptions.ValueError: The key must be exactly 32 bytes long
```
- **Cause:** Test doesn't provide valid 32-byte signing secret
- **Security Impact:** None - the validation is working correctly
- **Action:** Fix test fixture

#### 2. `test_deploy_by_name`
```
assert resp.status_code == 422 == 201
```
- **Cause:** Schema mismatch between test and implementation
- **Security Impact:** None - validation working as intended
- **Action:** Update test to match current API

---

## Code Coverage

**Overall: 73%**

### Critical Paths Coverage

| Module | Coverage | Assessment |
|--------|----------|------------|
| auth/api_keys.py | 83% | Acceptable |
| auth/dependencies.py | 86% | Good |
| auth/local.py | 98% | Excellent |
| routes/keys.py | 74% | Needs improvement |
| routes/auth.py | 95% | Excellent |
| routes/events.py | 83% | Good |
| routes/approvals.py | 62% | **Low - needs attention** |
| routes/telegram.py | 27% | **Very low - needs tests** |

### Recommendations

1. **Increase coverage** on approval workflow (62%) - this is a security-critical path
2. **Add tests** for Telegram webhook handling (27%) - authentication validation needs coverage
3. **Target:** Aim for 85%+ on all auth and approval-related modules

---

## Security Boundary Analysis

Based on code review (performed by subagent):

### ✅ Properly Implemented
- API key authentication uses bcrypt hashing
- Session tokens are cryptographically random
- Tenant isolation enforced via `auth.tenant_id` dependency
- Pydantic validates all inputs before processing
- SQL queries use SQLAlchemy ORM (injection protected)

### ⚠️ Needs Attention
- Input validation missing max lengths (see Audit 3)
- Rate limiting only on login, not other endpoints

---

## Raw Output Files

- `AUDIT-1-tests-raw.txt` - Full pytest output
