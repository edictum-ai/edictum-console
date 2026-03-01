# Edictum Console — Comprehensive Security Audit (Final)

**Date:** 2026-03-01 23:00 UTC
**Auditor:** nanobot (deep code analysis + live testing)
**Target:** edictum-console pre-release
**Live Instance:** https://edictum-console.onrender.com

---

## Executive Summary

**Overall: 🟡 NEEDS FIXES BEFORE RELEASE**

The core architecture is solid, but there are **3 critical security issues** that must be addressed:

| Priority | ID | Issue | Exploitability |
|----------|-----|-------|----------------|
| 🔴 CRITICAL | C1 | **SSRF via webhook URL** | Authenticated user can probe internal network |
| 🔴 HIGH | H1 | No input length validation | DoS, DB bloat, UI overflow |
| 🔴 HIGH | H2 | XSS payload stored in labels | Needs frontend verification |

---

## 🔴 CRITICAL: C1 - Server-Side Request Forgery (SSRF)

### Location
- `src/edictum_server/services/channel_test_helpers.py:78-85`
- `src/edictum_server/services/notification_service.py:162`

### Vulnerability
```python
# channel_test_helpers.py:78-85
if channel_type == "webhook":
    resp = await client.post(
        config["url"],  # ← NO VALIDATION
        json={"event": "test", ...}
    )

if channel_type == "slack":
    resp = await client.post(
        config["webhook_url"],  # ← NO VALIDATION
        json={"text": ...}
    )
```

### Attack Vector
1. Attacker authenticates (needs valid account)
2. Creates notification channel with:
   ```json
   {
     "name": "pwned",
     "channel_type": "webhook",
     "config": {"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}
   }
   ```
3. Calls `POST /api/v1/notifications/channels/{id}/test`
4. Server makes request to AWS metadata service
5. Response leaks in error message or timing

### Impact
- Access to cloud metadata (AWS IAM credentials, GCP metadata)
- Port scanning internal network
- Access to internal services (Redis, databases, admin panels)

### Fix
```python
# Add URL validation in notification_service.py
import ipaddress
from urllib.parse import urlparse

BLOCKED_SCHEMES = {"file", "gopher", "dict", "ftp", "ldap"}
BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # AWS metadata
    ipaddress.ip_network("::1/128"),
]

def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError(f"Scheme not allowed: {parsed.scheme}")
    
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: no hostname")
    
    # Resolve DNS first
    import socket
    try:
        ip = socket.gethostbyname(hostname)
    except socket.gaierror as e:
        raise ValueError(f"Cannot resolve hostname: {e}")
    
    ip_addr = ipaddress.ip_address(ip)
    for network in BLOCKED_NETWORKS:
        if ip_addr in network:
            raise ValueError(f"URL resolves to blocked network: {network}")
    
    return url
```

---

## 🔴 HIGH: H1 - No Input Length Validation

### Affected Fields (All User Input Strings Without max_length)

| Schema | Field | Current | Risk |
|--------|-------|---------|------|
| `schemas/keys.py` | `label` | No limit | DoS, DB bloat |
| `schemas/bundles.py` | `yaml_content` | No limit | Memory exhaustion |
| `schemas/events.py` | `agent_id`, `tool_name`, etc. | No limit | DB bloat |
| `schemas/approvals.py` | `message`, `agent_id`, etc. | No limit | DB bloat |
| `schemas/sessions.py` | `value` | No limit | Redis memory |
| `schemas/evaluate.py` | `yaml_content`, `tool_name` | No limit | Memory in parser |
| `schemas/notifications.py` | `config` (dict) | No nested validation | Unbounded JSON |

### What HAS Validation (Good)
- `notifications.py`: `name` has `min_length=1, max_length=100`
- `approvals.py`: `timeout` has `ge=1, le=86400`
- `events.py`: `events` list has `min_length=1`

### Fix
Add to all request schemas:
```python
from pydantic import Field

class CreateKeyRequest(BaseModel):
    env: str = Field(..., max_length=50)
    label: str | None = Field(None, max_length=255)
    
    @field_validator('label')
    @classmethod
    def sanitize_label(cls, v):
        if v and ('<' in v or '>' in v or 'script' in v.lower()):
            raise ValueError('Invalid characters in label')
        return v
```

---

## 🔴 HIGH: H2 - Stored XSS in Label Field

### Finding
Backend accepts `<script>alert(1)</script>` in label field.
Frontend may or may not escape this - needs verification.

### Test Case
```bash
curl -X POST "https://edictum-console.onrender.com/api/v1/keys" \
  -H "Cookie: edictum_session=..." \
  -H "Content-Type: application/json" \
  -d '{"env":"dev","label":"<script>alert(1)</script>"}'
```

### Backend Fix
Reject HTML in string fields:
```python
import re

HTML_PATTERN = re.compile(r'<[^>]+>')

@field_validator('label')
@classmethod  
def no_html(cls, v):
    if v and HTML_PATTERN.search(v):
        raise ValueError('HTML not allowed')
    return v
```

