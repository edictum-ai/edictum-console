# Production Checklist

Complete checklist before deploying Edictum Console to production.

## Security

### Authentication

- [ ] Set strong `EDICTUM_SECRET_KEY` (generate with `openssl rand -hex 32`)
- [ ] Set strong admin password (12+ chars, mixed case, numbers, symbols)
- [ ] Change default admin password after first login
- [ ] Review and revoke unused API keys

### Network

- [ ] Configure HTTPS with valid certificate (Let's Encrypt recommended)
- [ ] Set correct `EDICTUM_BASE_URL` (must match your domain)
- [ ] Restrict `EDICTUM_CORS_ORIGINS` to your domain only
- [ ] Configure firewall rules (only expose ports 80, 443)

### Database

- [ ] Use managed PostgreSQL (Neon, RDS, Cloud SQL)
- [ ] Enable TLS for database connections
- [ ] Configure connection pooling
- [ ] Set up automated backups
- [ ] Restrict database network access

### Redis

- [ ] Use managed Redis (Upstash, ElastiCache)
- [ ] Enable TLS if connecting over network
- [ ] Set maxmemory policy to `allkeys-lru`

## Configuration

### Required Environment Variables

```bash
EDICTUM_SECRET_KEY=<256-bit-secret>
EDICTUM_DATABASE_URL=postgresql+asyncpg://...
EDICTUM_REDIS_URL=redis://...
EDICTUM_BASE_URL=https://console.example.com
EDICTUM_CORS_ORIGINS=https://console.example.com
EDICTUM_ADMIN_EMAIL=admin@example.com
EDICTUM_ADMIN_PASSWORD=<secure-password>
```

### Recommended Settings

```bash
EDICTUM_SESSION_TTL_HOURS=24
EDICTUM_EVENT_RETENTION_DAYS=90
EDICTUM_LOG_LEVEL=INFO
EDICTUM_LOG_FORMAT=json
```

## Infrastructure

### Reverse Proxy

Configure nginx, Caddy, or Traefik:

```caddyfile
console.example.com {
    reverse_proxy server:8000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
}
```

### Monitoring

- [ ] Set up log aggregation (Logflare, Datadog, etc.)
- [ ] Configure metrics collection
- [ ] Set up alerts for:
  - High error rates
  - Database connection issues
  - Redis connection issues
  - Disk/memory usage

### Backups

- [ ] Database automated backups
- [ ] Test backup restoration
- [ ] Document recovery procedure

## Scaling

### Horizontal Scaling

```yaml
services:
  server:
    deploy:
      replicas: 3
```

- Use shared Redis (managed)
- Use connection pooling for PostgreSQL
- Configure load balancer health checks

### Performance

- [ ] Enable gzip compression
- [ ] Configure connection pooling
- [ ] Set appropriate worker count

## Notifications

- [ ] Configure at least one notification channel
- [ ] Test notification delivery
- [ ] Set up routing filters for critical events

## Contracts

- [ ] Upload production contracts
- [ ] Deploy to production environment
- [ ] Verify agents are receiving updates

## Post-Deployment

### Verification

- [ ] Health check returns OK: `GET /api/v1/health/ready`
- [ ] Can log in with admin credentials
- [ ] Can create API key
- [ ] Agent can connect with API key
- [ ] Events appear in dashboard
- [ ] Notifications are sent

### Documentation

- [ ] Document your deployment configuration
- [ ] Document backup/recovery procedure
- [ ] Document runbook for common issues

## Security Review

### Before Go-Live

- [ ] No secrets in git
- [ ] No secrets in Docker image
- [ ] No debug mode enabled
- [ ] No test credentials
- [ ] All default passwords changed
- [ ] Unused services disabled

### Ongoing

- [ ] Regular dependency updates
- [ ] Regular security audits
- [ ] Review audit logs weekly
- [ ] Rotate API keys quarterly

## Support

- [ ] Document internal escalation path
- [ ] Set up monitoring alerts
- [ ] Create runbook for incidents
