# Connecting Agents

Connect your Python agents to Edictum Console for live contract updates, audit event streaming, and human-in-the-loop approvals.

## Install the SDK

```bash
pip install edictum[server]
```

Requires Python 3.11+. The `[server]` extra adds the SDK classes that communicate with the console.

## Connect with `from_server()`

```python
from edictum import Edictum

guard = await Edictum.from_server(
    url="http://localhost:8000",             # Console URL
    api_key="edk_production_CZxKQvN3mHz...", # From Dashboard > API Keys
    agent_id="my-agent",                     # Unique identifier for this agent
    env="production",                        # Environment (must match API key scope)
    bundle_name="my-contracts",              # Bundle to subscribe to (optional)
    tags={"team": "platform", "tier": "1"},  # Tags for assignment rules (optional)
)

# Use guard.run() exactly like local edictum
result = await guard.run("read_file", {"path": "data.csv"}, read_file)
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `url` | Yes | Console base URL |
| `api_key` | Yes | API key from the dashboard (e.g. `edk_production_...`) |
| `agent_id` | Yes | Unique identifier for this agent instance |
| `env` | No | Environment name (should match the API key's scope). Defaults to `None`. |
| `bundle_name` | No | Specific bundle to subscribe to. If omitted, resolved via assignment rules. |
| `tags` | No | Dict of key-value tags for assignment rule matching |

## What Happens on Connect

1. **Agent registers** -- the SDK sends a registration request. The console creates or updates the agent's record in `agent_registrations` with its metadata, tags, and last-seen timestamp.

2. **Bundle fetch** -- the SDK calls `GET /api/v1/bundles/{name}/current?env={env}` to fetch the currently deployed contract bundle. The response includes the YAML (base64-encoded) and Ed25519 signature.

3. **SSE subscription** -- the SDK opens a persistent connection to `GET /api/v1/stream`. It receives `contract_update` events when contracts are redeployed, and `assignment_changed` events when the agent's bundle assignment changes.

4. **Audit sink starts** -- the `ServerAuditSink` begins batching tool call events and posting them to `POST /api/v1/events`.

5. **Approval backend ready** -- the `ServerApprovalBackend` is configured to create and poll approvals via the console API.

## SDK Classes

The `from_server()` call configures these components internally:

| Class | Purpose | Key Settings |
|-------|---------|-------------|
| `EdictumServerClient` | HTTP client for all API calls | `timeout=30`, `max_retries=3` |
| `ServerAuditSink` | Batched event ingestion | `batch_size=50`, `flush_interval=5.0s`, `max_buffer_size=10000` |
| `ServerApprovalBackend` | HITL approval create + poll | `poll_interval=2.0s` |
| `ServerBackend` | Server-side session state | Key-value store, atomic increment |
| `ServerContractSource` | SSE contract subscription | `reconnect_delay=1.0s`, `max_reconnect_delay=60.0s` |

## Graceful Fallback

If the console is unreachable on startup, fall back to local contracts:

```python
from edictum import Edictum

try:
    guard = await Edictum.from_server(
        url="http://localhost:8000",
        api_key="edk_production_CZxKQvN3mHz...",
        agent_id="my-agent",
        env="production",
    )
except Exception:
    # Server down — use local contracts
    guard = Edictum.from_yaml("contracts.yaml")
```

**Important:** Edictum fails closed. If the server becomes unreachable _after_ connection, errors propagate and tool calls are denied. The agent never silently passes when the server is down.

## Multiple Agents

Each agent needs a unique `agent_id`. The API key can be shared across agents in the same environment:

```python
# Agent 1
guard_1 = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_CZxKQvN3mHz...",
    agent_id="research-agent",
    env="production",
)

# Agent 2
guard_2 = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_CZxKQvN3mHz...",
    agent_id="ops-agent",
    env="production",
)
```

Both agents appear separately in the dashboard's Agents page.

## Tags for Assignment Rules

Tags are key-value pairs attached to the agent registration. Assignment rules can match on tags to route specific bundles:

```python
guard = await Edictum.from_server(
    url="http://localhost:8000",
    api_key="edk_production_CZxKQvN3mHz...",
    agent_id="prod-platform-agent",
    env="production",
    tags={"team": "platform", "tier": "1", "region": "us-east"},
)
```

See [Agent Assignment](agent-assignment.md) for how to create rules that match on tags.

## Framework Integration

After connecting, use the guard with any supported framework adapter. The adapter API is identical to local edictum:

```python
# LangChain
from edictum.adapters.langchain import LangChainAdapter
adapter = LangChainAdapter(guard)
tool_node = ToolNode(tools=tools, wrap_tool_call=adapter.as_tool_wrapper())

# CrewAI
from edictum.adapters.crewai import CrewAIAdapter
adapter = CrewAIAdapter(guard)
adapter.register()

# OpenAI Agents SDK
from edictum.adapters.openai_agents import OpenAIAgentsAdapter
adapter = OpenAIAgentsAdapter(guard)
input_gr, output_gr = adapter.as_guardrails()
```

All seven adapters work with server-connected guards. See the [edictum adapter docs](https://docs.edictum.dev/adapters/overview) for details.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401 Unauthorized` on connect | API key is invalid or revoked. Create a new one in Dashboard > API Keys. |
| Agent shows "Last Seen: never" | Check that events are being sent -- the SDK needs `guard.run()` calls to generate events. |
| Bundle not found on connect | Deploy a bundle first in Dashboard > Contracts > Bundles. Or set `bundle_name` to match an existing bundle. |
| SSE disconnects frequently | Check network stability. The SDK reconnects automatically with exponential backoff (1s to 60s). |
| `env` mismatch error | The `env` parameter must match the API key's environment scope (e.g. `edk_production_...` requires `env="production"`). |

## Next Steps

- [Managing Contracts](managing-contracts.md) -- create and deploy contracts from the dashboard
- [Agent Assignment](agent-assignment.md) -- route bundles to agents with rules and patterns
- [Fleet Monitoring](fleet-monitoring.md) -- monitor connected agents and coverage