### Frontend Check Needed
Verify React components don't use `dangerouslySetInnerHTML` for user content.

---

## 🟢 PASSED: Security Controls Verified

| Control | Status | Evidence |
|---------|--------|----------|
| SQL Injection | ✅ PASS | Uses SQLAlchemy ORM, no raw SQL |
| Path Traversal | ✅ PASS | `resolve()` + `startswith()` check in main.py:267 |
| NoSQL Injection | ✅ PASS | Pydantic type validation |
| YAML RCE | ✅ PASS | Uses `yaml.safe_load()` (not `yaml.load`) |
| Secret Logging | ✅ PASS | No secrets in log statements |
| Eval/Exec | ✅ PASS | No dynamic code execution |
| Pickle/Marshal | ✅ PASS | No unsafe deserialization |
| Auth Bypass | ✅ PASS | All routes use `require_dashboard_auth` or `get_current_tenant` |
| Tenant Isolation | ✅ PASS | All queries filter by `tenant_id` |
| Session Security | ✅ PASS | HttpOnly cookies, token rotation |
| Login Rate Limit | ✅ PASS | 429 after 7 failed attempts |
| CSRF | ✅ PASS | SameSite cookies |

---

## 🟡 MEDIUM: Code Quality Issues

### M1: Broad Exception Handlers (20 instances)
```python
# Examples found:
except Exception:  # Silently swallows errors
except Exception as exc:  # Better but still broad
```
**Risk:** Could hide security-relevant errors
**Fix:** Catch specific exceptions, log broadly but handle narrowly

### M2: OpenAPI Docs Exposed
```
GET /docs → 200 (Swagger UI)
GET /openapi.json → 200 (Full API schema)
```
**Fix:** `docs_url=None` in production FastAPI config

### M3: No Rate Limiting on Authenticated Endpoints
Only login is rate-limited. All `/api/v1/*` endpoints allow unlimited requests.
**Fix:** Add per-tenant rate limiting

---

## Test Coverage Summary

```
Tests: 281 passed, 2 failed, 7 errors
Coverage: 73%

High Coverage Areas:
- auth/api_keys.py: 100%
- auth/local.py: 96%
- services/event_service.py: 89%

Low Coverage Areas:
- routes/telegram.py: 27%  ⚠️
- notifications/discord.py: 34%
- routes/slack.py: 41%
```

---

## Dependency Security

| Tool | Result |
|------|--------|
| pip-audit | ✅ No runtime CVEs (pip vulnerabilities are build-only) |
| npm audit | ✅ Clean |
| Licenses | ✅ All permissive (MIT, Apache, BSD) |

---

## Attack Surface Summary

### Public Endpoints (No Auth Required)
- `GET /api/v1/health` - Public health check
- `POST /api/v1/setup` - Bootstrap (only works once)
- `POST /api/v1/auth/login` - Login
- `GET /docs`, `/openapi.json` - API docs (info disclosure)
- `POST /api/v1/telegram/webhook/{id}` - Webhook callback
- `POST /api/v1/discord/interactions` - Discord bot
- `POST /api/v1/slack/interactions` - Slack bot

### Authenticated Endpoints (Require Session or API Key)
All other `/api/v1/*` endpoints require authentication.

### Admin-Only Actions
- `POST /api/v1/settings/rotate-signing-key`
- `DELETE /api/v1/settings/purge-events`

---

## Immediate Action Items

### Must Fix Before Release
1. **C1 (SSRF)**: Add URL validation to webhook channels
2. **H1 (Input)**: Add max_length to all string input fields
3. **H2 (XSS)**: Sanitize HTML in labels OR verify frontend escaping

### Should Fix Soon
4. **M2**: Disable `/docs` in production
5. **M3**: Add rate limiting to authenticated endpoints
6. **M1**: Review exception handlers for security impact

---

## Files Generated

| File | Description |
|------|-------------|
| `AUDIT-COMPREHENSIVE-FINAL.md` | This report |
| `AUDIT-DEEP-CODE.txt` | Full code analysis (600+ lines) |
| `AUDIT-1-results.md` | Backend security |
| `AUDIT-2-results.md` | Tenant isolation |
| `AUDIT-3-*.txt` | Live pentest attempts |
| `AUDIT-4-results.md` | Dependencies |
| `AUDIT-5-results.md` | Frontend |
| `AUDIT-6-results.md` | Code quality |
| `AUDIT-7-results.md` | Infrastructure |
| `pip-licenses.json` | License inventory |

---

## Conclusion

Edictum Console has a **sound security architecture** with proper authentication, authorization, and tenant isolation. However, the **SSRF vulnerability (C1)** is a ship-blocker for production use, especially if deployed on cloud infrastructure. The input validation issues (H1, H2) are standard web security hygiene.

**Recommendation:** Fix C1, H1, H2 before public release. The remaining issues can be addressed in subsequent releases.

---

*Audit completed: 2026-03-01 23:00 UTC*
*Total analysis time: ~15 minutes of automated scanning*
