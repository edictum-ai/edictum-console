# Self-Hosting Guide

Deploy Edictum Console on your own infrastructure. One Docker image, five minutes to production.

## Docker Compose (Recommended)

Three services: Postgres 16, Redis 7, and the Edictum server.

### 1. Clone and Configure

```bash
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console
cp .env.example .env
```

### 2. Generate Secrets

Every deployment needs three secrets. Generate each one:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Add them to your `.env`:

```bash
# Session token signing (required)
EDICTUM_SECRET_KEY=<paste-hex-here>

# Ed25519 key encryption for bundle signing (required for deploys)
EDICTUM_SIGNING_KEY_SECRET=<paste-hex-here>

# Postgres password (required)
POSTGRES_PASSWORD=<paste-hex-here>
```

### 3. Start Everything

```bash
docker compose up -d
```

This starts:

| Service | Image | Port | Health Check |
|---------|-------|------|-------------|
| `postgres` | `postgres:16` | 5432 (internal) | `pg_isready` every 10s |
| `redis` | `redis:7-alpine` | 6379 (internal) | `redis-cli ping` every 10s |
| `server` | Built from Dockerfile | 8000 (exposed) | Waits for postgres + redis |

The server waits for both dependencies to be healthy before starting. Postgres data persists in a `pgdata` volume.

### 4. Bootstrap Admin

**Option A: Setup Wizard** (recommended)

Open `http://localhost:8000/dashboard/setup` and create your admin account. Password must be at least 12 characters.

**Option B: Environment Variables**

Add to `.env` before first start:

```bash
EDICTUM_ADMIN_EMAIL=admin@example.com
EDICTUM_ADMIN_PASSWORD=your-secure-password-here
```

Both options are protected by bootstrap lock -- admin creation only works when zero users exist.

### 5. Verify

```bash
curl http://localhost:8000/api/v1/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "auth_provider": "local",
  "bootstrap_complete": true,
  "base_url_https": false,
  "database": {"connected": true, "latency_ms": 2.1},
  "redis": {"connected": true, "latency_ms": 0.8},
  "connected_agents": 0
}
```

## Railway

A `railway.toml` is included in the repo:

1. Push the repo to Railway
2. Add Postgres and Redis plugins
3. Set environment variables (same as `.env`)
4. Railway reads `railway.toml` -- health check at `/api/v1/health` with 60s timeout, max 3 restart retries

Set `EDICTUM_BASE_URL` to your Railway public URL (e.g. `https://edictum-console-production.up.railway.app`).

## Render

A `render.yaml` is included:

1. Create a new Blueprint from the repo
2. Render reads `render.yaml` -- Docker web service with health check at `/api/v1/health`
3. Set environment variables in the Render dashboard
4. Set `EDICTUM_BASE_URL` to your Render service URL

## Production Checklist

### HTTPS

Set `EDICTUM_BASE_URL` to your public HTTPS domain:

```bash
EDICTUM_BASE_URL=https://edictum.example.com
```

This enables:

- **Secure cookies** -- `Secure` flag auto-set on session cookies
- **Interactive notifications** -- Telegram, Slack, and Discord button callbacks require HTTPS
- **CORS** -- origin matching uses this URL

### Backups

Back up Postgres regularly:

```bash
docker compose exec postgres pg_dump -U postgres edictum > backup.sql
```

Restore:

```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres edictum
```

### Monitoring

Poll the health endpoint:

```bash
curl -s https://edictum.example.com/api/v1/health | jq .status
```

Returns `"ok"` when Postgres and Redis are reachable, `"degraded"` otherwise. Monitor this with your existing alerting (Uptime Kuma, Datadog, etc.).

### Signing Key Rotation

Rotate the Ed25519 signing key periodically from **Dashboard > Settings > Danger Zone > Rotate Signing Key**. This generates a new keypair and re-signs all currently deployed bundles. Connected agents receive the updated bundles automatically via SSE.

### Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_PASSWORD` | Yes | -- | Postgres container password |
| `EDICTUM_SECRET_KEY` | Yes | -- | Session token signing |
| `EDICTUM_SIGNING_KEY_SECRET` | Yes | -- | Ed25519 key encryption |
| `EDICTUM_ADMIN_EMAIL` | First run | -- | Bootstrap admin email |
| `EDICTUM_ADMIN_PASSWORD` | First run | -- | Bootstrap admin password (min 12 chars) |
| `EDICTUM_BASE_URL` | No | `http://localhost:8000` | Public URL |
| `EDICTUM_AUTH_PROVIDER` | No | `local` | Auth provider |
| `EDICTUM_SESSION_TTL_HOURS` | No | `24` | Session cookie lifetime |
| `EDICTUM_ENV_NAME` | No | `development` | `production` disables OpenAPI docs |
| `EDICTUM_CORS_ORIGINS` | No | `http://localhost:8000,http://localhost:3000` | Comma-separated allowed origins |
| `EDICTUM_RATE_LIMIT_MAX_ATTEMPTS` | No | `10` | Login rate limit |
| `EDICTUM_RATE_LIMIT_WINDOW_SECONDS` | No | `300` | Rate limit window |

## Upgrading

Alembic migrations run automatically on startup (the Dockerfile CMD runs `alembic upgrade head` before starting the server). To upgrade:

```bash
git pull
docker compose build
docker compose up -d
```

The server applies any new database migrations during startup. No manual migration steps needed.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server won't start | Check `docker compose logs server` -- missing required env vars show clear error messages |
| Database connection refused | Ensure postgres is healthy: `docker compose ps` should show `healthy` |
| Session cookies not persisting | Set `EDICTUM_BASE_URL` to your actual URL (HTTPS in production) |
| Interactive notification buttons don't work | `EDICTUM_BASE_URL` must be a public HTTPS URL |
| `EDICTUM_SECRET_KEY` error on startup | This is required -- generate with `python -c "import secrets; print(secrets.token_hex(32))"` |

## Next Steps

- [Connecting Agents](connecting-agents.md) -- install the SDK and connect your first agent
- [Managing Contracts](managing-contracts.md) -- create, compose, and deploy contracts
- [Notification Channels](notifications/overview.md) -- set up Telegram, Slack, Discord, or email alerts
