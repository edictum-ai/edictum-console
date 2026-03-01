# Approval Workflows

Human-in-the-loop oversight for agent actions.

## Overview

Some actions are too sensitive to allow automatically. Approval workflows let humans review and approve/deny before execution.

```
Agent requests sensitive action
           │
           ▼
Contract requires approval
           │
           ▼
Approval created, status: pending
           │
           ├─► Notification sent (Slack, Telegram, etc.)
           └─► Dashboard shows pending request
           │
           ▼
Human reviews and decides
           │
           ├─► Approved → Agent executes
           └─► Denied → Agent receives error
           │
           ▼
Audit log records decision
```

## Approval Model

```python
class Approval:
    id: UUID
    tenant_id: UUID
    agent_id: str
    session_id: str
    env: str
    
    tool_name: str
    args: dict           # What the agent wants to do
    
    status: str          # "pending", "approved", "denied", "expired"
    timeout_seconds: int # How long until auto-expire
    
    created_at: datetime
    decided_at: datetime | None
    decided_by: UUID | None  # User who decided
    decision_message: str | None
```

## Requesting Approval

In your contract:

```yaml
contracts:
  - name: sensitive-deletes
    tool: delete_file
    mode: enforce
    effect: pending_approval
    timeout: 300  # 5 minutes
    preconditions:
      - path matches "/production/**"
```

When an agent tries to delete a production file:

1. Contract matches
2. Approval created with `status: pending`
3. Notification sent to configured channels
4. Agent's tool call blocks, waiting for response

## Responding to Approvals

### Via Dashboard

1. Navigate to **Approvals** in the dashboard
2. See list of pending requests
3. Click to view details
4. Click **Approve** or **Deny**
5. Optionally add a message

### Via API

```bash
POST /api/v1/approvals/{approval_id}/decide
Cookie: edictum_session=...

{
    "action": "approve",  # or "deny"
    "message": "Looks safe, proceed"
}
```

### Via Telegram

With Telegram notifications configured:

```
🔔 Approval Request
Agent: agent-1
Tool: delete_file
Path: /production/old-log.txt

[✅ Approve] [❌ Deny]
```

Click the button to respond.

### Via Slack

With Slack notifications configured:

```
🔔 Approval Request
Agent: agent-1
Tool: delete_file

[Approve] [Deny]
```

## Timeout Behavior

Approvals expire after `timeout_seconds`:

```python
# Background worker checks every 10 seconds
async def _approval_timeout_worker():
    expired = await expire_approvals(db)
    for approval in expired:
        # Notify agent of timeout
        push.push_to_agent(approval.agent_id, {
            "type": "approval_timeout",
            "approval_id": approval.id
        })
```

Expired approvals are treated as denied — the agent receives an error.

## Approval Queue

View pending approvals:

```http
GET /api/v1/approvals?status=pending
Authorization: Bearer edk_production_xxx
```

## Audit Trail

All decisions are logged:

- Who decided (user ID)
- When (timestamp)
- What action (approve/deny)
- Optional message

```sql
SELECT * FROM approvals 
WHERE tenant_id = 'xxx'
ORDER BY created_at DESC
LIMIT 50;
```

## Best Practices

### Set Appropriate Timeouts

- Short (60s): Critical, time-sensitive operations
- Medium (300s): Normal operations
- Long (3600s): Low-priority, async workflows

### Use Labels

Tag approvals with context:

```yaml
preconditions:
  - path matches "/production/**"
  
labels:
  severity: high
  requires: senior-admin
```

### Route to Right Channels

```yaml
# High-severity → Slack #incidents
# Normal → Telegram group
# Low-priority → Dashboard only
```

### Delegate Safely

Only users with `approve` permission can respond. Configure roles:

```yaml
roles:
  senior-admin:
    permissions: [approve, deny, deploy]
  operator:
    permissions: [approve, deny]
  viewer:
    permissions: [view]
```
