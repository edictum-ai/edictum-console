# Deploy with Docker

Production deployment guide for Edictum Console.

## Quick Start

```bash
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

## docker-compose.yml

```yaml
version: '3.8'

services:
  server:
    image: ghcr.io/acartag7/edictum-console:latest
    ports:
      - "8000:8000"
    environment:
      EDICTUM_DATABASE_URL: postgresql+asyncpg://user:pass@postgres:5432/edictum
      EDICTUM_REDIS_URL: redis://redis:6379
      EDICTUM_SECRET_KEY: ${EDICTUM_SECRET_KEY}
      EDICTUM_ADMIN_EMAIL: ${EDICTUM_ADMIN_EMAIL}
      EDICTUM_ADMIN_PASSWORD: ${EDICTUM_ADMIN_PASSWORD}
      EDICTUM_BASE_URL: https://console.example.com
      EDICTUM_CORS_ORIGINS: https://console.example.com
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: edictum
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d edictum"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

## Required Environment Variables

```bash
# .env file

# REQUIRED — Security
EDICTUM_SECRET_KEY=your-256-bit-secret-key-here-use-openssl-rand-hex-32
EDICTUM_ADMIN_EMAIL=admin@example.com
EDICTUM_ADMIN_PASSWORD=minimum-12-char-secure-password

# REQUIRED — Database
POSTGRES_USER=edictum
POSTGRES_PASSWORD=secure-db-password
EDICTUM_DATABASE_URL=postgresql+asyncpg://edictum:secure-db-password@postgres:5432/edictum

# REQUIRED — Redis
EDICTUM_REDIS_URL=redis://redis:6379

# REQUIRED — Public URL
EDICTUM_BASE_URL=https://console.example.com
EDICTUM_CORS_ORIGINS=https://console.example.com
```

## Production Checklist

### Security

- [ ] Generate strong `EDICTUM_SECRET_KEY` (256-bit minimum)
- [ ] Set secure `EDICTUM_ADMIN_PASSWORD` (12+ chars, mixed case, numbers, symbols)
- [ ] Use HTTPS (configure reverse proxy or load balancer)
- [ ] Restrict CORS origins to your domain only
- [ ] Enable rate limiting (default is enabled)

### Database

- [ ] Use managed PostgreSQL (Neon, RDS, Cloud SQL) or secure self-hosted
- [ ] Enable connection pooling (PgBouncer or built-in)
- [ ] Configure backups
- [ ] Set up read replicas for analytics (optional)

### Redis

- [ ] Use managed Redis (Upstash, ElastiCache) or secure self-hosted
- [ ] Enable TLS if connecting over network
- [ ] Set maxmemory policy to `allkeys-lru`

### Infrastructure

- [ ] Configure reverse proxy (nginx, Caddy, Traefik)
- [ ] Enable HTTPS with valid certificate (Let's Encrypt)
- [ ] Set up monitoring (logs, metrics, alerts)
- [ ] Configure log aggregation

## Reverse Proxy Example (Caddy)

```caddyfile
console.example.com {
    reverse_proxy server:8000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
```

## Scaling

### Horizontal Scaling

```yaml
services:
  server:
    deploy:
      replicas: 3
    # ... rest of config
```

Ensure Redis is shared (use managed Redis).

### Database Connection Pooling

```bash
EDICTUM_DATABASE_URL=postgresql+asyncpg://user:pass@pgbouncer:6432/edictum
```

## Health Checks

```bash
# Liveness
curl http://localhost:8000/api/v1/health
# {"status":"ok"}

# Readiness (checks DB + Redis)
curl http://localhost:8000/api/v1/health/ready
# {"status":"ready","checks":{"database":"ok","redis":"ok"}}
```

## Upgrading

```bash
# Pull latest image
docker compose pull server

# Restart with new image
docker compose up -d server

# Run migrations (if needed)
docker compose exec server alembic upgrade head
```

## Backup

### Database

```bash
# Manual backup
docker compose exec postgres pg_dump -U edictum edictum > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U edictum edictum
```

### Automated Backups

Use managed database service with built-in backups, or set up cron:

```bash
0 2 * * * docker compose exec postgres pg_dump -U edictum edictum | gzip > /backups/edictum-$(date +\%Y\%m\%d).sql.gz
```

## Troubleshooting

See [Troubleshooting Guide](../deploy/troubleshooting.md).
