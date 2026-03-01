# Configuration

All environment variables and configuration options.

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EDICTUM_SECRET_KEY` | Secret for signing sessions (256-bit) | `openssl rand -hex 32` |
| `EDICTUM_DATABASE_URL` | PostgreSQL connection URL | `postgresql+asyncpg://user:pass@host/db` |
| `EDICTUM_REDIS_URL` | Redis connection URL | `redis://host:6379` |
| `EDICTUM_BASE_URL` | Public URL of your Console | `https://console.example.com` |

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_ADMIN_EMAIL` | — | Initial admin email (for bootstrap) |
| `EDICTUM_ADMIN_PASSWORD` | — | Initial admin password (min 12 chars) |
| `EDICTUM_SESSION_TTL_HOURS` | `24` | Session lifetime in hours |
| `EDICTUM_AUTH_PROVIDER` | `local` | Auth provider: `local` or `clerk` |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_DATABASE_URL` | — | PostgreSQL async URL |
| `EDICTUM_DB_POOL_SIZE` | `10` | Connection pool size |
| `EDICTUM_DB_MAX_OVERFLOW` | `20` | Max overflow connections |
| `EDICTUM_DB_ECHO` | `false` | Echo SQL statements |

### Database URL Format

```bash
# PostgreSQL (required for production)
EDICTUM_DATABASE_URL=postgresql+asyncpg://user:password@host:5432/database

# SQLite (only for development/testing)
EDICTUM_DATABASE_URL=sqlite+aiosqlite:///./edictum.db
```

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_REDIS_URL` | — | Redis connection URL |
| `EDICTUM_REDIS_MAX_CONNECTIONS` | `50` | Max connection pool size |

### Redis URL Format

```bash
# Standard
EDICTUM_REDIS_URL=redis://localhost:6379

# TLS (Upstash, etc.)
EDICTUM_REDIS_URL=rediss://default:password@host:6379

# With database number
EDICTUM_REDIS_URL=redis://localhost:6379/1
```

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_SECRET_KEY` | — | **Required** in production |
| `EDICTUM_CORS_ORIGINS` | `EDICTUM_BASE_URL` | Allowed CORS origins (comma-separated) |
| `EDICTUM_ALLOW_LOCALHOST_WEBHOOKS` | `false` | Allow localhost in webhook URLs |

## Notifications

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_TELEGRAM_WEBHOOK_PATH` | `/api/v1/telegram/webhook` | Telegram webhook base path |

## Event Retention

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_EVENT_RETENTION_DAYS` | `90` | Days to keep events |
| `EDICTUM_EVENT_MAX_RESULT_LENGTH` | `10000` | Truncate tool results longer than this |

## Signing Keys

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_SIGNING_KEY` | (auto-generated) | Ed25519 private key for bundle signing |

Keys are auto-generated on first run and stored encrypted in the database.

## Static Files

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_STATIC_DIR` | `/app/static/dashboard` | Dashboard static files directory |

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `EDICTUM_LOG_FORMAT` | `json` | Format: `json` or `text` |

## Development

| Variable | Default | Description |
|----------|---------|-------------|
| `EDICTUM_DEBUG` | `false` | Enable debug mode |
| `EDICTUM_RELOAD` | `false` | Enable auto-reload (uvicorn) |

## Complete .env Example

```bash
# === REQUIRED ===
EDICTUM_SECRET_KEY=your-256-bit-secret-key-here-use-openssl-rand-hex-32
EDICTUM_DATABASE_URL=postgresql+asyncpg://edictum:password@postgres:5432/edictum
EDICTUM_REDIS_URL=redis://redis:6379
EDICTUM_BASE_URL=https://console.example.com

# === AUTHENTICATION ===
EDICTUM_ADMIN_EMAIL=admin@example.com
EDICTUM_ADMIN_PASSWORD=minimum-12-char-secure-password
EDICTUM_SESSION_TTL_HOURS=24

# === SECURITY ===
EDICTUM_CORS_ORIGINS=https://console.example.com,https://app.example.com

# === DATABASE ===
EDICTUM_DB_POOL_SIZE=10
EDICTUM_DB_MAX_OVERFLOW=20

# === REDIS ===
EDICTUM_REDIS_MAX_CONNECTIONS=50

# === EVENTS ===
EDICTUM_EVENT_RETENTION_DAYS=90
EDICTUM_EVENT_MAX_RESULT_LENGTH=10000

# === LOGGING ===
EDICTUM_LOG_LEVEL=INFO
EDICTUM_LOG_FORMAT=json

# === DEVELOPMENT (don't use in production) ===
# EDICTUM_DEBUG=true
# EDICTUM_RELOAD=true
```

## Docker Compose Example

```yaml
services:
  server:
    image: edictum-console:latest
    environment:
      EDICTUM_DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/edictum
      EDICTUM_REDIS_URL: redis://redis:6379
      EDICTUM_SECRET_KEY: ${EDICTUM_SECRET_KEY}
      EDICTUM_BASE_URL: ${EDICTUM_BASE_URL}
      EDICTUM_CORS_ORIGINS: ${EDICTUM_BASE_URL}
    env_file:
      - .env
```

## Validation

Console validates configuration on startup:

```
❌ EDICTUM_SECRET_KEY is required in production
❌ EDICTUM_ADMIN_PASSWORD must be at least 12 characters
❌ EDICTUM_DATABASE_URL must use postgresql+asyncpg:// scheme
✅ Configuration valid
```

## Secrets Management

For production, use secrets management:

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: edictum-secrets
stringData:
  EDICTUM_SECRET_KEY: "..."
  EDICTUM_ADMIN_PASSWORD: "..."
  POSTGRES_PASSWORD: "..."
```

### Docker Swarm

```bash
echo "your-secret-key" | docker secret create edictum_secret_key -
```

### HashiCorp Vault

```bash
# In your entrypoint
export EDICTUM_SECRET_KEY=$(vault kv get -field=secret_key secret/edictum)
```
