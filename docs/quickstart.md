# Quickstart

Get Edictum Console running in 5 minutes with Docker.

## Prerequisites

- Docker and Docker Compose
- (Optional) `edictum` Python library if you want to connect an agent

## 1. Clone and Start

```bash
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console
cp .env.example .env
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Edictum Console server (port 8000)

## 2. Create Admin Account

Visit http://localhost:8000/dashboard/setup and create your admin account.

Or set environment variables for automatic bootstrap:

```bash
export EDICTUM_ADMIN_EMAIL=admin@example.com
export EDICTUM_ADMIN_PASSWORD="your-secure-password-min-12-chars"
docker compose up -d
```

## 3. Log In

Visit http://localhost:8000/dashboard and log in with your credentials.

## 4. Create an API Key

1. Navigate to **Settings** → **API Keys**
2. Click **Create Key**
3. Select environment (e.g., `production`)
4. Optionally add a label
5. Copy the key — it's shown only once!

The key format is: `edk_{env}_{random}`

Example: `edk_production_K7mN9pQr2sT4vWxY`

## 5. Connect an Agent

Install edictum with server support:

```bash
pip install edictum[server]
```

Create a simple agent:

```python
import edictum
from edictum.backends.server import EdictumServerClient, ServerBackend

# Connect to console
client = EdictumServerClient(
    base_url="http://localhost:8000",
    api_key="edk_production_K7mN9pQr2sT4vWxY",  # Your key from step 4
    agent_id="my-agent-001"
)

# Load contracts with server backend
guard = edictum.Edictum.from_yaml(
    "contracts.yaml",
    backend=ServerBackend(client)
)

# Use in your agent
@guard.tool("read_file")
def read_file(path: str) -> str:
    with open(path) as f:
        return f.read()

# Or wrap your entire agent
@guard.guardrails
async def my_agent():
    # Agent logic here
    pass
```

## 6. Verify Connection

1. In the dashboard, go to **Fleet**
2. You should see your agent `my-agent-001` listed
3. Trigger a tool call in your agent
4. Watch it appear in the **Feed** in real-time

## Next Steps

- [Deploy contracts](guides/deploy-contracts.md) to manage what agents can do
- [Set up notifications](guides/notifications.md) for Slack or Telegram alerts
- [Configure for production](deploy/production.md)

## Without Docker (Development)

```bash
# Backend
pip install -e ".[dev]"
cp .env.example .env
# Edit .env with your database URLs
alembic upgrade head
uvicorn edictum_server.main:app --reload

# Frontend (separate terminal)
cd dashboard
pnpm install
pnpm dev
```

The API runs on http://localhost:8000 and the dev frontend on http://localhost:5173.
