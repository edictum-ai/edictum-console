# Deploy to Railway

Step-by-step guide to deploying Edictum Console on [Railway](https://railway.app). Three services (Postgres, Redis, console), one deploy, under ten minutes.

## Prerequisites

- A Railway account (free tier works for evaluation)
- Your code in a GitHub repo, or the [Railway CLI](https://docs.railway.app/guides/cli) installed

## 1. Create a Project

**Option A: From GitHub (recommended)**

1. Go to [railway.app/new](https://railway.app/new)
2. Select **Deploy from GitHub repo**
3. Connect your fork of `edictum-console`
4. Railway detects the `Dockerfile` and `railway.toml` automatically

**Option B: Railway CLI**

```bash
cd edictum-console
railway login
railway init
railway link
```

## 2. Add Postgres

1. In your Railway project, click **+ New** > **Database** > **Add PostgreSQL**
2. Railway creates a Postgres instance and auto-injects `DATABASE_URL` into your service

No configuration needed. The `docker-entrypoint.sh` automatically maps Railway's `DATABASE_URL` (which uses `postgresql://`) to `EDICTUM_DATABASE_URL` with the `postgresql+asyncpg://` driver prefix that the server requires.

## 3. Add Redis

1. Click **+ New** > **Database** > **Add Redis**
2. Railway creates a Redis instance and auto-injects `REDIS_URL` into your service

Again, the entrypoint maps `REDIS_URL` to `EDICTUM_REDIS_URL` automatically if the `EDICTUM_` prefixed variant isn't set.

## 4. Configure Environment Variables

In your console service, go to **Variables** and add these:

### Required

Generate secrets locally and paste them in:

```bash
# Run this twice, once for each secret
python -c "import secrets; print(secrets.token_hex(32))"
```

| Variable | Value | Purpose |
|----------|-------|---------|
| `EDICTUM_SECRET_KEY` | 64-char hex from above | Session token signing |
| `EDICTUM_SIGNING_KEY_SECRET` | 64-char hex from above | Ed25519 key encryption for bundle signing |

### First-run Bootstrap

Set these to auto-create the admin account on first startup:

| Variable | Value | Purpose |
|----------|-------|---------|
| `EDICTUM_ADMIN_EMAIL` | Your email | Bootstrap admin user |
| `EDICTUM_ADMIN_PASSWORD` | Strong password (min 12 chars) | Bootstrap admin password |

Alternatively, skip these and use the setup wizard at `https://<your-domain>/dashboard/setup` after the first deploy.

### Recommended for Production

| Variable | Value | Purpose |
|----------|-------|---------|
| `EDICTUM_BASE_URL` | `https://your-domain.up.railway.app` | Public URL (enables secure cookies, CORS, notification callbacks) |
| `EDICTUM_CORS_ORIGINS` | Same as `EDICTUM_BASE_URL` | Allowed CORS origins |
| `EDICTUM_AUTH_PROVIDER` | `local` | Auth provider (only option currently) |
| `EDICTUM_ENV_NAME` | `production` | Disables OpenAPI docs, sets env label |
| `EDICTUM_SESSION_TTL_HOURS` | `24` | Session cookie lifetime |

### What You Don't Need to Set

Railway auto-injects `DATABASE_URL` and `REDIS_URL` from the plugin services. The entrypoint handles the mapping. You only need to set `EDICTUM_DATABASE_URL` / `EDICTUM_REDIS_URL` manually if you're using external databases.

## 5. Deploy

If you connected a GitHub repo, Railway deploys automatically on push. For CLI:

```bash
railway up
```

Railway reads `railway.toml` which configures:

- **Builder:** Dockerfile (multi-stage: frontend build, Python build, slim runtime)
- **Health check:** `GET /api/v1/health` with 60s timeout
- **Restart policy:** On failure, max 3 retries

First deploy takes 3-5 minutes (Docker build + dependency install). Subsequent deploys are faster due to layer caching.

## 6. Custom Domain (Optional)

1. In your service settings, go to **Networking** > **Custom Domain**
2. Add your domain (e.g., `console.example.com`)
3. Add the CNAME record Railway provides to your DNS
4. Railway handles TLS automatically
5. Update `EDICTUM_BASE_URL` and `EDICTUM_CORS_ORIGINS` to match the custom domain

Railway also provides an auto-generated domain like `edictum-console-production-xxxx.up.railway.app` which works immediately.

## 7. Verify

Check the health endpoint:

```bash
curl https://<your-domain>/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "auth_provider": "local",
  "bootstrap_complete": true,
  "base_url_https": true,
  "database": {"connected": true, "latency_ms": 2.1},
  "redis": {"connected": true, "latency_ms": 0.8},
  "connected_agents": 0
}
```

Then open `https://<your-domain>/dashboard` to log in.

## Troubleshooting

### Build fails

Check the build logs in Railway's dashboard. Common causes:

- **Out of memory during frontend build** -- Railway's free tier has limited build resources. Upgrade the plan or push a pre-built image instead.
- **pnpm lockfile mismatch** -- ensure `dashboard/pnpm-lock.yaml` is committed and up to date.

### Server starts but health check fails

The health check hits `/api/v1/health` with a 60s timeout. If the server takes too long:

- Check deploy logs for migration errors (`alembic upgrade head` runs on startup)
- Ensure Postgres and Redis plugins are running (check their service status in Railway)
- Verify the internal connection URLs are correct -- Railway uses `*.railway.internal` hostnames between services

### Database connection refused

Railway's Postgres is on the internal network at `postgres.railway.internal:5432`. If you manually set `EDICTUM_DATABASE_URL`, ensure you're using the internal hostname, not the public proxy URL, for lower latency.

### Session cookies not persisting

Set `EDICTUM_BASE_URL` to your actual public URL with `https://`. Without this, the server won't set the `Secure` flag on cookies, and browsers may reject them over HTTPS.

### Notification buttons don't work

Interactive notification buttons (Telegram approve/deny) require `EDICTUM_BASE_URL` to be a public HTTPS URL so the callback URLs resolve correctly.

### Migrations

Alembic migrations run automatically on every deploy via `docker-entrypoint.sh`. No manual migration steps needed. Check deploy logs if you suspect a migration failure.

## Cost Estimate

Railway's pricing is usage-based. A typical Edictum Console deployment uses:

- **Console service:** ~256MB RAM idle, spikes during builds
- **Postgres:** ~100MB RAM
- **Redis:** ~50MB RAM

This fits comfortably within Railway's Hobby plan. Check [Railway pricing](https://railway.app/pricing) for current rates.
