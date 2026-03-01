# Manage API Keys

Create, rotate, and revoke API keys for agent authentication.

## Overview

API keys authenticate agents (not humans) to Edictum Console. Each key is scoped to an environment and tenant.

## Key Format

```
edk_{env}_{random}
```

Example: `edk_production_K7mN9pQr2sT4vWxYz1A3B5C7`

- `edk_` — Prefix identifying Edictum keys
- `{env}` — Environment (dev, staging, production)
- `{random}` — 32+ character random string

## Creating Keys

### Via Dashboard

1. Navigate to **Settings** → **API Keys**
2. Click **Create Key**
3. Select environment
4. Optionally add a label
5. Click **Generate**
6. **Copy the key immediately** — it's shown only once!

### Via API

```bash
POST /api/v1/keys
Cookie: edictum_session=...

{
    "env": "production",
    "label": "Agent-X production key"
}

Response:
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "key": "edk_production_K7mN9pQr2sT4vWxYz1A3B5C7",
    "prefix": "edk_produ",
    "env": "production",
    "label": "Agent-X production key",
    "created_at": "2026-03-01T12:00:00Z"
}
```

## Listing Keys

```bash
GET /api/v1/keys
Authorization: Bearer edk_production_xxx

Response:
{
    "keys": [
        {
            "id": "550e8400-...",
            "prefix": "edk_produ",
            "env": "production",
            "label": "Agent-X production key",
            "created_at": "2026-03-01T12:00:00Z",
            "last_used_at": "2026-03-01T14:30:00Z"
        }
    ]
}
```

Note: Full keys are never returned — only the prefix.

## Key Security

### Storage

Keys are stored as bcrypt hashes:

```python
# Database stores:
key_hash = bcrypt.hash(full_key, salt)

# Lookup by prefix (first 9 chars)
prefix = full_key[:9]  # "edk_produ"
```

### Verification

```python
# On each request:
1. Extract prefix from Authorization header
2. Look up key by prefix + tenant
3. Verify bcrypt hash of full key
4. Update last_used_at
5. Allow request
```

### Revocation

Revoked keys immediately return 401:

```bash
DELETE /api/v1/keys/{key_id}
Cookie: edictum_session=...

# Next request with that key:
GET /api/v1/events
Authorization: Bearer edk_production_xxx

Response: 401 Unauthorized
```

## Rotating Keys

Best practice: rotate keys periodically.

### Rotation Process

1. Create new key
2. Update agent configuration with new key
3. Restart agent (or hot-reload config)
4. Verify new key works
5. Revoke old key

```bash
# 1. Create new key
NEW_KEY=$(curl -s -X POST https://console.example.com/api/v1/keys \
  -H "Cookie: edictum_session=..." \
  -d '{"env":"production","label":"Agent-X v2"}' | jq -r '.key')

# 2. Update agent
sed -i "s/EDICTUM_API_KEY=.*/EDICTUM_API_KEY=$NEW_KEY/" .env

# 3. Restart agent
systemctl restart my-agent

# 4. Verify (check logs)
journalctl -u my-agent -f

# 5. Revoke old key
curl -X DELETE https://console.example.com/api/v1/keys/{old_key_id} \
  -H "Cookie: edictum_session=..."
```

## Environment Separation

Use different keys for different environments:

```bash
# Development
EDICTUM_API_KEY=edk_dev_abc123...

# Staging  
EDICTUM_API_KEY=edk_staging_def456...

# Production
EDICTUM_API_KEY=edk_production_ghi789...
```

This allows different contracts per environment and limits blast radius.

## Key Labels

Add meaningful labels to track key usage:

| Label | Environment | Purpose |
|-------|-------------|---------|
| `agent-x-prod` | production | Agent X main key |
| `agent-x-worker-1` | production | Agent X worker #1 |
| `analytics` | staging | Analytics pipeline |

## Monitoring Key Usage

```bash
# Check last used
GET /api/v1/keys/{key_id}
{
    "last_used_at": "2026-03-01T14:30:00Z"
}

# Keys not used in 30 days might be stale
# Consider revoking unused keys
```

## Best Practices

### Do

- Use one key per agent/service
- Rotate keys every 90 days
- Use descriptive labels
- Revoke keys immediately when compromised
- Use environment-specific keys

### Don't

- Share keys between agents
- Store keys in git
- Use production keys in dev
- Skip rotation
- Leave unused keys active

## Troubleshooting

### Key Not Working

1. Check key format: `edk_{env}_{random}`
2. Verify environment matches
3. Check key hasn't been revoked
4. Verify Authorization header format: `Bearer edk_xxx`

### Permission Denied

Keys are tenant-scoped. If you get 403:

1. Verify key belongs to correct tenant
2. Check tenant has access to resource
3. Contact admin for permissions
