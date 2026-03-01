# Multi-Tenancy

Edictum Console supports multiple isolated tenants in a single deployment.

## Overview

Each tenant has completely isolated data:

- API keys
- Contract bundles
- Events and audit logs
- Approval workflows
- Notification channels
- Users and sessions

## Tenant Model

```python
class Tenant(Base):
    id: UUID
    name: str
    slug: str  # URL-friendly identifier
    created_at: datetime
```

## Tenant Resolution

Tenant is resolved differently based on authentication:

### API Key Authentication (Agents)

```python
# API key format: edk_{env}_{random}
# The key is looked up by prefix, tenant resolved from the key record

async def get_current_tenant(
    api_key: ApiKey = Depends(require_api_key)
) -> Tenant:
    return api_key.tenant
```

### Session Authentication (Dashboard)

```python
# Session stores user_id, user has tenant_id

async def get_current_tenant(
    user: User = Depends(require_dashboard_auth)
) -> Tenant:
    return user.tenant
```

## Data Isolation

All queries include tenant filtering:

```python
# Correct — tenant-scoped
await db.execute(
    select(Event)
    .where(Event.tenant_id == tenant.id)
    .order_by(Event.created_at.desc())
    .limit(100)
)

# Incorrect — would leak cross-tenant data (but our middleware prevents this)
await db.execute(select(Event).limit(100))
```

## Creating Tenants

Currently, the default tenant is created during setup. For multi-tenant deployments:

```bash
# Via API (admin only)
POST /api/v1/admin/tenants
{
    "name": "Acme Corp",
    "slug": "acme"
}
```

## User-Tenant Relationship

Each user belongs to exactly one tenant:

```python
class User(Base):
    id: UUID
    tenant_id: UUID  # FK to Tenant
    email: str
    password_hash: str
    is_admin: bool
```

Users can only see data within their tenant.

## Tenant-Specific Configuration

Some settings are per-tenant:

- Notification channels
- Contract bundle versions per environment
- Approval timeout policies

Global settings (admin-only):
- Signing key rotation
- Event retention policies

## Scaling Considerations

PostgreSQL partitioning is per-tenant for large deployments:

```sql
-- Events partitioned by tenant AND time
CREATE TABLE events_tenant_a_2026_03 PARTITION OF events
    FOR VALUES FROM ('tenant-a', '2026-03-01') 
    TO ('tenant-a', '2026-04-01');
```

For smaller deployments, time-based partitioning is sufficient.
