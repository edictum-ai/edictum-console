# Security Fixes PR

## Branch
`security/audit-fixes-2026-03-01`

## Summary
Fixes 3 critical/high security vulnerabilities found in comprehensive audit (2026-03-01).

---

## 🔴 C1: SSRF via Webhook URL (CRITICAL)

### Problem
Authenticated users could create notification channels with URLs pointing to:
- AWS/GCP metadata endpoints (169.254.169.254)
- Internal services (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- Localhost (127.0.0.1)

### Attack Scenario
```bash
# Attacker creates webhook pointing to internal Redis
curl -X POST /api/v1/notifications/channels \
  -H "Cookie: edictum_session=..." \
  -d '{"name":"pwned","channel_type":"webhook","config":{"url":"http://192.168.1.50:6379/"}}'

# Test triggers request to internal service
curl -X POST /api/v1/notifications/channels/{id}/test
```

### Fix
Added `validate_url()` in `src/edictum_server/security/validators.py`:
- Resolves hostname to IP
- Blocks private networks, loopback, link-local
- Blocks non-HTTP schemes (file://, gopher://, etc.)

### Files Changed
- `src/edictum_server/security/validators.py` (new)
- `src/edictum_server/services/notification_service.py`

---

## 🔴 H1: No Input Length Validation (HIGH)

### Problem
String fields had no maximum length, allowing:
- DoS via memory exhaustion
- Database bloat
- UI overflow

### Attack Scenario
```bash
# Create API key with 1MB label
curl -X POST /api/v1/keys \
  -d '{"env":"dev","label":"AAA...1000000 chars...AAA"}'
```

### Fix
Added `max_length` constraints via Pydantic Field:
- `keys.py`: env (50), label (255)
- `notifications.py`: name (100)

### Files Changed
- `src/edictum_server/schemas/keys.py`
- `src/edictum_server/schemas/notifications.py`

---

## 🔴 H2: XSS Payload in Labels (HIGH)

### Problem
Backend accepted HTML in string fields:
```bash
curl -X POST /api/v1/keys \
  -d '{"env":"dev","label":"<script>alert(document.cookie)</script>"}'
```

If frontend doesn't escape properly, this could execute JS.

### Fix
Added `sanitize_html()` that rejects:
- HTML tags (`<script>`, `<div>`, `<iframe>`, etc.)
- XSS patterns (`javascript:`, `onclick=`, `onerror=`)

### Files Changed
- `src/edictum_server/security/validators.py` (new)
- `src/edictum_server/schemas/keys.py`
- `src/edictum_server/schemas/notifications.py`

---

## Testing

### New Tests
`tests/test_security_validators.py` - 38 tests:
- 16 URL validation tests (SSRF protection)
- 17 HTML sanitization tests (XSS protection)
- 5 length validation tests (DoS protection)

### Results
```
tests/test_security_validators.py: 38 passed, 2 skipped
Full suite: 319 passed (up from 281)
No new failures introduced
```

---

## Files in This PR

| File | Change |
|------|--------|
| `src/edictum_server/security/__init__.py` | New module |
| `src/edictum_server/security/validators.py` | Core validators |
| `src/edictum_server/services/notification_service.py` | SSRF fix |
| `src/edictum_server/schemas/keys.py` | XSS + length fix |
| `src/edictum_server/schemas/notifications.py` | XSS + length fix |
| `tests/test_security_validators.py` | Test coverage |

---

## Remaining Recommendations

### Should Fix Soon (Not Blockers)
- **M2**: Disable `/docs` in production
- **M3**: Add rate limiting to authenticated endpoints
- **M1**: Review broad exception handlers

### Frontend Verification Needed
- Verify React components escape labels in:
  - API key list
  - Notification channel list
  - Approval messages
