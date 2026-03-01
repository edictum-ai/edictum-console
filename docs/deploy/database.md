# Database

Database setup and management for Edictum Console.

## PostgreSQL

### Requirements

- PostgreSQL 14+
- `pgcrypto` extension (for UUID generation)

### Connection URL

```bash
EDICTUM_DATABASE_URL=postgresql+asyncpg://user:password@host:5432/database
```

### Schema

```sql
-- Core tables
tenants         -- Multi-tenant isolation
users           -- Dashboard users
api_keys        -- Agent authentication (bcrypt hashed)
contract_bundles -- YAML contracts
deployments     -- Which bundle version is deployed where
events          -- Audit log (partitioned)
approvals       -- Human-in-the-loop requests
notification_channels -- Alert configuration
```

### Partitioning

Events are partitioned by time for performance:

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    ...
) PARTITION BY RANGE (created_at);

-- Daily partitions created automatically
CREATE TABLE events_2026_03_01 PARTITION OF events
    FOR VALUES FROM ('2026-03-01') TO ('2026-03-02');
```

Partition maintenance runs daily:

```sql
-- Ensures 3 months of future partitions
SELECT ensure_event_partitions(3);
```

### Migrations

```bash
# Run migrations
alembic upgrade head

# Check current version
alembic current

# Create new migration
alembic revision --autogenerate -m "description"
```

### Connection Pooling

```bash
EDICTUM_DB_POOL_SIZE=10
EDICTUM_DB_MAX_OVERFLOW=20
```

For high-traffic deployments, use PgBouncer:

```bash
EDICTUM_DATABASE_URL=postgresql+asyncpg://user:pass@pgbouncer:6432/edictum
```

### Managed Services

Recommended managed PostgreSQL providers:

| Provider | Notes |
|----------|-------|
| Neon | Serverless, auto-scaling |
| AWS RDS | Managed, configurable |
| Google Cloud SQL | Managed, integrated |
| Azure Database | Managed, integrated |
| Railway | Simple, developer-friendly |

### Self-Hosted

```yaml
# docker-compose.yml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: edictum
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: edictum
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U edictum"]
    interval: 5s
    timeout: 5s
    retries: 5
```

### TLS

Enable TLS for production:

```bash
EDICTUM_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db?ssl=require
```

### Backups

#### Managed

Most managed services provide automated backups.

#### Self-Hosted

```bash
# Backup
docker compose exec postgres pg_dump -U edictum edictum > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U edictum edictum
```

Automated backup script:

```bash
#!/bin/bash
# Run daily via cron
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d)
docker compose exec postgres pg_dump -U edictum edictum | \
  gzip > $BACKUP_DIR/edictum-$DATE.sql.gz

# Keep last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

## SQLite (Development Only)

For local development:

```bash
EDICTUM_DATABASE_URL=sqlite+aiosqlite:///./edictum.db
```

⚠️ **Not recommended for production.** No concurrent writes, no partitioning.

## Performance

### Indexes

Key indexes are auto-created:

```sql
CREATE INDEX idx_events_tenant_created ON events(tenant_id, created_at);
CREATE INDEX idx_events_agent ON events(tenant_id, agent_id);
CREATE INDEX idx_approvals_status ON approvals(tenant_id, status);
```

### Query Optimization

```sql
-- Partition pruning for time ranges
EXPLAIN SELECT * FROM events 
WHERE tenant_id = 'xxx' 
AND created_at > '2026-03-01';
-- Uses only events_2026_03_* partitions
```

### Monitoring

```sql
-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check active connections
SELECT count(*) FROM pg_stat_activity;
```
