# Troubleshooting

Common issues and solutions for Edictum Console.

## Startup Issues

### Server Won't Start

**Symptoms:**
```
❌ EDICTUM_SECRET_KEY is required in production
```

**Solution:**
```bash
# Generate a 256-bit secret
openssl rand -hex 32
# Set in .env
EDICTUM_SECRET_KEY=your-generated-key
```

---

**Symptoms:**
```
❌ Can't connect to PostgreSQL
```

**Solutions:**

1. Check database is running:
```bash
docker compose ps postgres
```

2. Check connection URL:
```bash
# Correct format
postgresql+asyncpg://user:password@host:5432/database
# Not:
postgresql://...  # Missing asyncpg driver
```

3. Check network:
```bash
docker compose exec server ping postgres
```

---

**Symptoms:**
```
❌ Redis connection refused
```

**Solutions:**

1. Check Redis is running:
```bash
docker compose ps redis
```

2. Test connection:
```bash
docker compose exec redis redis-cli ping
# Should return: PONG
```

## Authentication Issues

### Can't Log In

**Symptoms:** Login returns 401

**Solutions:**

1. Check credentials are correct
2. Check user exists in database
3. Reset admin password:
```bash
# Connect to database
docker compose exec postgres psql -U edictum

-- Reset password (bcrypt hash of new password)
UPDATE users SET password_hash = '$2b$12$...' 
WHERE email = 'admin@example.com';
```

4. Clear session and try again:
```bash
docker compose exec redis redis-cli FLUSHDB
```

---

**Symptoms:** Rate limited (429)

**Solution:**
Wait 1 minute, or clear rate limit:
```bash
docker compose exec redis redis-cli KEYS "ratelimit:*" | xargs redis-cli DEL
```

### API Key Not Working

**Symptoms:** 401 Unauthorized

**Solutions:**

1. Check key format:
```bash
# Correct
edk_production_K7mN9pQr...

# Wrong (missing prefix)
K7mN9pQr...
```

2. Check key isn't revoked:
```bash
# List keys in dashboard
# Or query database
SELECT * FROM api_keys WHERE prefix = 'edk_produ';
```

3. Check Authorization header:
```bash
# Correct
Authorization: Bearer edk_production_xxx

# Wrong
Authorization: edk_production_xxx  # Missing "Bearer"
X-API-Key: edk_production_xxx      # Wrong header
```

## Database Issues

### Migration Errors

**Symptoms:**
```
alembic.util.exc.CommandError: Can't locate revision
```

**Solution:**
```bash
# Check current version
alembic current

# Mark as up-to-date
alembic stamp head
```

---

**Symptoms:** Events table too large

**Solutions:**

1. Check partitioning:
```sql
SELECT ensure_event_partitions(3);
```

2. Reduce retention:
```bash
EDICTUM_EVENT_RETENTION_DAYS=30
```

3. Manual cleanup:
```sql
DELETE FROM events WHERE created_at < now() - interval '30 days';
```

## Notification Issues

### Telegram Not Sending

**Solutions:**

1. Verify bot token:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

2. Verify chat ID:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
# Send a message to the bot first
```

3. Check webhook is registered:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Slack Not Sending

**Solutions:**

1. Test webhook:
```bash
curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test"}'
```

2. Check app has correct scopes

3. Verify interactivity is enabled

### Webhook Failing

**Symptoms:** "URL resolves to blocked network"

**Solution:**
The URL points to an internal IP. Either:
1. Use a public URL
2. Or enable localhost (development only):
```bash
EDICTUM_ALLOW_LOCALHOST_WEBHOOKS=true
```

## Performance Issues

### Slow Dashboard

**Solutions:**

1. Check event count:
```sql
SELECT count(*) FROM events WHERE created_at > now() - interval '24 hours';
```

2. Add time filter to queries

3. Reduce query limit:
```bash
GET /api/v1/events?limit=50
```

### High Memory Usage

**Solutions:**

1. Reduce connection pool:
```bash
EDICTUM_DB_POOL_SIZE=5
EDICTUM_DB_MAX_OVERFLOW=10
```

2. Reduce Redis connections:
```bash
EDICTUM_REDIS_MAX_CONNECTIONS=20
```

### High CPU Usage

**Solutions:**

1. Check slow queries:
```sql
SELECT * FROM pg_stat_statements 
ORDER BY total_exec_time DESC LIMIT 10;
```

2. Add missing indexes

3. Scale horizontally

## Agent Connection Issues

### Agent Can't Connect

**Solutions:**

1. Test connectivity:
```bash
curl https://console.example.com/api/v1/health
```

2. Check API key:
```python
# In your agent
print(f"Using key: {api_key[:15]}...")
```

3. Check agent ID is unique

### Events Not Appearing

**Solutions:**

1. Check agent is sending:
```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)
```

2. Check SSE connection:
```bash
curl -N https://console.example.com/api/v1/stream \
  -H "Authorization: Bearer edk_xxx"
```

3. Check filters:
```bash
# Try without filters
GET /api/v1/events?limit=10
```

## Logs

### Viewing Logs

```bash
# Docker Compose
docker compose logs -f server

# Filter for errors
docker compose logs server | grep ERROR

# Last 100 lines
docker compose logs --tail=100 server
```

### Log Levels

```bash
# More verbose
EDICTUM_LOG_LEVEL=DEBUG

# JSON format for aggregation
EDICTUM_LOG_FORMAT=json
```

### Common Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| `Bootstrapped admin user` | First run, admin created | Expected |
| `Failed to load notification channels` | Database issue | Check DB connection |
| `Session not found` | Expired or invalid session | Re-login |
| `API key not found` | Revoked or invalid key | Check key status |

## Getting Help

1. Check this troubleshooting guide
2. Search [GitHub Issues](https://github.com/acartag7/edictum-console/issues)
3. Join community Discord
4. Email support@edictum.dev

When reporting issues, include:

- Console version
- Environment (Docker, Kubernetes, etc.)
- Error messages
- Relevant logs
- Steps to reproduce
