# Webhook Setup

Send approval notifications to any HTTP endpoint. One-way notifications -- no interactive approve/deny.

## Add the Channel

Dashboard > **Settings** > **Notifications** > **Add Channel** > **Webhook**.

| Field | Required | Description |
|-------|----------|-------------|
| URL | Yes | HTTPS endpoint that receives POST requests |
| Secret | No | HMAC-SHA256 secret for payload verification |

## Payload Format

When an agent requests approval, the console sends a POST request:

```http
POST https://your-endpoint.com/webhook
Content-Type: application/json
X-Edictum-Signature: sha256=abc123...

{
  "approval_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": "prod-agent",
  "tool_name": "run_command",
  "tool_args": {"command": "rm -rf /tmp/cache"},
  "message": "Destructive command requires approval",
  "env": "production",
  "timeout_seconds": 300
}
```

## Signature Verification

If you configure a secret, every request includes an `X-Edictum-Signature` header. The signature is an HMAC-SHA256 hash of the request body using your secret.

Verify it on your end:

```python
import hmac
import hashlib

def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    received = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)
```

## Example Receiver

A minimal FastAPI webhook receiver:

```python
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
SECRET = "your-webhook-secret"

@app.post("/webhook")
async def handle_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Edictum-Signature", "")

    if not verify_signature(body, signature, SECRET):
        raise HTTPException(403, "Invalid signature")

    data = await request.json()
    print(f"Approval needed: {data['agent_id']} wants to call {data['tool_name']}")
    # Forward to PagerDuty, OpsGenie, your internal system, etc.
    return {"ok": True}
```

## Use Cases

Webhooks are useful for integrating with systems that don't have a dedicated channel type:

- Forward to PagerDuty or OpsGenie for on-call routing
- Post to Microsoft Teams via incoming webhook
- Trigger a CI/CD pipeline
- Log to a SIEM
- Send to a custom internal dashboard

## Test

Click **Test** in the dashboard or call:

```
POST /api/v1/notifications/channels/{id}/test
```

A test payload is sent to your URL. Check that your endpoint receives it and responds with a 2xx status.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test fails with connection error | Verify the URL is reachable from the console server |
| Signature mismatch | Verify you're using the raw request body (not parsed JSON) for HMAC |
| No requests received | Check firewall rules -- the console server must be able to reach your endpoint |
| Timeout on test | Your endpoint must respond within 10 seconds |

## Next Steps

- [Notification Overview](overview.md) -- routing filters and channel management
- [Email Setup](email.md) -- add email notifications
