# Dashboard Overview

A page-by-page guide to the Edictum Console dashboard. React SPA served at `/dashboard` with real-time SSE updates on every page.

## Home

The landing page after login. Shows system status at a glance.

**Stats bar** -- top row with key metrics: total events (time window), active agents, pending approvals, deny rate.

**Triage column** -- pending approvals with inline approve/deny buttons. Handle urgent approvals without navigating away.

**Activity feed** -- real-time stream of recent events: tool calls, approvals, deployments, agent connections.

**Agent grid** -- fleet overview cards showing connected agents with their environment, bundle, and status.

**Getting-started wizard** -- shown when no events exist yet. Guides you through creating an API key, connecting an agent, and deploying your first contract.

## Events

Three-panel layout inspired by Datadog.

### Filter Sidebar (Left)

Faceted filters with counts:
- Agent ID
- Tool name
- Verdict (allow / deny / approval_required)
- Mode (enforce / observe)
- Contract name

Click a facet value to filter. Multiple selections within a facet use OR logic. Across facets, AND logic.

### Event List + Histogram (Center)

- **Histogram** -- bar chart showing event volume over time
- **Event list** -- time-sorted events with verdict badges
- **Time window selector** -- 15m, 1h, 6h, 24h, 7d, 30d, custom range
- **Text search** -- free-text search across agent_id, tool_name, and contract_id

### Detail Panel (Right)

Click an event to see full details:
- Contracts evaluated (ordered, with per-contract verdict)
- Decision context and deny reasons
- Tool arguments (formatted JSON)
- Provenance (which bundle, version, environment)

### URL-Synced Filters

Filter state is synced to URL search params. Share a link and the recipient sees the same filtered view.

## Approvals

### Pending Tab

Auto-switches layout based on volume:
- **< 5 pending** -- card view with full details per approval
- **>= 5 pending** -- table view with expandable rows

Each approval shows:
- Agent, tool, arguments, environment
- Timer badge with urgency colors: green (safe) > amber (warning) > red (expiring soon)
- Approve / Deny buttons

**Bulk actions** -- checkbox selection + bulk approve or deny.

**Urgency banner** -- appears when approvals are close to expiring.

**Deny with reason** -- deny dialog lets you enter a reason that's recorded in the audit trail.

### History Tab

Past approvals with decision details: who decided, when, via which channel (console, Telegram, Slack, Discord), and the decision reason.

## Contracts

Four tabs for the full contract lifecycle.

### Library Tab

Contract CRUD with:
- Create / edit / delete individual contracts
- Version history per contract
- Type filter (pre / post / session / sandbox)
- Tag filter
- AI chat panel on the right (see [AI Assistant](ai-assistant.md))

### Bundles Tab

- **Upload** raw YAML bundles
- **Compose** bundles from library contracts (create compositions, set order, mode overrides)
- **Deploy** to an environment -- signs the bundle and pushes to agents via SSE
- **Diff** between any two bundle versions

### Deployments Tab

History of all deployments:
- Bundle name and version
- Environment
- Timestamp
- Who deployed

### Evaluate Tab (Playground)

Test contracts without deploying:
1. Select a bundle
2. Enter tool name + JSON args
3. See verdict + contract evaluation trace

Includes replay mode (re-evaluate past events) and preset examples.

## Agents

### Fleet View

- **Summary cards** -- total agents, coverage %, enforced count, ungoverned count
- **Ungoverned sidebar** -- tools with no contract, sorted by agent count
- **Agent table** -- sortable by name, environment, bundle, status, coverage, last seen

### Agent Detail

Click an agent to see:
- **Coverage tab** -- tool-by-tool breakdown (enforced / observed / ungoverned)
- **Analytics tab** -- time-series charts (call volume, deny rate)
- **History tab** -- contract change timeline, drift events

See [Fleet Monitoring](fleet-monitoring.md) for details.

## API Keys

Dashboard > **API Keys**.

- **Create** -- generates a new key scoped to an environment. The full key is shown once -- copy it immediately.
- **List** -- shows all keys with prefix, environment, creation date, and last used.
- **Revoke** -- permanently disables a key.

API keys use the format `edk_{env}_{random}`. They're one-way bcrypt hashed in the database -- the console cannot recover the full key after creation.

## Settings

Four tabs for system configuration.

### System Tab

Health dashboard:
- Database latency
- Redis latency
- Connected agents count
- Auth provider type
- Bootstrap status
- HTTPS status

Auto-refreshes every 30 seconds.

### Notifications Tab

Channel management:
- Add / edit / delete notification channels
- Enable / disable toggle per channel
- Routing filters (environments, agent patterns, contract names)
- Test button per channel
- HTTPS warning for interactive channels

See [Notification Channels](notifications/overview.md) for setup guides.

### AI Tab

AI provider configuration:
- Provider selection (Anthropic / OpenAI / OpenRouter / Ollama)
- API key (encrypted at rest)
- Model override
- Base URL
- Test connection
- Usage stats with daily breakdown chart

See [AI Assistant](ai-assistant.md) for details.

### Danger Zone Tab

Destructive operations with confirmation dialogs:
- **Rotate signing key** -- generates new Ed25519 keypair, re-signs all active deployments
- **Purge events** -- delete audit events older than 30 / 60 / 90 days

## Dark / Light Mode

Toggle in the sidebar. Dark mode is the default. Every page works in both themes.

## Real-Time Updates (SSE)

Every page receives live updates via Server-Sent Events:
- New events appear in the feed without refreshing
- Approval status changes update in real time
- Agent connections/disconnections reflect immediately
- Deployment pushes show up in the contracts page

## Mobile

Responsive layouts across all pages. Filter panels collapse into slide-out sheets on small screens. Tables scroll horizontally. Cards stack vertically.

## Next Steps

- [Self-Hosting Guide](self-hosting.md) -- deploy the console
- [Connecting Agents](connecting-agents.md) -- connect your first agent
- [Managing Contracts](managing-contracts.md) -- create and deploy contracts
