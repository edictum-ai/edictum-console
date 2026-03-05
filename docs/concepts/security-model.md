# Security Model

Edictum Console is a security product. The security model is not a feature — it is the foundation. Every design decision assumes an adversarial environment: forged cookies, stolen API keys, cross-tenant probes, tampered bundles, brute-force login attempts. The console defends against all of them.

## When to use this

Read this page when you need to understand how the console authenticates users and agents, isolates tenants, signs bundles, and protects secrets. This is the reference for security audits, penetration testing scope, and compliance reviews. If you are deploying the console, start with the [README](../../README.md) for environment variables and Docker setup.

## Authentication

The console supports two authentication methods: cookies (for humans using the dashboard) and API keys (for agents using the SDK).

### Local Auth Provider

The default authentication provider. No external dependencies.

| Property | Value |
|----------|-------|
| Password storage | bcrypt (work factor 12) |
| Minimum password length | 12 characters |
| Session storage | Redis with configurable TTL (default 24 hours) |
| Cookie type | HttpOnly, SameSite=Lax |
| Secure flag | Auto-set when `EDICTUM_BASE_URL` uses HTTPS |
| User enumeration | Prevented — same error for wrong email and wrong password |

The `AuthProvider` protocol allows future providers (OIDC is on the roadmap). The protocol is 20 lines — the cost of the abstraction is near-zero.

### API Keys

Agents authenticate with API keys. Keys are scoped to an environment.

```
edk_production_CZxKQvN3mHz7qR8bW4xYp9dF
│   │           │
│   │           └─ Random component (cryptographically secure)
│   └─ Environment scope
└─ Prefix (Edictum Key)
```

| Property | Value |
|----------|-------|
| Format | `edk_{env}_{random}` |
| Storage | bcrypt hashed (with SHA-256 prehash) |
| Lookup | Prefix-indexed for fast resolution |
| Display | Full key shown once at creation, never again |
| Revocation | Immediate — revoked key rejected on next request |
| API response | Masked: `edk_••••mHz` |

### Dual Auth Resolution

Many endpoints accept both cookies and API keys. The `get_current_tenant` FastAPI dependency resolves either:

```
Request arrives
    |
    ├── Has session cookie? → Validate in Redis → Resolve tenant
    │
    ├── Has Authorization: Bearer edk_* header? → Lookup by prefix → bcrypt verify → Resolve tenant
    │
    └── Neither? → 401 Unauthorized
```

Dashboard endpoints typically require cookies. Agent endpoints (events, approvals, sessions, stream) accept API keys. Some endpoints (bundles, deployments) accept both.

### CSRF Protection

Cookie-authenticated mutating requests (POST, PUT, DELETE) require the `X-Requested-With` header. This prevents cross-site request forgery — a malicious page cannot forge a request with this header due to browser CORS restrictions.

API key requests and webhook callbacks are exempt from CSRF checks. API keys are not ambient credentials (not sent automatically by browsers), and webhooks use their own signature verification.

## Tenant Isolation (S3)

Tenant isolation is the highest-priority security boundary. A cross-tenant read, write, or inference is a ship-blocker — not a bug.

### Database Layer

Every database table has a `tenant_id` column. Every query filters by it. No exceptions.

```sql
-- Every query looks like this:
SELECT * FROM events
WHERE tenant_id = :tenant_id  -- ALWAYS present
  AND agent_id = :agent_id;

-- Never this:
SELECT * FROM events
WHERE agent_id = :agent_id;   -- Missing tenant_id = data leak
```

The `tenant_id` filter is applied in the service layer, not in individual route handlers. This reduces the surface area for mistakes — a route handler cannot accidentally skip the filter.

### Redis Layer

Session tokens are stored in Redis with a prefix:

```
session:{token}
```

The tenant_id is stored inside the session JSON value, not in the Redis key. Rate limit keys include client context. SSE connection state is tenant-scoped.

### SSE Layer

Agent SSE streams are filtered by tenant. An agent authenticated with tenant A's API key will never receive events for tenant B. The `PushManager` routes events through tenant-keyed subscriptions — cross-tenant delivery is impossible by construction.

### Notification Layer

The notification manager's channel dict is keyed by `tenant_id`:

```python
# channels: dict[str, list[Channel]]  (keyed by tenant_id)
# Fan-out only iterates the approval's tenant's channels
channels = self._channels.get(approval.tenant_id, [])
```

A notification for tenant A's approval will never fire on tenant B's Slack channel.

### Webhook Layer

Webhook callbacks (Telegram, Slack, Discord) resolve the tenant from Redis using a composite key:

```
{platform}:tenant:{channel_id}:{approval_id}
```

A forged webhook with a different channel ID will fail tenant resolution and be rejected.

## Bundle Signing (S6)

Every deployed bundle is signed with Ed25519. This prevents tampered contracts from being enforced by agents.

```
Bundle YAML content
    |
    v
SHA-256 hash (revision_hash)
    |
    v
Ed25519 sign(private_key, yaml_bytes)
    |
    v
signature (hex) + public_key (hex) included in SSE event
    |
    v
Agent verifies: Ed25519.verify(public_key, yaml_bytes, signature)
    |
    ├── Valid → reload() with new contracts
    └── Invalid → reject, keep current contracts (fail-closed)
```

### Key Storage

| Component | Protection |
|-----------|-----------|
| Private key | Encrypted at rest with NaCl SecretBox |
| Encryption key | Derived from `EDICTUM_SIGNING_KEY_SECRET` env var |
| Public key | Stored in plaintext (it is public) |
| Key rotation | Generate new pair → deactivate old → re-sign all active deployments |

### Key Rotation

Initiated from the dashboard danger zone. One action:

