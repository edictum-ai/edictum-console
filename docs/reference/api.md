# API Endpoints

Complete reference for Edictum Console API.

## Authentication

### Dashboard Auth (Cookie)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
    "email": "user@example.com",
    "password": "secure-password"
}

Response:
Set-Cookie: edictum_session=...; HttpOnly; Secure
{
    "id": "uuid",
    "email": "user@example.com",
    "tenant_id": "uuid",
    "is_admin": false
}
```

### API Auth (Bearer Token)

```http
GET /api/v1/events
Authorization: Bearer edk_production_xxx
```

---

## Auth Endpoints

### POST /api/v1/auth/login

Login with email and password.

**Request:**
```json
{
    "email": "user@example.com",
    "password": "secure-password"
}
```

**Response:** `200 OK`
```json
{
    "id": "uuid",
    "email": "user@example.com",
    "tenant_id": "uuid",
    "is_admin": false
}
```

**Errors:**
- `401` — Invalid credentials
- `429` — Rate limited (too many attempts)

### POST /api/v1/auth/logout

Logout current session.

**Response:** `200 OK`

### GET /api/v1/auth/me

Get current user info.

**Response:** `200 OK`
```json
{
    "id": "uuid",
    "email": "user@example.com",
    "tenant_id": "uuid",
    "is_admin": false
}
```

### POST /api/v1/setup

First-run setup (creates admin user). Only available when no users exist.

**Request:**
```json
{
    "email": "admin@example.com",
    "password": "secure-password",
    "tenant_name": "My Organization"
}
```

**Response:** `200 OK`

---

## API Key Endpoints

### GET /api/v1/keys

List API keys for current tenant.

**Response:** `200 OK`
```json
{
    "keys": [
        {
            "id": "uuid",
            "prefix": "edk_produ",
            "env": "production",
            "label": "Agent key",
            "created_at": "2026-03-01T00:00:00Z",
            "last_used_at": "2026-03-01T12:00:00Z"
        }
    ]
}
```

### POST /api/v1/keys

Create a new API key.

**Request:**
```json
{
    "env": "production",
    "label": "My Agent Key"
}
```

**Response:** `200 OK`
```json
{
    "id": "uuid",
    "key": "edk_production_K7mN9pQr...",  // Full key shown ONCE
    "prefix": "edk_produ",
    "env": "production",
    "label": "My Agent Key",
    "created_at": "2026-03-01T00:00:00Z"
}
```

### DELETE /api/v1/keys/{key_id}

Revoke an API key.

**Response:** `204 No Content`

---

## Bundle Endpoints

### GET /api/v1/bundles

List all bundles with versions.

**Response:** `200 OK`
```json
{
    "bundles": [
        {
            "name": "production-contracts",
            "latest_version": 3,
            "versions": [1, 2, 3]
        }
    ]
}
```

### POST /api/v1/bundles

Upload a new bundle version.

**Request:**
```json
{
    "name": "production-contracts",
    "yaml_content": "version: '1.0'\n..."
}
```

**Response:** `200 OK`
```json
{
    "name": "production-contracts",
    "version": 4,
    "revision_hash": "abc123...",
    "signature_hex": "3044...",
    "uploaded_by": "user@example.com",
    "uploaded_at": "2026-03-01T00:00:00Z"
}
```

### GET /api/v1/bundles/{name}

Get bundle details with all versions.

### GET /api/v1/bundles/{name}/{version}

Get specific bundle version.

### GET /api/v1/bundles/{name}/{version}/yaml

Download YAML content.

**Response:** `200 OK` (text/yaml)

### POST /api/v1/bundles/{name}/{version}/deploy

Deploy bundle to environment.

**Request:**
```json
{
    "env": "production"
}
```

**Response:** `200 OK`
```json
{
    "deployed": true,
    "env": "production",
    "version": 4,
    "deployed_at": "2026-03-01T00:00:00Z"
}
```

---

## Event Endpoints

### GET /api/v1/events

Query events.

**Query Parameters:**
- `agent_id` — Filter by agent
- `env` — Filter by environment
- `action` — Filter by action (allowed, denied)
- `tool_name` — Filter by tool
- `from` — Start time (ISO 8601)
- `to` — End time (ISO 8601)
- `limit` — Max results (default: 100)

**Response:** `200 OK`
```json
{
    "events": [
        {
            "id": "uuid",
            "agent_id": "agent-1",
            "tool_name": "read_file",
            "args": {"path": "/data/file.txt"},
            "action": "allowed",
            "created_at": "2026-03-01T00:00:00Z"
        }
    ],
    "has_more": true
}
```

### POST /api/v1/events

Ingest events (from agents).

**Request:**
```json
{
    "events": [
        {
            "agent_id": "agent-1",
            "session_id": "session-uuid",
            "env": "production",
            "tool_name": "read_file",
            "args": {"path": "/data/file.txt"},
            "action": "allowed"
        }
    ]
}
```

**Response:** `200 OK`

### GET /api/v1/stream

SSE stream for real-time events.

**Headers:**
```
Accept: text/event-stream
Authorization: Bearer edk_production_xxx
```

**Response:** (text/event-stream)
```
event: tool_call
data: {"agent_id":"agent-1","tool_name":"read_file",...}

event: bundle_deployed
data: {"bundle":"production-contracts","version":4}
```

---

## Approval Endpoints

### GET /api/v1/approvals

List approvals.

**Query Parameters:**
- `status` — pending, approved, denied, expired
- `agent_id` — Filter by agent
- `limit` — Max results

### POST /api/v1/approvals/{id}/decide

Make approval decision.

**Request:**
```json
{
    "action": "approve",  // or "deny"
    "message": "Looks safe"
}
```

**Response:** `200 OK`
```json
{
    "id": "uuid",
    "status": "approved",
    "decided_at": "2026-03-01T00:00:00Z",
    "decided_by": "user@example.com"
}
```

---

## Notification Endpoints

### GET /api/v1/notifications/channels

List notification channels.

### POST /api/v1/notifications/channels

Create notification channel.

**Request:**
```json
{
    "name": "Team Slack",
    "channel_type": "slack",
    "config": {
        "webhook_url": "https://hooks.slack.com/..."
    },
    "filters": {
        "environments": ["production"]
    }
}
```

### POST /api/v1/notifications/channels/{id}/test

Test notification channel.

**Response:** `200 OK`
```json
{
    "success": true,
    "message": "Notification sent"
}
```

---

## Health Endpoints

### GET /api/v1/health

Basic health check.

**Response:** `200 OK`
```json
{"status": "ok"}
```

### GET /api/v1/health/ready

Readiness check (verifies DB + Redis).

**Response:** `200 OK`
```json
{
    "status": "ready",
    "checks": {
        "database": "ok",
        "redis": "ok"
    }
}
```

---

## Stats Endpoints

### GET /api/v1/stats

Aggregate statistics.

**Response:** `200 OK`
```json
{
    "agents": {
        "total": 5,
        "active_24h": 3
    },
    "events": {
        "total": 15420,
        "denied": 42,
        "24h": 1250
    },
    "approvals": {
        "pending": 2,
        "approved_24h": 8,
        "denied_24h": 1
    }
}
```
