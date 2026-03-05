# Fleet Monitoring

Monitor connected agents, detect contract drift, and track governance coverage across your fleet.

## Fleet Page

Dashboard > **Agents**.

### Summary Cards

Four cards at the top:

| Card | What it shows |
|------|--------------|
| **Total Agents** | Count of registered agents |
| **Coverage** | Percentage of tools covered by contracts across all agents |
| **Enforced** | Number of agents running in enforce mode |
| **Ungoverned** | Number of agents with at least one ungoverned tool |

### Agent Table

Below the summary cards, a sortable/filterable table of all agents:

- Agent ID
- Environment
- Bundle name
- Policy status (current / drift / unknown)
- Last seen timestamp
- Coverage percentage

Click any agent to open its detail page.

### Ungoverned Tools Sidebar

The right sidebar lists ungoverned tools across the fleet, sorted by agent count. Click a tool name to filter the agent table to agents using that tool without a contract.

## Drift Detection

Drift detection compares each agent's reported policy version against the currently deployed bundle.

### How It Works

1. When an agent connects via SSE, it reports its `policy_version` (the SHA-256 revision hash of its loaded bundle)
2. The console compares this against the `revision_hash` of the latest deployed bundle for that environment
3. Result:

| Status | Meaning |
|--------|---------|
| **Current** | Agent's policy version matches the deployed bundle |
| **Drift** | Agent's policy version doesn't match -- it's running an outdated bundle |
| **Unknown** | No bundle has been deployed for this environment yet |

### Resolving Drift

Drifted agents typically resolve automatically when they receive the next SSE push. If an agent stays in drift:

- Check the agent's SSE connection (is it connected?)
- Check if the agent reconnected after the deployment
- Manually trigger a redeployment from the Contracts page

## Coverage Analysis

Coverage tells you which tools are governed by contracts and which are not.

### Per-Agent Coverage

Each agent's tools are classified into three categories:

| Category | Meaning |
|----------|---------|
| **Enforced** | A contract in enforce mode covers this tool |
| **Observed** | A contract in observe/report mode covers this tool (logged but not enforced) |
| **Ungoverned** | No contract covers this tool at all |

Coverage percentage = (enforced + observed) / total tools.

### Fleet Coverage

```
GET /api/v1/agents/fleet-coverage
```

Aggregated coverage across all agents. Returns total agents, fleet-wide coverage percentage, and the list of ungoverned tools with agent counts.

Fleet coverage is cached in Redis for 60 seconds.

## Agent Detail Page

Dashboard > **Agents** > click an agent.

URL: `/dashboard/agents/:agentId`

### Coverage Tab

Tool-by-tool breakdown showing:
- Tool name
- Coverage status (enforced / observed / ungoverned)
- Contract name (if covered)
- Mode (enforce / observe)

### Analytics Tab

Time-series data for the agent:
- Tool call volume
- Deny rate
- Approval request count

### History Tab

Timeline of contract changes and drift events:
- When bundles were assigned
- When drift was detected
- When drift was resolved

## Time Windows

All time-based views support these windows:

| Window | Description |
|--------|-------------|
| 1h | Last hour |
| 6h | Last 6 hours |
| 24h | Last 24 hours |
| 7d | Last 7 days |
| 30d | Last 30 days |

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/agents/status` | Cookie | Live status of all connected agents (with drift check) |
| `GET /api/v1/agents/{agent_id}/coverage` | Cookie | Per-agent tool coverage |
| `GET /api/v1/agents/{agent_id}/history` | Cookie | Agent contract change timeline |
| `GET /api/v1/agents/fleet-coverage` | Cookie | Fleet-wide coverage summary |

## Next Steps

- [Connecting Agents](connecting-agents.md) -- connect more agents to the fleet
- [Agent Assignment](agent-assignment.md) -- route bundles to agents with rules
- [Managing Contracts](managing-contracts.md) -- deploy contracts to resolve ungoverned tools
