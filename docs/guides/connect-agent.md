# Connect an Agent

How to connect your AI agent to Edictum Console.

## Prerequisites

- Edictum Console running (see [Quickstart](../quickstart.md))
- API key created in dashboard
- Python 3.10+

## Installation

```bash
pip install edictum[server]
```

## Basic Connection

```python
import edictum
from edictum.backends.server import EdictumServerClient, ServerBackend

# Create client
client = EdictumServerClient(
    base_url="https://console.example.com",
    api_key="edk_production_K7mN9pQr2sT4vWxY",
    agent_id="my-agent-001"
)

# Create guard with server backend
guard = edictum.Edictum.from_yaml(
    "contracts.yaml",
    backend=ServerBackend(client)
)
```

## Tool Decoration

```python
@guard.tool("read_file")
def read_file(path: str) -> str:
    """Read a file from disk."""
    with open(path) as f:
        return f.read()

@guard.tool("write_file")
def write_file(path: str, content: str) -> None:
    """Write content to a file."""
    with open(path, 'w') as f:
        f.write(content)

@guard.tool("http_request", mode="enforce")
async def http_request(url: str, method: str = "GET") -> dict:
    """Make an HTTP request."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url)
        return {"status": resp.status_code, "body": resp.text}
```

## Wrapping an Agent

```python
@guard.guardrails
async def my_agent(user_input: str) -> str:
    """Agent with full guardrails."""
    # All tool calls within are governed
    result = read_file("/data/input.txt")
    # ... process with LLM ...
    write_file("/data/output.txt", processed)
    return "Done"
```

## Session State

Server backend stores session state centrally:

```python
# In your agent loop
for turn in conversation:
    async with guard.session():
        # All tools in this turn share session state
        # Session limits apply across turns
        await agent_step()
```

## Real-Time Contract Updates

```python
from edictum.sources import ServerContractSource

# Create source that watches for updates
source = ServerContractSource(client)

# Watch for changes in background
async def main():
    async with guard.watch(source):
        # Contracts update automatically when deployed
        while True:
            await agent_loop()
```

## Error Handling

```python
from edictum import ContractDenied, ApprovalTimeout

try:
    result = delete_file("/production/important.txt")
except ContractDenied as e:
    print(f"Denied by contract: {e.contract_name}")
    print(f"Reason: {e.reason}")
except ApprovalTimeout:
    print("Approval request timed out")
```

## Approval Workflows

```python
from edictum import ApprovalRequired

try:
    result = delete_file("/production/old-logs.txt")
except ApprovalRequired as e:
    print(f"Approval required: {e.approval_id}")
    # Agent can either:
    # 1. Wait for human decision
    # 2. Proceed with alternative action
    # 3. Inform user and exit
```

## Multiple Environments

```python
# Development
dev_client = EdictumServerClient(
    base_url="https://console.example.com",
    api_key="edk_dev_xxx",
    agent_id="my-agent-dev"
)

# Production
prod_client = EdictumServerClient(
    base_url="https://console.example.com", 
    api_key="edk_production_xxx",
    agent_id="my-agent-prod"
)
```

## Health Check

```python
# Verify connection
async def check_connection():
    try:
        await client.health_check()
        print("Connected to Console")
    except Exception as e:
        print(f"Connection failed: {e}")
```

## Complete Example

```python
import asyncio
import edictum
from edictum.backends.server import EdictumServerClient, ServerBackend
from edictum.sources import ServerContractSource

# Setup
client = EdictumServerClient(
    base_url="http://localhost:8000",
    api_key="edk_production_K7mN9pQr2sT4vWxY",
    agent_id="example-agent"
)

guard = edictum.Edictum.from_yaml(
    "contracts.yaml",
    backend=ServerBackend(client)
)

# Define tools
@guard.tool("read_file")
def read_file(path: str) -> str:
    with open(path) as f:
        return f.read()

@guard.tool("write_file")  
def write_file(path: str, content: str) -> None:
    with open(path, 'w') as f:
        f.write(content)

# Agent loop
async def agent_loop():
    source = ServerContractSource(client)
    
    async with guard.watch(source):
        while True:
            # Get user input
            user_input = input("> ")
            
            # Process with guardrails
            async with guard.session():
                data = read_file("/data/context.txt")
                # ... LLM processing ...
                write_file("/data/result.txt", result)
            
            print("Done")

if __name__ == "__main__":
    asyncio.run(agent_loop())
```

## Next Steps

- [Write contracts](/contracts/yaml-reference/) for your agent
- [Set up notifications](notifications.md) for approval alerts
- [Deploy contracts](deploy-contracts.md) from the dashboard
