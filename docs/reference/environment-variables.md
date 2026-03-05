# Environment Variables

All environment variables are prefixed with `EDICTUM_` except `POSTGRES_PASSWORD` (used directly by the Postgres container).

## When to use this

Read this page when configuring a new console deployment, troubleshooting startup failures, or hardening a production instance. Every variable that affects console behavior is documented here.

---

## Required

These must be set for the console to start.

| Variable | Default | Purpose |
|----------|---------|---------|
| `POSTGRES_PASSWORD` | — | Postgres container password. Used by both the `postgres` service and the server's connection string. |
| `EDICTUM_SECRET_KEY` | — | HMAC key for session token signing. Server refuses to start if missing. |
| `EDICTUM_DATABASE_URL` | — | Async SQLAlchemy connection string for PostgreSQL. Server refuses to start if missing. Auto-set by Docker Compose. |
| `EDICTUM_REDIS_URL` | — | Redis connection string. Server refuses to start if missing. Auto-set by Docker Compose. |

Generate all three:

```bash
python -c "import secrets; print(f'POSTGRES_PASSWORD={secrets.token_hex(16)}')"
python -c "import secrets; print(f'EDICTUM_SECRET_KEY={secrets.token_hex(32)}')"
python -c "import secrets; print(f'EDICTUM_SIGNING_KEY_SECRET={secrets.token_hex(32)}')"
```

---

## Admin Bootstrap (First Run)

Set these to auto-create the admin user on first startup. Alternatively, leave them blank and use the `/dashboard/setup` wizard.

| Variable | Default | Purpose |
|----------|---------|---------|
| `EDICTUM_ADMIN_EMAIL` | — | Bootstrap admin email address. Only used when zero users exist in the database. |
| `EDICTUM_ADMIN_PASSWORD` | — | Bootstrap admin password. Minimum 12 characters. Only used when zero users exist. |

Both paths (env-var bootstrap and setup wizard) are protected by the S7 bootstrap lock — they only work when the database has zero users. After the first admin is created, these variables are ignored.

---

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `EDICTUM_BASE_URL` | `http://localhost:8000` | Public URL for CORS origins, webhook callback URLs, and secure cookie detection. Set to your domain in production (e.g., `https://console.example.com`). When the URL starts with `https://`, the `Secure` flag is automatically set on session cookies. |
| `EDICTUM_AUTH_PROVIDER` | `local` | Authentication provider. Currently only `local` is supported. Future: `oidc`. |
| `EDICTUM_SESSION_TTL_HOURS` | `24` | Session cookie lifetime in hours. Sessions are stored in Redis with this TTL. TTL slides (resets) on each successful authentication. |
| `EDICTUM_ENV_NAME` | `development` | Runtime environment name. Set to `production` to disable OpenAPI docs (`/docs`, `/redoc`). Values: `development`, `staging`, `production`. |
| `EDICTUM_CORS_ORIGINS` | `http://localhost:8000,http://localhost:3000` | Comma-separated list of allowed CORS origins. Used during development when the Vite dev server runs on a different port. |
| `EDICTUM_RATE_LIMIT_MAX_ATTEMPTS` | `10` | Maximum login attempts per IP within the rate limit window before returning 429. Also applies to approval creation (per tenant+agent). |
| `EDICTUM_RATE_LIMIT_WINDOW_SECONDS` | `300` | Sliding window duration for rate limiting (in seconds). |
| `EDICTUM_SIGNING_KEY_SECRET` | — | NaCl SecretBox key for encrypting Ed25519 private keys and notification channel secrets at rest. 32 bytes = 64 hex characters. Server starts without it but bundle signing/deployment will fail. |
| `EDICTUM_TRUSTED_PROXIES` | — | Comma-separated trusted proxy IPs for `ProxyHeadersMiddleware`. Set when running behind a reverse proxy to ensure correct client IP for rate limiting. |

---

## Auto-Configured by Docker Compose

When using Docker Compose, `EDICTUM_DATABASE_URL` and `EDICTUM_REDIS_URL` are set automatically in `docker-compose.yml`:

| Variable | Docker Compose Value |
|----------|---------------------|
| `EDICTUM_DATABASE_URL` | `postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres:5432/edictum` |
| `EDICTUM_REDIS_URL` | `redis://redis:6379/0` |

If deploying outside Docker Compose, you must set these yourself.

---

## Production Checklist

1. **Generate unique secrets.** Never reuse secrets across environments. Never commit them to version control.

2. **Set `EDICTUM_BASE_URL` to your public domain.** This enables `Secure` cookies, correct CORS headers, and valid webhook callback URLs for notification channels.

3. **Set `EDICTUM_ENV_NAME=production`.** Disables OpenAPI docs at `/docs` and `/redoc`.

4. **Use strong admin credentials.** Minimum 12 characters. The bootstrap password cannot be changed through the UI yet — to reset, update the bcrypt hash directly in the database.

5. **Restrict CORS origins.** Remove `localhost` entries from `EDICTUM_CORS_ORIGINS` in production.

6. **Back up your signing key secret.** If `EDICTUM_SIGNING_KEY_SECRET` is lost, encrypted Ed25519 private keys and notification channel secrets cannot be decrypted. You will need to rotate the signing key and reconfigure all notification channels.
