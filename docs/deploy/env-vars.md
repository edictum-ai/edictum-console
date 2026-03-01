# Environment Variables

Quick reference for all environment variables.

## Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EDICTUM_SECRET_KEY` | ✅ | — | 256-bit secret for sessions |
| `EDICTUM_DATABASE_URL` | ✅ | — | PostgreSQL connection URL |
| `EDICTUM_REDIS_URL` | ✅ | — | Redis connection URL |
| `EDICTUM_BASE_URL` | ✅ | — | Public URL of Console |
| `EDICTUM_ADMIN_EMAIL` | ⚠️ | — | Initial admin email |
| `EDICTUM_ADMIN_PASSWORD` | ⚠️ | — | Initial admin password |
| `EDICTUM_CORS_ORIGINS` | | `$BASE_URL` | Allowed CORS origins |
| `EDICTUM_SESSION_TTL_HOURS` | | 24 | Session lifetime |
| `EDICTUM_LOG_LEVEL` | | INFO | Log level |
| `EDICTUM_LOG_FORMAT` | | json | Log format |

⚠️ = Required for first-run setup

## By Category

### Required

```bash
EDICTUM_SECRET_KEY=           # openssl rand -hex 32
EDICTUM_DATABASE_URL=         # postgresql+asyncpg://...
EDICTUM_REDIS_URL=            # redis://...
EDICTUM_BASE_URL=             # https://console.example.com
```

### Authentication

```bash
EDICTUM_ADMIN_EMAIL=          # admin@example.com
EDICTUM_ADMIN_PASSWORD=       # min 12 characters
EDICTUM_SESSION_TTL_HOURS=24  # session lifetime
EDICTUM_AUTH_PROVIDER=local   # local or clerk
```

### Security

```bash
EDICTUM_CORS_ORIGINS=         # comma-separated URLs
EDICTUM_ALLOW_LOCALHOST_WEBHOOKS=false
```

### Database

```bash
EDICTUM_DATABASE_URL=         # postgresql+asyncpg://...
EDICTUM_DB_POOL_SIZE=10
EDICTUM_DB_MAX_OVERFLOW=20
EDICTUM_DB_ECHO=false
```

### Redis

```bash
EDICTUM_REDIS_URL=            # redis://...
EDICTUM_REDIS_MAX_CONNECTIONS=50
```

### Events

```bash
EDICTUM_EVENT_RETENTION_DAYS=90
EDICTUM_EVENT_MAX_RESULT_LENGTH=10000
```

### Logging

```bash
EDICTUM_LOG_LEVEL=INFO        # DEBUG, INFO, WARNING, ERROR
EDICTUM_LOG_FORMAT=json       # json or text
```

### Static Files

```bash
EDICTUM_STATIC_DIR=/app/static/dashboard
```

### Development

```bash
EDICTUM_DEBUG=false
EDICTUM_RELOAD=false
```

## URL Formats

### PostgreSQL

```bash
postgresql+asyncpg://user:password@host:5432/database
```

### Redis

```bash
redis://localhost:6379
rediss://default:password@host:6379  # TLS
redis://localhost:6379/1              # Database 1
```

## Validation Errors

| Error | Solution |
|-------|----------|
| `EDICTUM_SECRET_KEY is required` | Set the variable |
| `Password must be 12+ chars` | Use longer password |
| `Database URL must use postgresql+asyncpg` | Fix URL scheme |
| `CORS origins invalid` | Use comma-separated URLs |

## Docker Compose

```yaml
services:
  server:
    environment:
      EDICTUM_DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/edictum
      EDICTUM_REDIS_URL: redis://redis:6379
      EDICTUM_SECRET_KEY: ${EDICTUM_SECRET_KEY}
      EDICTUM_BASE_URL: ${EDICTUM_BASE_URL}
```

## Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: edictum-config
stringData:
  EDICTUM_SECRET_KEY: "..."
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: edictum-config
data:
  EDICTUM_BASE_URL: "https://console.example.com"
  EDICTUM_LOG_LEVEL: "INFO"
```
