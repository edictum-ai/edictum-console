# Event Pipeline

How agent events flow through Edictum Console.

## Overview

Every tool call from an agent generates an event:

```
Agent calls tool
      │
      ▼
Edictum evaluates contracts
      │
      ├─► Allowed → Tool executes
      └─► Denied → Tool blocked
      │
      ▼
Event sent to Console
      │
      ├─► Stored in PostgreSQL
      ├─► Pushed to SSE stream
      └─► Triggered notifications (if configured)
      │
      ▼
Dashboard shows in real-time
```

## Event Structure

```python
class Event:
    id: UUID
    tenant_id: UUID
    agent_id: str
    session_id: str | None
    env: str
    
    tool_name: str
    args: dict          # Sanitized (secrets redacted)
    result: str | None  # Truncated if too long
    
    action: str         # "allowed", "denied", "observed"
    reason: str | None  # Which contract denied
    
    created_at: datetime
```

## Event Ingestion

Agents send events via HTTP:

```python
# In edictum.backends.server
async def _send_event(self, event: dict) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{self.base_url}/api/v1/events",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"events": [event]}
        )
```

Batching is supported:

```json
POST /api/v1/events
{
    "events": [
        {"agent_id": "agent-1", "tool_name": "read_file", ...},
        {"agent_id": "agent-1", "tool_name": "write_file", ...}
    ]
}
```

## Storage

Events are stored in PostgreSQL with time-based partitioning:

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args JSONB,
    result TEXT,
    action TEXT NOT NULL,
    reason TEXT
) PARTITION BY RANGE (created_at);

-- Daily partitions created automatically
CREATE TABLE events_2026_03_01 PARTITION OF events
    FOR VALUES FROM ('2026-03-01') TO ('2026-03-02');
```

Partition management runs automatically:

```python
async def _partition_worker():
    # Runs daily
    await db.execute(text("SELECT ensure_event_partitions(3)"))
```

## Real-Time Streaming

Server-Sent Events (SSE) for live dashboard updates:

```http
GET /api/v1/stream
Authorization: Bearer edk_production_xxx
Accept: text/event-stream

event: tool_call
data: {"agent_id": "agent-1", "tool_name": "read_file", ...}

event: approval_request  
data: {"approval_id": "uuid", "tool_name": "delete_file", ...}
```

### Subscription Filtering

Agents subscribe to their own events:

```http
GET /api/v1/stream?agent_id=agent-1
```

Dashboard subscribes to all tenant events:

```http
GET /api/v1/stream?dashboard=true
Cookie: edictum_session=...
```

## Querying Events

```http
GET /api/v1/events?agent_id=agent-1&env=production&limit=100
Authorization: Bearer edk_production_xxx
```

Filters:
- `agent_id` — Filter by agent
- `env` — Filter by environment
- `action` — Filter by allowed/denied
- `tool_name` — Filter by tool
- `from` / `to` — Time range
- `limit` — Max results (default: 100)

## Retention

Configure retention via environment:

```bash
EDICTUM_EVENT_RETENTION_DAYS=90
```

Retention cleanup runs daily:

```python
async def _retention_worker():
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    await db.execute(
        delete(Event).where(Event.created_at < cutoff)
    )
```

## Performance

For high-volume agents:

- Batch events (up to 100 per request)
- Use connection pooling
- Partition pruning for time-range queries
- Index on `(tenant_id, agent_id, created_at)`

Example query plan:

```sql
EXPLAIN SELECT * FROM events 
WHERE tenant_id = 'xxx' 
AND agent_id = 'agent-1' 
AND created_at > '2026-03-01';

-- Uses: events_2026_03_01 (partition scan)
-- + idx_events_tenant_agent (index scan)
```
