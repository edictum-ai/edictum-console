# Authentication

Edictum Console uses two authentication systems: one for humans (dashboard) and one for agents (API keys).

## Dashboard Authentication (Humans)

### Login Flow

```
1. User submits email + password to POST /api/v1/auth/login
2. Server verifies bcrypt hash
3. Server creates session in Redis with TTL
4. Server sets HttpOnly secure cookie
5. Subsequent requests authenticated via cookie
```

### Session Cookie

```http
Set-Cookie: edictum_session=abc123...; 
    HttpOnly; 
    Secure; 
    SameSite=Lax; 
    Path=/;
    Max-Age=86400
```

### Session Management

Sessions are stored in Redis:

```python
# Redis key structure
session:{session_id} = {
    "user_id": "uuid",
    "tenant_id": "uuid", 
    "created_at": "2026-03-01T00:00:00Z",
    "expires_at": "2026-03-02T00:00:00Z"
}
```

Configuration:

| Env Var | Default | Description |
|---------|---------|-------------|
| `EDICTUM_SESSION_TTL_HOURS` | 24 | Session lifetime |
| `EDICTUM_SECRET_KEY` | Required | Signs session tokens |

### Logout

```http
POST /api/v1/auth/logout
Cookie: edictum_session=abc123...
```

Deletes session from Redis and clears cookie.

### First-Run Setup

If no users exist, visit `/dashboard/setup` to create the admin account.

Or bootstrap via environment:

```bash
export EDICTUM_ADMIN_EMAIL=admin@example.com
export EDICTUM_ADMIN_PASSWORD="minimum-12-characters"
```

## API Authentication (Agents)

### API Key Format

```
edk_{env}_{random}
```

Example: `edk_production_K7mN9pQr2sT4vWxY`

### Key Components

- `edk_` — Prefix identifying this as an Edictum key
- `{env}` — Environment (dev, staging, production)
- `{random}` — 32+ character cryptographically random string

### Key Storage

Keys are stored as bcrypt hashes:

```python
class ApiKey(Base):
    id: UUID
    tenant_id: UUID
    prefix: str        # "edk_produ" — first 9 chars for lookup
    key_hash: str      # bcrypt hash of full key
    env: str           # "production"
    label: str | None  # Human-readable label
    created_at: datetime
    last_used_at: datetime | None
```

### Verification Flow

```
1. Agent sends: Authorization: Bearer edk_production_K7mN9pQr2sT4vWxY
2. Server extracts prefix: "edk_produ"
3. Server looks up key by prefix + tenant
4. Server verifies bcrypt hash of full key
5. Server updates last_used_at
6. Request authenticated with tenant context
```

### Creating Keys

Via dashboard or API:

```bash
POST /api/v1/keys
Cookie: edictum_session=...

{
    "env": "production",
    "label": "Agent-X production key"
}

Response:
{
    "id": "uuid",
    "key": "edk_production_K7mN9pQr2sT4vWxY",  // Shown ONCE
    "prefix": "edk_produ",
    "env": "production",
    "label": "Agent-X production key"
}
```

### Revoking Keys

```bash
DELETE /api/v1/keys/{key_id}
```

Revoked keys return 401 on next use.

## Security Controls

### Rate Limiting

Login endpoint is rate-limited:

- 7 attempts per minute per IP
- 429 response when exceeded
- Exponential backoff after repeated failures

### Password Requirements

- Minimum 12 characters
- bcrypt hashing with salt
- Constant-time comparison

### Session Security

- HttpOnly cookies (JavaScript cannot access)
- Secure flag in production (HTTPS only)
- SameSite=Lax (CSRF protection)
- Sliding expiration (extends on activity)
- Invalidated on password change

## Future: SSO

The auth system is designed for SSO providers:

```python
class AuthProvider(Protocol):
    async def verify_request(
        self, request: Request, db: AsyncSession
    ) -> AuthContext: ...
```

Planned providers:
- OIDC (Keycloak, Okta, Azure AD)
- GitHub OAuth
- Google Workspace
