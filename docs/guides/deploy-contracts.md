# Deploy Contracts

Manage and deploy contract bundles from the dashboard.

## Overview

Contract bundles are YAML files that define what agents can and cannot do. Deploy them to environments via the Console dashboard or API.

## Bundle Structure

```yaml
# contracts.yaml
version: "1.0"
metadata:
  name: production-contracts
  description: Contracts for production agents

contracts:
  - name: protect-secrets
    tool: read_file
    mode: enforce
    effect: deny
    preconditions:
      - path matches "**/.env"
      - path matches "**/secrets/**"
  
  - name: production-writes
    tool: write_file
    mode: enforce
    effect: deny
    preconditions:
      - path matches "/production/**"
    unless:
      - principal.role == "admin"
  
  - name: approval-for-deletes
    tool: delete_file
    mode: enforce
    effect: pending_approval
    timeout: 300
```

## Uploading Bundles

### Via Dashboard

1. Navigate to **Contracts**
2. Click **Upload Bundle**
3. Paste YAML or upload file
4. Preview contracts
5. Click **Upload**

### Via API

```bash
POST /api/v1/bundles
Authorization: Bearer edk_production_xxx
Content-Type: application/json

{
    "name": "production-contracts",
    "yaml_content": "... yaml here ..."
}
```

Response:

```json
{
    "name": "production-contracts",
    "version": 3,
    "revision_hash": "abc123...",
    "uploaded_by": "admin@example.com",
    "uploaded_at": "2026-03-01T12:00:00Z"
}
```

## Deploying to Environments

### Via Dashboard

1. Navigate to **Contracts**
2. Find your bundle
3. Click **Deploy**
4. Select environment: `dev`, `staging`, or `production`
5. Review what changes (added/removed/modified contracts)
6. Confirm deployment

### Via API

```bash
POST /api/v1/bundles/production-contracts/3/deploy
Authorization: Bearer edk_production_xxx
Content-Type: application/json

{
    "env": "production"
}
```

## Version History

All versions are stored:

```bash
GET /api/v1/bundles/production-contracts
Authorization: Bearer edk_production_xxx

{
    "name": "production-contracts",
    "versions": [
        {"version": 3, "uploaded_at": "...", "deployed_to": ["production"]},
        {"version": 2, "uploaded_at": "...", "deployed_to": ["staging"]},
        {"version": 1, "uploaded_at": "...", "deployed_to": []}
    ]
}
```

## Diffing Versions

```bash
GET /api/v1/bundles/production-contracts/2/diff/3
Authorization: Bearer edk_production_xxx

{
    "added": [
        {"name": "new-contract", ...}
    ],
    "removed": [
        {"name": "deprecated-contract", ...}
    ],
    "modified": [
        {
            "name": "protect-secrets",
            "old": {...},
            "new": {...}
        }
    ]
}
```

## Hot Reload

When you deploy a bundle:

1. SSE event sent to all connected agents
2. Agents with `ServerContractSource` receive update
3. Contracts swapped atomically
4. No agent restart required

```python
# In your agent
async with guard.watch(source):
    # Contracts update automatically
    while True:
        await agent_loop()
```

## Rollback

```bash
# Deploy previous version
POST /api/v1/bundles/production-contracts/2/deploy
{
    "env": "production"
}
```

Agents immediately receive the rollback.

## Current Deployment Status

```bash
GET /api/v1/deployments
Authorization: Bearer edk_production_xxx

{
    "dev": {
        "bundle": "production-contracts",
        "version": 5,
        "deployed_at": "..."
    },
    "production": {
        "bundle": "production-contracts", 
        "version": 3,
        "deployed_at": "..."
    }
}
```

## Signing

Bundles are automatically signed with Ed25519:

```json
{
    "name": "production-contracts",
    "version": 3,
    "signature_hex": "30440220...",
    "revision_hash": "abc123..."
}
```

Agents can verify signatures (optional but recommended):

```python
guard = edictum.Edictum.from_yaml(
    "contracts.yaml",
    backend=ServerBackend(client),
    verify_signatures=True
)
```

## Best Practices

### Version Control

Store contracts in git alongside code:

```
my-agent/
├── src/
│   └── agent.py
├── contracts/
│   ├── dev.yaml
│   ├── staging.yaml
│   └── production.yaml
└── README.md
```

### CI/CD Integration

```yaml
# .github/workflows/deploy-contracts.yml
on:
  push:
    paths: ['contracts/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to staging
        run: |
          curl -X POST https://console.example.com/api/v1/bundles \
            -H "Authorization: Bearer ${{ secrets.EDICTUM_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"app-contracts\",\"yaml_content\":\"$(cat contracts/staging.yaml | jq -Rs .)\"}"
```

### Gradual Rollout

1. Upload new version
2. Deploy to `dev` first
3. Test with dev agents
4. Deploy to `staging`
5. Monitor for issues
6. Deploy to `production`

### Rollback Plan

Always have the previous version ready:

```bash
# Before deploying, note current version
CURRENT=$(curl -s https://console.example.com/api/v1/deployments | jq '.production.version')

# If issues, rollback
curl -X POST https://console.example.com/api/v1/bundles/app-contracts/$CURRENT/deploy \
  -H "Authorization: Bearer $EDICTUM_API_KEY" \
  -d '{"env":"production"}'
```
