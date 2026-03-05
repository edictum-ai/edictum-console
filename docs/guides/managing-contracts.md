# Managing Contracts

Create, compose, and deploy contracts from the Edictum Console dashboard. The three-level model: contracts (authoring) > compositions (assembly) > bundles (deployment).

## Contract Library

Individual contracts are stored in a versioned library. Each contract has a type, name, description, definition, and optional tags.

### Creating Contracts

Dashboard > **Contracts** > **Library** tab > **New Contract**.

| Field | Description |
|-------|-------------|
| Name | Unique identifier (e.g. `block-dotenv`) |
| Type | `pre`, `post`, `session`, or `sandbox` |
| Description | What this contract does |
| Definition | JSON contract definition (selectors, operators, effects) |
| Tags | Optional labels for organization |

Every save creates a new version. Old versions are preserved -- you can view the full version history and diff between any two versions.

### Contract Types

| Type | When it runs | Use case |
|------|-------------|----------|
| `pre` | Before tool execution | Block dangerous calls, require approval |
| `post` | After tool execution | Validate output, redact PII |
| `session` | Across the session | Rate limits, call caps, per-tool limits |
| `sandbox` | Before tool execution | Path/domain allowlists |

### Import from YAML

Already have contracts in a YAML bundle? Import them:

```
POST /api/v1/contracts/import
```

Upload a bundle YAML file and the console decomposes it into individual library contracts. Each contract in the bundle becomes a separate library entry.

## Compositions

Compositions are recipes that combine library contracts into deployable bundles.

### Creating a Composition

Dashboard > **Contracts** > **Bundles** tab > **New Composition**.

1. **Name** the composition (e.g. `production-safety`)
2. **Select contracts** from the library
3. **Set order** -- drag to set the evaluation position (lower = evaluated first)
4. **Override mode** per contract -- `enforce`, `observe`, or `inherit` (uses bundle default)

The same contract can appear in multiple compositions.

### Preview

Before deploying, preview the assembled YAML:

```
POST /api/v1/compositions/{name}/preview
```

This shows exactly what YAML will be generated, including all selected contracts in order with mode overrides applied.

### Deploy

```
POST /api/v1/compositions/{name}/deploy
```

Deploying a composition:
1. Assembles the contracts into a YAML bundle
2. Signs the bundle with the tenant's Ed25519 key
3. Creates a new bundle version
4. Pushes a `contract_update` SSE event to all connected agents subscribed to that bundle

Agents pick up the new contracts instantly -- no restart needed.

## Bundles

Bundles are the deployed artifact. Each bundle has a name, version history, and environment deployments.

### Upload Raw YAML

If you prefer writing YAML directly:

Dashboard > **Contracts** > **Bundles** tab > **Upload Bundle**.

Upload a YAML file conforming to the [edictum contract schema](https://docs.edictum.dev/contracts/yaml-reference). The console validates, signs, and stores it. Each upload auto-increments the version number.

### Version History

Every bundle upload or composition deploy creates a new version with:
- Auto-incremented version number
- SHA-256 revision hash (used for drift detection)
- Timestamp
- Source (upload or composition name)

### Diff Viewer

Compare any two bundle versions:

Dashboard > **Contracts** > **Bundles** tab > select a bundle > **Diff**.

The diff viewer shows:
- Side-by-side YAML comparison
- Added/removed/changed lines highlighted
- Change summary (contracts added, removed, modified)

## Playground

Test contracts against tool calls without deploying or executing anything.

Dashboard > **Contracts** > **Evaluate** tab.

1. Select a bundle
2. Enter a tool name (e.g. `read_file`)
3. Enter tool arguments as JSON (e.g. `{"path": ".env"}`)
4. Click **Evaluate**

The playground returns:
- **Verdict**: allow, deny, or approval_required
- **Contract trace**: which contracts evaluated, in what order, what each decided
- **Deny reasons**: if denied, which contract and why

### Replay Mode

Re-evaluate a past audit event against the current contracts. Select an event from the history, click **Replay** -- the playground runs the original tool call against the latest bundle to see if the outcome would change.

### Preset Examples

Common test scenarios are available as presets -- click to populate tool name and args.

## AI Contract Assistant

A streaming chat assistant that helps you write contracts.

Dashboard > **Contracts** > **Library** tab > AI chat panel (right side).

The assistant knows the full edictum contract schema: 4 contract types, 13 selectors, 15 operators, 5 effects. Ask it to:
- Write a contract from a description
- Explain what a contract does
- Suggest improvements
- Debug why a contract isn't matching

Multi-turn conversation with streaming responses. See [AI Assistant](ai-assistant.md) for setup.

## Deployment Flow

The typical workflow:

```
1. Create contracts in the library
   (or import from existing YAML)
         |
2. Create a composition
   Select contracts, set order, override modes
         |
3. Preview the assembled YAML
   Verify it looks correct
         |
4. Deploy the composition
   Console signs + pushes to agents via SSE
         |
5. Agents pick up changes instantly
   No restart, no redeployment
```

## Next Steps

- [Connecting Agents](connecting-agents.md) -- connect agents to receive deployed contracts
- [Agent Assignment](agent-assignment.md) -- route specific bundles to specific agents
- [AI Assistant](ai-assistant.md) -- set up the AI contract writing assistant
- [Fleet Monitoring](fleet-monitoring.md) -- verify agents are running the correct contracts