1. Generate new Ed25519 keypair
2. Encrypt private key with NaCl SecretBox
3. Mark old key as inactive
4. Re-sign all currently-deployed bundles with new key
5. Push `contract_update` events to all connected agents
6. Agents receive re-signed bundles and verify against new public key

Old keys are deactivated, not deleted. Audit records reference the key that was active at deploy time.

## Rate Limiting (S8)

Two rate limits protect against abuse:

### Login Rate Limit

| Parameter | Value |
|-----------|-------|
| Scope | Per IP address |
| Implementation | Redis sliding window (sorted sets) |
| Response | `429 Too Many Requests` with `Retry-After` header |
| Window | Configurable via `EDICTUM_RATE_LIMIT_WINDOW_SECONDS` (default 300) |
| Max attempts | Configurable via `EDICTUM_RATE_LIMIT_MAX_ATTEMPTS` (default 10) |

### Approval Rate Limit

| Parameter | Value |
|-----------|-------|
| Scope | Per agent (tenant_id + agent_id) |
| Limit | 10 requests per 60 seconds |
| Implementation | Redis sliding window |
| Response | `429 Too Many Requests` with `Retry-After` header |

## Bootstrap Lock (S7)

Admin creation only works when zero users exist in the database. Two bootstrap paths, same guard:

| Path | Mechanism |
|------|-----------|
| Environment variables | `_bootstrap_admin()` in FastAPI lifespan — creates admin if `EDICTUM_ADMIN_EMAIL` + `EDICTUM_ADMIN_PASSWORD` set and no users exist |
| Setup wizard | `POST /api/v1/setup` — browser-based first-run, creates admin if no users exist |

After the first admin is created, both paths are locked:

- Env-var bootstrap: skips silently (logs "admin already exists")
- Setup wizard: returns `409 Conflict`

A tenant and Ed25519 signing keypair are created alongside the admin. The system is fully operational from the first login.

## Secrets at Rest

Three categories of secrets are encrypted with NaCl SecretBox:

| Secret | Encryption Key |
|--------|---------------|
| Ed25519 signing key private component | `EDICTUM_SIGNING_KEY_SECRET` |
| Notification channel configs (bot tokens, secrets) | `EDICTUM_SECRET_KEY` |
| AI provider API keys | `EDICTUM_SECRET_KEY` |

All secrets are masked in API responses. The API never returns a plaintext bot token, API key, or private key.

## Security Boundaries

The console defines 8 security boundaries. Each has positive tests (proves it works) and adversarial tests (proves it doesn't break).

| # | Boundary | Module | Decision | Risk if Bypassed |
|---|----------|--------|----------|------------------|
| S1 | Session cookie validation | `auth/local.py` | Authenticated or reject | Full account takeover |
| S2 | API key resolution | `auth/api_keys.py` | Valid key → tenant, or reject | Unauthorized agent access |
| S3 | Tenant scoping on queries | Every route + service | Data scoped to tenant | Cross-tenant data leak |
| S4 | Approval state transitions | `services/approval_service.py` | Valid transition or reject | Unauthorized tool execution |
| S5 | SSE channel authorization | `routes/stream.py` | Agent sees own tenant only | Contract/event leak |
| S6 | Bundle signature verification | `services/signing_service.py` | Authentic or reject | Tampered contract deployment |
| S7 | Admin bootstrap lock | `main.py` lifespan | Create only if no users exist | Privilege escalation |
| S8 | Rate limiting on auth | `routes/auth.py` | Throttle or allow | Credential brute force |

## Adversarial Test Suite

43+ adversarial tests organized by attack category across all 8 boundaries:

```
tests/test_adversarial/
├── test_s1_session_bypass.py       # Forged cookies, expired tokens, tampered payloads
├── test_s2_api_key_bypass.py       # Revoked keys, malformed keys, timing attacks
├── test_s3_tenant_isolation.py     # Cross-tenant access on EVERY endpoint (15+ tests)
├── test_s4_approval_state.py       # Invalid transitions, race conditions, replay
├── test_s5_sse_channel.py          # Agent receiving another tenant's events
├── test_s6_signature_bypass.py     # Tampered bundles, missing signatures
├── test_s7_bootstrap_lock.py       # Re-running bootstrap after admin exists
└── test_s8_rate_limit.py           # Burst attempts, distributed attempts
```

Attack categories tested per boundary:

| Category | What it tests |
|----------|---------------|
| **Input manipulation** | Encoding tricks, injection, type confusion, boundary values |
| **Semantic bypass** | Indirection, TOCTOU, classification gaming |
| **Failure modes** | Dependency down, garbage responses, partial failure |
| **Audit fidelity** | Correct events emitted for each decision path |

The adversarial suite runs on every PR: `pytest -m security`. A failure is a merge blocker. Any PR that adds or modifies a security boundary without adversarial tests is rejected.

### Tenant Isolation Tests (S3 — Highest Priority)

Tenant isolation has the most tests because it is the highest-risk boundary. Attack patterns covered:

- **Direct ID manipulation**: API key from tenant A, agent_id header from tenant B. GET/PUT on resources belonging to another tenant.
- **Auth context mismatch**: dashboard cookie from tenant A, API key from tenant B in the same request.
- **Data leakage in responses**: list endpoints returning cross-tenant items. Error messages revealing resource existence in other tenants (404 vs 403).
- **SSE cross-tenant**: agent receiving events for wrong tenant after reconnection.

A successful cross-tenant read/write/inference is a **ship-blocker**, not a bug.

## Next Steps

- [How It Works](how-it-works.md) -- system architecture and the boundary principle
- [Hot-Reload](hot-reload.md) -- Ed25519 signing in the SSE push flow
- [Approvals](approvals.md) -- webhook signature verification for interactive channels
