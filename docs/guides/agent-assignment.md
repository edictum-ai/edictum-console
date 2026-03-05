# Agent Assignment

Route specific contract bundles to specific agents. Three-level resolution system with pattern-based rules.

## How Bundle Resolution Works

When an agent connects, the console determines which bundle to serve using three sources in priority order:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | **Explicit assignment** | `bundle_name` set directly on the agent registration in the dashboard |
| 2 | **Assignment rules** | Pattern-matching rules evaluated in priority order |
| 3 (lowest) | **Agent-provided** | `bundle_name` parameter the agent sends on SSE connect |

The first match wins. If nothing matches, the agent connects without a bundle.

## Explicit Assignment

Set a bundle directly on an agent:

Dashboard > **Agents** > select an agent > **Assign Bundle**.

Or via API:

```
PATCH /api/v1/agent-registrations/{agent_id}
{"bundle_name": "production-safety"}
```

This overrides all rules and agent-provided values.

### Bulk Assignment

Assign one bundle to many agents at once:

```
POST /api/v1/agent-registrations/bulk-assign
{
  "agent_ids": ["prod-agent-1", "prod-agent-2", "prod-agent-3"],
  "bundle_name": "production-safety"
}
```

Each affected agent receives an `assignment_changed` SSE event and fetches the new bundle immediately.

## Assignment Rules

Rules match agents by ID pattern and optional tags. Evaluated in priority order (lower number = higher priority).

### Creating a Rule

Dashboard > **Agents** > **Assignment Rules** tab > **New Rule**.

| Field | Required | Description |
|-------|----------|-------------|
| Pattern | Yes | Glob pattern matched against agent_id (e.g. `prod-*`, `agent-?`) |
| Bundle Name | Yes | Bundle to assign when the pattern matches |
| Environment | Yes | Target environment |
| Priority | Yes | Evaluation order (lower = first, must be unique per tenant) |
| Tag Match | No | JSON object -- all keys must match agent tags (AND logic) |

### Pattern Syntax

Standard glob matching:

| Pattern | Matches |
|---------|---------|
| `prod-*` | `prod-agent`, `prod-ops`, `prod-123` |
| `agent-?` | `agent-1`, `agent-a` (single character) |
| `*-platform-*` | `prod-platform-agent`, `dev-platform-ops` |
| `my-agent` | Exact match only |

**Validation:** Patterns must be 1-200 printable ASCII characters. No path separators (`/`, `\`) or null bytes.

### Tag Matching

Rules can optionally match on agent tags. All specified keys must match (AND logic):

```json
{
  "team": "platform",
  "tier": "1"
}
```

This rule only matches agents that have _both_ `team=platform` AND `tier=1` in their tags.

### Example Rules

| Priority | Pattern | Tag Match | Bundle | Effect |
|----------|---------|-----------|--------|--------|
| 1 | `prod-*` | `{"team": "platform"}` | `platform-production` | Production platform agents get strict contracts |
| 2 | `prod-*` | -- | `production-safety` | Other production agents get standard contracts |
| 3 | `staging-*` | -- | `staging-contracts` | Staging agents get relaxed contracts |
| 4 | `*` | -- | `default-bundle` | Everything else gets the default |

Rules are evaluated in priority order. The first matching rule wins.

## Dry-Run Resolution

Preview which bundle an agent would receive without actually connecting:

```
GET /api/v1/assignment-rules/resolve/{agent_id}
```

Response:

```json
{
  "agent_id": "prod-platform-agent",
  "bundle_name": "platform-production",
  "source": "rule",
  "matched_rule_id": "550e8400-...",
  "matched_pattern": "prod-*"
}
```

The `source` field tells you where the bundle came from:
- `explicit` -- set directly on the registration
- `rule` -- matched an assignment rule (includes rule ID and pattern)
- `agent` -- provided by the agent on connect
- `none` -- no bundle resolved

## SSE Events

When an agent's assignment changes (explicit assignment, rule change, or bulk assign), the console pushes an `assignment_changed` SSE event to the affected agent. The agent fetches the new bundle and reloads contracts immediately.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/assignment-rules` | GET | List all rules (sorted by priority) |
| `/api/v1/assignment-rules` | POST | Create a rule |
| `/api/v1/assignment-rules/{id}` | PATCH | Update a rule |
| `/api/v1/assignment-rules/{id}` | DELETE | Delete a rule |
| `/api/v1/assignment-rules/resolve/{agent_id}` | GET | Dry-run resolution |
| `/api/v1/agent-registrations/bulk-assign` | POST | Bulk assign bundle to agents |

## Next Steps

- [Connecting Agents](connecting-agents.md) -- connect agents with tags for rule matching
- [Fleet Monitoring](fleet-monitoring.md) -- verify agents received the correct bundle
- [Managing Contracts](managing-contracts.md) -- create the bundles that rules assign
