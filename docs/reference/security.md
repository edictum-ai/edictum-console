# Security Reference

Security architecture and best practices for Edictum Console.

## Security Model

Edictum Console is a security product. The server itself must be hardened.

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Untrusted                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Internet   │  │    Agent     │  │   Webhooks   │      │
│  │   (Humans)   │  │  (API Keys)  │  │  (External)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     Trust Boundary                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Edictum Console                          │   │
│  │  • Input validation (Pydantic)                        │   │
│  │  • Authentication (session + API keys)                │   │
│  │  • Authorization (tenant isolation)                   │   │
│  │  • SSRF protection                                    │   │
│  │  • XSS prevention                                     │   │
│  │  • SQL injection impossible (ORM)                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                   │
         ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │     Redis       │
│  (Tenant data)  │  │   (Sessions)    │
└─────────────────┘  └─────────────────┘
```

## Authentication Security

### Dashboard Authentication

| Control | Implementation |
|---------|----------------|
| Password hashing | bcrypt with salt |
| Password policy | Minimum 12 characters |
| Session storage | Redis (not JWT in cookie) |
| Session cookie | HttpOnly, Secure, SameSite=Lax |
| Session TTL | Configurable (default 24h) |
| Login rate limiting | 7 attempts/minute/IP |
| Constant-time comparison | bcrypt.verify() |

### API Authentication

| Control | Implementation |
|---------|----------------|
| Key format | `edk_{env}_{random}` |
| Key storage | bcrypt hash |
| Key lookup | Prefix-indexed (first 9 chars) |
| Key revocation | Immediate (checked every request) |
| Last used tracking | Updated on each request |

## Input Validation

### Pydantic Schemas

All input is validated via Pydantic:

```python
class CreateKeyRequest(BaseModel):
    env: str = Field(..., max_length=50)
    label: str | None = Field(None, max_length=255)
```

### XSS Prevention

String fields reject HTML:

```python
@field_validator('label')
def validate_label(cls, v):
    if v and ('<' in v or 'script' in v.lower()):
        raise ValueError('Invalid characters')
    return v
```

### SSRF Protection

Webhook URLs are validated:

```python
def validate_url(url: str) -> str:
    # Block private networks
    # Block cloud metadata (169.254.x.x)
    # Block non-HTTP schemes
```

Blocked networks:
- `10.0.0.0/8` (Private Class A)
- `172.16.0.0/12` (Private Class B)
- `192.168.0.0/16` (Private Class C)
- `127.0.0.0/8` (Loopback)
- `169.254.0.0/16` (Link-local / Cloud metadata)

## SQL Injection Prevention

Uses SQLAlchemy ORM with parameterized queries:

```python
# Safe - parameterized
await db.execute(
    select(Event).where(Event.tenant_id == tenant_id)
)

# No raw SQL in codebase
```

Verified: No `text()`, `execute(sql)`, or raw SQL found.

## Path Traversal Prevention

File paths are validated:

```python
file_path = (_STATIC_DIR / full_path).resolve()
if str(file_path).startswith(str(_STATIC_DIR.resolve())):
    # Safe - within static directory
```

## Dependency Security

| Tool | Status |
|------|--------|
| pip-audit | No runtime CVEs |
| npm audit | Clean |
| Licenses | All permissive |

## Audit Trail

### What's Logged

- All authentication events (login, logout, failed login)
- All contract deployments
- All approval decisions
- All API key operations

### Event Structure

```json
{
    "agent_id": "agent-1",
    "tool_name": "delete_file",
    "args": {"path": "/data/file.txt"},
    "action": "denied",
    "reason": "Contract: protect-production",
    "created_at": "2026-03-01T00:00:00Z"
}
```

### Retention

Events retained for configurable period (default: 90 days).

## Secrets Management

| Secret | Storage |
|--------|---------|
| `EDICTUM_SECRET_KEY` | Environment variable |
| API key hashes | bcrypt in PostgreSQL |
| User passwords | bcrypt in PostgreSQL |
| Signing keys | Encrypted in PostgreSQL |
| Session data | Redis (TTL enforced) |

## Infrastructure Security

### Docker

- Multi-stage build (smaller attack surface)
- Non-root user (not running as root)
- No secrets in image

### Network

- HTTPS required in production
- CORS strictly configured
- Rate limiting on auth endpoints

### Database

- TLS connections (recommended)
- Connection pooling
- Time-based partitioning

## Security Checklist

### Before Deployment

- [ ] Set strong `EDICTUM_SECRET_KEY` (256-bit)
- [ ] Set strong admin password (12+ chars)
- [ ] Configure HTTPS
- [ ] Set correct `EDICTUM_BASE_URL`
- [ ] Restrict CORS origins
- [ ] Use managed PostgreSQL with TLS
- [ ] Use managed Redis with TLS

### After Deployment

- [ ] Rotate default admin password
- [ ] Review active API keys
- [ ] Configure notification channels
- [ ] Set up monitoring and alerts
- [ ] Configure backups
- [ ] Review audit logs regularly

## Reporting Security Issues

Email: security@edictum.dev

We follow responsible disclosure. Security issues are addressed promptly.

## Security Audit History

| Date | Auditor | Findings | Status |
|------|---------|----------|--------|
| 2026-03-01 | nanobot (automated) | 3 issues (C1, H1, H2) | Fixed |

### 2026-03-01 Findings

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| C1 | CRITICAL | SSRF via webhook URL | Fixed |
| H1 | HIGH | No input length validation | Fixed |
| H2 | HIGH | XSS payload in labels | Fixed |
