# Edictum Console — Feature Map & System Flows

> Complete visualization of what the console does, who uses it, and how data flows.
> Last updated: 2026-02-26

---

## The Three Users

```
OPERATOR (human)                    AGENT (AI)                     DEVELOPER (human)
├── Logs into console               ├── Connects with API key      ├── pip install edictum
├── Manages contracts               ├── Receives contract updates   ├── Writes contracts.yaml
├── Reviews approval requests       ├── Sends audit events          ├── Runs agent locally
├── Monitors agent fleet            ├── Requests HITL approvals     ├── May never use the server
├── Creates API keys                ├── Stores session state        │
├── Configures notifications        └── Fails closed if server down └── Server is optional
└── Responds to alerts
```

---

## Complete Feature Map

### A. Contract Management

```
Developer writes           Operator uploads          Server stores
contracts.yaml    ──────▶  via Console UI    ──────▶  Bundle in Postgres
                           or API                     (versioned, signed)
                                                          │
                                                          ▼
                                                    Deploy to env
                                                    (production/staging)
                                                          │
                                                          ▼
                                                    SSE push notification
                                                          │
                                                          ▼
                                                    Agent receives update
                                                          │
                                                          ▼
                                                    Edictum.reload()
                                                    (hot-swap, no restart)
```

**Features:**
- Upload YAML contract bundles
- Version history (every upload = new version)
- Ed25519 signing (tamper protection)
- Deploy to environment (production, staging, dev)
- Push to connected agents via SSE
- View YAML, diff between versions
- Rollback: deploy older version

---

## Contract Management UI (Detailed)

> The operator needs to: see what's running, edit contracts, version them, push to agents, and verify delivery.

### Contracts List View

```
┌──────────────────────────────────────────────────────────────────────┐
│ CONTRACTS                                        [+ Upload Bundle]   │
│                                                                      │
│ ┌─ Active Deployments ─────────────────────────────────────────────┐ │
│ │                                                                   │ │
│ │  production   v7  deployed 2h ago by admin@co    3 agents using  │ │
│ │  staging      v8  deployed 15m ago by admin@co   1 agent using   │ │
│ │  development  v8  deployed 15m ago by admin@co   0 agents        │ │
│ │                                                                   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ Version History ────────────────────────────────────────────────┐ │
│ │                                                                   │ │
│ │  v8  ● staging, dev   15m ago   12 contracts   [View] [Deploy▾] │ │
│ │  v7  ● production     2h ago    11 contracts   [View] [Deploy▾] │ │
│ │  v6  (not deployed)   1d ago    11 contracts   [View] [Deploy▾] │ │
│ │  v5  (not deployed)   3d ago    10 contracts   [View] [Deploy▾] │ │
│ │  ...                                                              │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Key info at a glance:**
- Which version is running in each environment
- How many agents are currently using each deployment
- When each version was deployed and by whom

### Contract Bundle Viewer

```
┌──────────────────────────────────────────────────────────────────────┐
│ BUNDLE v7 (production)                              [Edit] [Deploy▾] │
│ Deployed: 2h ago by admin@co · Signed: Ed25519 ✓ · 11 contracts     │
│                                                                      │
│ ┌─ Contracts ──────────────────────────────────────────────────────┐ │
│ │                                                                   │ │
│ │  ID                    Tool        Effect    Mode     Status     │ │
│ │  ──────────────────    ─────────   ───────   ──────   ────────── │ │
│ │  deny-dangerous-exec   exec        deny      enforce  active    │ │
│ │  approve-exec          exec        approve   enforce  active    │ │
│ │  deny-system-reads     read_file   deny      enforce  active    │ │
│ │  deny-system-writes    write_file  deny      enforce  active    │ │
│ │  deny-system-edits     edit_file   deny      enforce  active    │ │
│ │  observe-reads         read_file   warn      observe  shadow    │ │
│ │  observe-writes        write_file  warn      observe  shadow    │ │
│ │  observe-web           web_fetch   warn      observe  shadow    │ │
│ │  approve-mcp           mcp_*       approve   enforce  active    │ │
│ │  session-rate-limit    *           deny      enforce  active    │ │
│ │  deny-sensitive-args   *           deny      enforce  active    │ │
│ │                                                                   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ Click any contract to see full YAML ▾                                │
│                                                                      │
│ ┌─ deny-dangerous-exec (expanded) ─────────────────────────────────┐ │
│ │                                                                   │ │
│ │  - id: deny-dangerous-exec                                       │ │
│ │    type: pre                                                      │ │
│ │    tool: exec                                                     │ │
│ │    when:                                                          │ │
│ │      args.command:                                                │ │
│ │        matches: '(rm -rf|sudo|chmod 777|mkfs|dd if=)'            │ │
│ │    then:                                                          │ │
│ │      effect: deny                                                 │ │
│ │      message: "Dangerous command blocked: {args.command}"         │ │
│ │                                                                   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Version Diff View

```
┌──────────────────────────────────────────────────────────────────────┐
│ DIFF: v6 → v7                                                        │
│                                                                      │
│ +1 added · 0 removed · 1 modified                                    │
│                                                                      │
│ ┌─ ADDED ──────────────────────────────────────────────────────────┐ │
│ │  + deny-system-reads                                              │ │
│ │    tool: read_file                                                │ │
│ │    effect: deny                                                   │ │
│ │    matches: /etc/shadow, /etc/passwd, .ssh/, .git-credentials    │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ MODIFIED ───────────────────────────────────────────────────────┐ │
│ │  ~ deny-dangerous-exec                                            │ │
│ │                                                                   │ │
│ │  when:                                                            │ │
│ │    args.command:                                                  │ │
│ │ -    matches: '(rm -rf|sudo|chmod 777)'                          │ │
│ │ +    matches: '(rm -rf|sudo|chmod 777|mkfs|dd if=)'              │ │
│ │                                                                   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ [Deploy v7 to production]   [Deploy v7 to staging]                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Quick Edit (In-Browser YAML Editor)

```
┌──────────────────────────────────────────────────────────────────────┐
│ EDIT CONTRACTS                      Based on: v7 (production)        │
│                                                                      │
│ ┌─ YAML Editor ────────────────────────────────────── [Validate] ──┐ │
│ │  1 │ contracts:                                                   │ │
│ │  2 │   - id: deny-dangerous-exec                                 │ │
│ │  3 │     type: pre                                                │ │
│ │  4 │     tool: exec                                               │ │
│ │  5 │     when:                                                    │ │
│ │  6 │       args.command:                                          │ │
│ │  7 │         matches: '(rm -rf|sudo|chmod 777|mkfs|dd if=)'      │ │
│ │  8 │     then:                                                    │ │
│ │  9 │       effect: deny                                           │ │
│ │ 10 │       message: "Dangerous command blocked"                   │ │
│ │ 11 │                                                              │ │
│ │ 12 │   - id: approve-exec                                        │ │
│ │ 13 │     type: pre                                                │ │
│ │ 14 │     tool: exec                                               │ │
│ │    │     ...                                                      │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ Validation ─────────────────────────────────────────────────────┐ │
│ │  ✓ 11 contracts parsed                                           │ │
│ │  ✓ All contract IDs unique                                       │ │
│ │  ✓ All tool names valid                                          │ │
│ │  ✓ All effects valid (deny, approve, warn, redact)               │ │
│ │  ✓ No schema errors                                              │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ Changes from v7: +1 contract, ~1 modified                            │
│                                                                      │
│ [Save as v8]  [Save & Deploy to staging]  [Save & Deploy to prod]    │
└──────────────────────────────────────────────────────────────────────┘
```

**Editor features:**
- Syntax highlighting (YAML)
- Line numbers
- Real-time validation against edictum contract schema
- Error markers on invalid lines
- Auto-complete for known fields (tool names from fleet, effect types)
- "Based on" version tracking (always creates new version, never overwrites)

### Deploy + Push Flow (What Happens)

```
┌──────────────────────────────────────────────────────────────────────┐
│ DEPLOY v8 → production                                               │
│                                                                      │
│ ┌─ Pre-Deploy Check ──────────────────────────────────────────────┐ │
│ │  Currently running: v7 (deployed 2h ago)                         │ │
│ │  Changes: +1 contract (deny-system-reads), ~1 modified           │ │
│ │  Agents affected: 3 (agent-42, agent-7, staging-bot)             │ │
│ │  Signature: Ed25519 ✓                                            │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ [Confirm Deploy]   [Cancel]                                          │
│                                                                      │
│ ─── After clicking Confirm ──────────────────────────────────────── │
│                                                                      │
│ ┌─ Deployment Progress ───────────────────────────────────────────┐ │
│ │                                                                   │ │
│ │  ✓ Bundle stored (v8)                                            │ │
│ │  ✓ Signed with Ed25519                                           │ │
│ │  ✓ Deployed to production environment                            │ │
│ │  ✓ SSE push sent to 3 agents                                    │ │
│ │                                                                   │ │
│ │  Agent Confirmation:                                              │ │
│ │  ✓ agent-42   reloaded v8   (contracts_reloaded event)           │ │
│ │  ✓ agent-7    reloaded v8   (contracts_reloaded event)           │ │
│ │  ⏳ staging-bot  waiting...  (may be offline)                    │ │
│ │                                                                   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**The key insight:** After deploy, the Feed page shows `contracts_reloaded` events from each agent. You know EXACTLY which agents picked up the new contracts and which didn't. If an agent doesn't reload within a reasonable time, it's either offline or stuck.

### "What's Running" — Agent Contract Status

```
┌──────────────────────────────────────────────────────────────────────┐
│ FLEET                                                                │
│                                                                      │
│ Agent          Env          Contract   Last Reload   Status          │
│ ─────────────  ───────────  ─────────  ───────────   ──────          │
│ agent-42       production   v8         2m ago        ✓ current       │
│ agent-7        production   v8         2m ago        ✓ current       │
│ staging-bot    production   v7         3h ago        ⚠ outdated      │
│ test-runner    staging      v8         15m ago       ✓ current       │
│ dev-local      development  v6         2d ago        ⚠ outdated      │
│                                                                      │
│ 3 current · 2 outdated · 5 total                                     │
│                                                                      │
│ [Push v8 to outdated agents]                                         │
└──────────────────────────────────────────────────────────────────────┘
```

**How we know what's running:**
- Every `contracts_reloaded` audit event includes the new `policy_version` (content hash)
- The server tracks: agent_id → last known policy_version
- Fleet page compares each agent's version against the deployed version for their env
- Mismatch = outdated (agent offline, SSE disconnected, or reload failed)

### Contract Templates (Quick Start)

```
┌──────────────────────────────────────────────────────────────────────┐
│ NEW BUNDLE                                                           │
│                                                                      │
│ Start from:                                                          │
│                                                                      │
│ ┌─────────────────────┐  ┌─────────────────────┐                     │
│ │ Blank               │  │ Current production   │                     │
│ │ Empty contract file │  │ Clone v7 as starting │                     │
│ │                     │  │ point                │                     │
│ └─────────────────────┘  └─────────────────────┘                     │
│                                                                      │
│ ┌─────────────────────┐  ┌─────────────────────┐                     │
│ │ DevOps Agent        │  │ Research Agent       │                     │
│ │ Template: exec deny │  │ Template: web_fetch  │                     │
│ │ + approve, file     │  │ deny + read_file     │                     │
│ │ restrictions        │  │ limits               │                     │
│ └─────────────────────┘  └─────────────────────┘                     │
│                                                                      │
│ ┌─────────────────────┐  ┌─────────────────────┐                     │
│ │ Nanobot Agent       │  │ Upload File          │                     │
│ │ Template: full      │  │ Paste or drag YAML   │                     │
│ │ governance for      │  │ from local file      │                     │
│ │ nanobot tools       │  │                      │                     │
│ └─────────────────────┘  └─────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────┘
```

### B. Agent Governance (Runtime)

```
Agent tries tool call
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  Edictum Pipeline (runs IN the agent process)       │
│                                                     │
│  1. Match tool against contracts                    │
│     ├── exact: "read_file"                          │
│     ├── wildcard: "mcp_*"                           │
│     └── sandbox: within ["/workspace"]              │
│                                                     │
│  2. Evaluate preconditions                          │
│     ├── effect: deny   → BLOCKED (immediate)        │
│     ├── effect: warn   → LOGGED, continues          │
│     └── effect: approve → PENDING (needs human)     │
│                                                     │
│  3. If PENDING_APPROVAL:                            │
│     ├── Send to approval backend                    │
│     │   ├── LocalApprovalBackend (CLI prompt)       │
│     │   └── ServerApprovalBackend (HTTP → server)   │
│     ├── Wait for decision (poll, timeout)           │
│     └── Approved → execute. Denied → block.         │
│                                                     │
│  4. Execute tool (if allowed)                       │
│                                                     │
│  5. Evaluate postconditions                         │
│     ├── effect: deny   → result discarded           │
│     ├── effect: warn   → finding logged             │
│     └── effect: redact → sensitive data removed     │
│                                                     │
│  6. Emit audit event                                │
│     ├── StdoutAuditSink (local)                     │
│     ├── FileAuditSink (local file)                  │
│     └── ServerAuditSink (batched HTTP → server)     │
│                                                     │
│  7. Check session limits                            │
│     ├── max_tool_calls per session                  │
│     ├── max per tool per session                    │
│     └── MemoryBackend or ServerBackend              │
└─────────────────────────────────────────────────────┘
        │
        ▼
  Tool result returned to agent
```

**Key:** The server NEVER evaluates contracts. All governance runs locally in the agent. Zero latency on tool calls. Graceful degradation if server unreachable.

### C. HITL Approval Flow

```
Agent calls dangerous tool
        │
        ▼
Contract matches: effect: approve
        │
        ▼
ServerApprovalBackend ─── POST /api/v1/approvals ───▶ Server
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                    Console Feed    Telegram Bot     Slack Channel
                                    (dashboard)     (inline btns)    (interactive)
                                          │               │               │
                                    Operator sees:                        │
                                    ┌──────────────────────────┐          │
                                    │ APPROVAL REQUEST         │          │
                                    │                          │          │
                                    │ Agent: agent-42          │          │
                                    │ Tool: exec               │          │
                                    │ Args: rm -rf /tmp/cache  │          │
                                    │ Contract: deny-dangerous │          │
                                    │                          │          │
                                    │ [APPROVE]  [DENY]        │          │
                                    │ Reason: ____________     │          │
                                    └──────────────────────────┘          │
                                          │                               │
                                          ▼                               │
                                    PUT /api/v1/approvals/{id}            │
                                    { status: "approved", reason: "..." } │
                                          │               ◀───────────────┘
                                          ▼
                              SSE push to waiting agent
                                          │
                                          ▼
                              Agent receives decision
                              ├── Approved → tool executes
                              └── Denied → tool blocked
                                          │
                                          ▼
                              Audit event emitted
                              (approval_granted or approval_denied)
```

**Timeout behavior:**
- Default: 5 minutes
- Configurable per contract
- On timeout: deny (safe default) or allow (configurable)
- Audit: `approval_timed_out` event

### D. Audit & Event Feed

```
Every tool call generates an audit event
        │
        ▼
ServerAuditSink batches events (50 events or 5s)
        │
        ▼
POST /api/v1/events ───▶ Server stores in Postgres
                              │
                              ├── Partitioned by date (auto-managed)
                              ├── Dedup by call_id (idempotent)
                              └── Indexed by: agent_id, tool_name, verdict, timestamp
                                        │
                                        ▼
                              Console Feed page shows:
                              ┌─────────────────────────────────────────┐
                              │ EVENT FEED                    [filters] │
                              │                                         │
                              │ 17:42:49  agent-42  exec      DENIED   │
                              │   └── rm -rf /  (deny-dangerous)       │
                              │                                         │
                              │ 17:42:31  agent-42  read_file ALLOWED  │
                              │   └── /workspace/data.csv              │
                              │                                         │
                              │ 17:41:15  agent-7   exec      APPROVED │
                              │   └── ls -la (approved by: alice@co)   │
                              │                                         │
                              │ 17:40:22  agent-7   mcp_fetch OBSERVE  │
                              │   └── would_deny: https://evil.com     │
                              └─────────────────────────────────────────┘
```

**Event types (AuditAction):**
| Verdict | Meaning | Icon |
|---------|---------|------|
| `call_allowed` | Contract checked, tool permitted | green |
| `call_denied` | Contract matched, tool blocked | red |
| `call_would_deny` | Observe mode — logged, not blocked | yellow |
| `call_approval_requested` | Sent to human for decision | blue |
| `call_approval_granted` | Human approved | green |
| `call_approval_denied` | Human denied | red |
| `call_approval_timeout` | No response in time → auto-denied | orange |
| `call_executed` | Tool ran successfully | gray |
| `call_failed` | Tool threw an error | red |
| `postcondition_warning` | Finding after execution | yellow |
| `contracts_reloaded` | New contracts hot-swapped | blue |

### E. Fleet Visibility

```
Agents connect via SSE + send audit events
        │
        ▼
Server derives fleet from:
├── SSE connections (PushManager tracks connected agents)
├── Audit events (agent_id in every event)
└── Future: heartbeat endpoint (POST /api/v1/agents/heartbeat)
        │
        ▼
Console Fleet page shows:
┌──────────────────────────────────────────────────────────┐
│ FLEET                                                    │
│                                                          │
│ Agent          Status    Framework   Last Seen   Events  │
│ ─────────────  ────────  ──────────  ──────────  ──────  │
│ agent-42       Online    nanobot     just now    1,247   │
│ agent-7        Online    langchain   2s ago        892   │
│ staging-bot    Offline   crewai      3h ago        156   │
│ test-runner    Online    custom      5s ago         34   │
│                                                          │
│ 3 online · 1 offline · 4 total                           │
└──────────────────────────────────────────────────────────┘
```

**Initial implementation:** Derived from events (agent_id + last_event_at).
**Future:** Dedicated heartbeat endpoint with version info, contract hash, uptime.

### F. API Key Management

```
Operator in Console:
        │
        ▼
Settings → API Keys
┌──────────────────────────────────────────────────────────┐
│ API KEYS                                   [+ Create]    │
│                                                          │
│ Label          Prefix        Env          Created        │
│ ─────────────  ────────────  ───────────  ──────────     │
│ prod-agent-42  edk_producti  production   2d ago  [x]    │
│ staging-test   edk_staging_  staging      5d ago  [x]    │
│ dev-local      edk_developm  development  1w ago  [x]    │
│                                                          │
│ Create new key:                                          │
│ ┌──────────────────────────────────┐                     │
│ │ Environment: [production ▼]      │                     │
│ │ Label:       [my-new-agent    ]  │                     │
│ │                                  │                     │
│ │ [Create Key]                     │                     │
│ └──────────────────────────────────┘                     │
│                                                          │
│ ⚠ Key shown once after creation. Store it securely.      │
└──────────────────────────────────────────────────────────┘
```

**Flow:**
1. Operator clicks "Create Key"
2. Selects environment (production/staging/development)
3. Server generates `edk_{env}_{random}`, stores bcrypt hash
4. Full key shown **once** — operator copies it
5. Key given to agent configuration
6. Revoke: click [x] → soft-delete → agent gets 401 on next request

### G. Notification System (Pluggable)

```
Server event occurs (denial, approval request, timeout, etc.)
        │
        ▼
NotificationManager
├── Filters by event type + severity
├── Fans out to configured channels:
│
├── TelegramChannel
│   ├── Approval requests → inline buttons (approve/deny)
│   ├── Denials → alert message
│   └── Interactive: can respond directly
│
├── SlackChannel
│   ├── Approval requests → interactive message
│   ├── Denials → channel alert
│   └── Interactive: Slack actions API
│
├── WebhookChannel
│   ├── POST to any URL with event JSON
│   └── Non-interactive (fire and forget)
│
├── EmailChannel
│   ├── Approval requests → email with approve/deny links
│   └── Digest: daily summary of events
│
└── PagerDutyChannel
    ├── Critical denials → incident
    └── Approval timeouts → incident
```

**Configuration (env vars):**
```env
# Enable Telegram for approvals + denials
EDICTUM_TELEGRAM_BOT_TOKEN=...
EDICTUM_TELEGRAM_CHAT_ID=...
EDICTUM_TELEGRAM_EVENTS=approvals,denials

# Enable Slack for everything
EDICTUM_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
EDICTUM_SLACK_EVENTS=all

# Enable webhook for denials only
EDICTUM_WEBHOOK_URL=https://your-siem.com/edictum
EDICTUM_WEBHOOK_EVENTS=denials
```

### H. Contract Push + Hot Reload

```
Operator deploys new contract bundle in Console
        │
        ▼
POST /api/v1/bundles         ← upload YAML
POST /api/v1/bundles/{v}/deploy?env=production
        │
        ▼
Server stores bundle + triggers SSE event
        │
        ▼
SSE: { event: "bundle_deployed", data: { version, env, yaml_bytes } }
        │
        ▼
Agent's ServerContractSource receives event
        │
        ▼
Edictum.reload(content=yaml_bytes)
        │
        ├── Build new contract lists
        ├── Acquire asyncio.Lock
        ├── Swap 11 references atomically
        ├── Release lock
        ├── Emit CONTRACTS_RELOADED audit event
        └── In-flight evaluations complete with OLD contracts (correct)
        │
        ▼
Next tool call uses NEW contracts
No restart. No downtime. Seconds.
```

---

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EDICTUM CONSOLE                                  │
│                   (single Docker container)                             │
│                                                                         │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐     │
│  │   Embedded Dashboard │    │         FastAPI Server              │     │
│  │   (Vite + React SPA) │    │                                    │     │
│  │                       │    │  Routes:                           │     │
│  │  /              main  │    │  POST /api/v1/auth/login           │     │
│  │  /dashboard   overview│    │  POST /api/v1/auth/logout          │     │
│  │  /contracts   manage  │    │  GET  /api/v1/auth/me              │     │
│  │  /feed        events  │    │  CRUD /api/v1/keys                 │     │
│  │  /fleet       agents  │    │  CRUD /api/v1/bundles              │     │
│  │  /settings    config  │    │  CRUD /api/v1/approvals            │     │
│  │  /login       auth    │    │  POST /api/v1/events               │     │
│  │                       │    │  GET  /api/v1/stream (SSE)         │     │
│  │  Auth: session cookie │    │  CRUD /api/v1/sessions             │     │
│  │  API: fetch() w/creds │    │                                    │     │
│  └───────────┬───────────┘    │  Auth:                             │     │
│              │ HTTP           │  ├── LocalAuthProvider (default)    │     │
│              └───────────────▶│  ├── ClerkAuthProvider (SaaS)      │     │
│                               │  └── OIDCAuthProvider (enterprise) │     │
│                               │                                    │     │
│                               │  Notifications:                    │     │
│                               │  ├── TelegramChannel               │     │
│                               │  ├── SlackChannel                  │     │
│                               │  ├── WebhookChannel                │     │
│                               │  └── EmailChannel                  │     │
│                               │                                    │     │
│                               │  Background Workers:               │     │
│                               │  ├── Approval timeout checker      │     │
│                               │  └── Event partition manager       │     │
│                               └────────────┬─────────────────────┘     │
│                                             │                           │
└─────────────────────────────────────────────┼───────────────────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        ┌──────────┐   ┌──────────┐   ┌──────────────┐
                        │ Postgres │   │  Redis   │   │ Notification │
                        │          │   │          │   │  Services    │
                        │ tenants  │   │ sessions │   │              │
                        │ users    │   │ pub/sub  │   │ Telegram API │
                        │ api_keys │   │ auth     │   │ Slack API    │
                        │ bundles  │   │ tokens   │   │ SMTP / SES   │
                        │ events   │   │          │   │ PagerDuty    │
                        │ approvals│   │          │   │ Webhooks     │
                        └──────────┘   └──────────┘   └──────────────┘

                              ▲               ▲
                              │               │
        ┌─────────────────────┼───────────────┼──────────────────────┐
        │                     │               │                      │
        │              Agent Process (anywhere)                      │
        │                                                            │
        │  ┌──────────────────────────────────────────────────────┐  │
        │  │  pip install edictum[server]                          │  │
        │  │                                                      │  │
        │  │  Edictum.from_yaml("contracts.yaml",                 │  │
        │  │    backend=ServerBackend(client),                     │  │
        │  │    approval_backend=ServerApprovalBackend(client),    │  │
        │  │    audit_sink=ServerAuditSink(client),                │  │
        │  │  )                                                    │  │
        │  │                                                      │  │
        │  │  ┌────────────────────────────────────────────────┐  │  │
        │  │  │ ServerContractSource ← SSE (contract updates)  │  │  │
        │  │  │ ServerAuditSink     → HTTP (batched events)    │  │  │
        │  │  │ ServerApprovalBackend ↔ HTTP (HITL requests)   │  │  │
        │  │  │ ServerBackend       ↔ HTTP (session counters)  │  │  │
        │  │  └────────────────────────────────────────────────┘  │  │
        │  │                                                      │  │
        │  │  Auth: Bearer edk_production_<key>                   │  │
        │  │  Identity: X-Edictum-Agent-Id: agent-42              │  │
        │  │  Fail-closed: server down → deny                     │  │
        │  └──────────────────────────────────────────────────────┘  │
        │                                                            │
        │  Works with: nanobot, langchain, crewai, openai agents,   │
        │              semantic kernel, agno, claude agent sdk,      │
        │              or any custom agent                           │
        └────────────────────────────────────────────────────────────┘
```

---

## User Journeys

### Journey 1: First-Time Self-Hosted Setup

```
1. git clone https://github.com/acartag7/edictum-server
2. cd edictum-server
3. cp .env.example .env
4. Edit .env:
     EDICTUM_ADMIN_EMAIL=admin@company.com
     EDICTUM_ADMIN_PASSWORD=strongpassword
5. docker compose up
6. Open http://localhost:8000
7. See: Edictum marketing/features page
8. Click "Dashboard" → redirected to /login
9. Login with admin credentials
10. Dashboard overview: 0 agents, 0 events
11. Go to Settings → API Keys → Create Key (production)
12. Copy key: edk_production_ABC123...
13. On agent machine:
     pip install edictum[server]
     # In agent code:
     client = EdictumServerClient(
       base_url="http://your-server:8000",
       api_key="edk_production_ABC123...",
       agent_id="my-first-agent",
     )
14. Agent connects → events start flowing
15. Dashboard shows: 1 agent online, events in feed
```

### Journey 2: Updating Contracts Live

```
1. Developer writes updated contracts.yaml
2. Operator opens Console → Contracts page
3. Upload new YAML → version 2 created
4. Click "Deploy to production"
5. Server signs bundle, stores in DB
6. SSE push to all production agents
7. Agents call Edictum.reload() → contracts swapped
8. Feed shows: "contracts_reloaded" event from each agent
9. Next tool calls evaluated against new contracts
10. No agent restarts. No downtime.
```

### Journey 3: HITL Approval in Production

```
1. Agent-42 tries: exec("rm -rf /tmp/old-data")
2. Contract matches: tool "exec", effect "approve"
3. Agent sends approval request to server
4. Server creates Approval record (status: pending)
5. Notification sent to:
   ├── Console Feed page (if operator is watching)
   ├── Telegram (inline approve/deny buttons)
   └── Slack channel (interactive message)
6. Operator sees on phone:
   "Agent agent-42 wants to run: exec rm -rf /tmp/old-data"
   [Approve] [Deny]
7. Operator taps [Approve] with reason: "cleanup is fine"
8. Server updates approval → SSE push to agent
9. Agent receives decision → tool executes
10. Audit event: approval_granted, decided_by: admin@company.com
11. If no response in 5 minutes → auto-deny + alert
```

### Journey 4: Developer Using Edictum Without Server

```
1. pip install edictum[yaml]
2. Write contracts.yaml:
   - id: deny-dangerous
     type: pre
     tool: exec
     when:
       args.command:
         matches: '(rm -rf|sudo|chmod 777)'
     then:
       effect: deny
       message: "Dangerous command blocked"
3. In agent code:
   guard = Edictum.from_yaml("contracts.yaml")
   result = await guard.run(
     tool_name="exec",
     args={"command": "rm -rf /"},
     tool_callable=exec_fn,
   )
   # → EdictumDenied raised, tool never executes
4. No server. No API key. No Docker. Just YAML + Python.
5. When ready for production: add edictum[server], point at console.
```

---

## Data Model (What's in the Database)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Tenant    │────▶│   ApiKey     │     │   User       │
│             │     │              │     │              │
│ id          │     │ id           │     │ id           │
│ name        │     │ tenant_id    │     │ tenant_id    │
│ external_id │     │ key_prefix   │     │ email        │
│ created_at  │     │ key_hash     │     │ password_hash│
│             │     │ env          │     │ role         │
│             │     │ label        │     │ created_at   │
│             │     │ revoked_at   │     └──────────────┘
│             │     └──────────────┘
│             │
│             │────▶┌──────────────┐     ┌──────────────┐
│             │     │ SigningKey   │     │  Deployment  │
│             │     │              │     │              │
│             │     │ id           │     │ id           │
│             │     │ tenant_id    │     │ bundle_id    │
│             │     │ public_key   │     │ env          │
│             │     │ private_key  │     │ deployed_at  │
│             │     │ (encrypted)  │     │ deployed_by  │
│             │     └──────────────┘     └──────────────┘
│             │                                ▲
│             │────▶┌──────────────┐           │
│             │     │   Bundle    │───────────┘
│             │     │              │
│             │     │ id           │
│             │     │ tenant_id    │
│             │     │ version      │
│             │     │ yaml_bytes   │
│             │     │ signature    │
│             │     │ revision_hash│
│             │     │ uploaded_by  │
│             │     └──────────────┘
│             │
│             │────▶┌──────────────┐
│             │     │   Event     │  (partitioned by date)
│             │     │              │
│             │     │ id           │
│             │     │ tenant_id    │
│             │     │ call_id      │
│             │     │ agent_id     │
│             │     │ tool_name    │
│             │     │ verdict      │
│             │     │ payload (JSON)│
│             │     │ created_at   │
│             │     └──────────────┘
│             │
│             │────▶┌──────────────┐
│             │     │  Approval   │
│             │     │              │
│             │     │ id           │
│             │     │ tenant_id    │
│             │     │ agent_id     │
│             │     │ tool_name    │
│             │     │ tool_args    │
│             │     │ message      │
│             │     │ status       │ pending/approved/denied/timeout
│             │     │ decided_by   │
│             │     │ reason       │
│             │     │ created_at   │
│             │     │ decided_at   │
│             │     └──────────────┘
└─────────────┘
```

---

## API Surface (Complete)

### Auth (Phase 0 — new)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/login` | None | Login with email/password |
| POST | `/api/v1/auth/logout` | Cookie | End session |
| GET | `/api/v1/auth/me` | Cookie | Current user info |

### API Keys
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/keys` | Dashboard | Create new API key |
| GET | `/api/v1/keys` | Dashboard | List keys (prefix only) |
| DELETE | `/api/v1/keys/{id}` | Dashboard | Revoke key |

### Contract Bundles
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/bundles` | Dashboard | Upload YAML bundle |
| GET | `/api/v1/bundles` | Dashboard | List all versions |
| GET | `/api/v1/bundles/{version}` | API Key | Get bundle metadata |
| GET | `/api/v1/bundles/{version}/yaml` | API Key | Get raw YAML (Phase 1) |
| POST | `/api/v1/bundles/{version}/deploy` | Dashboard | Deploy to environment |

### Approvals (HITL)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/approvals` | API Key | Agent creates approval request |
| GET | `/api/v1/approvals` | Either | List pending/recent approvals |
| GET | `/api/v1/approvals/{id}` | API Key | Poll approval decision |
| PUT | `/api/v1/approvals/{id}` | Dashboard | Approve or deny |

### Events (Audit)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/events` | API Key | Agent submits audit events (batch) |
| GET | `/api/v1/events` | Dashboard | Query events with filters |

### Agent Connection
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/stream` | API Key | SSE: contract pushes + notifications |

### Sessions
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/sessions/{key}` | API Key | Get session value |
| PUT | `/api/v1/sessions/{key}` | API Key | Set session value |
| POST | `/api/v1/sessions/{key}/increment` | API Key | Atomic increment |
| DELETE | `/api/v1/sessions/{key}` | API Key | Delete session key |

### System
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/health` | None | Health check |

---

## Deployment Modes

```
Mode 1: Self-Hosted (docker compose)
┌─────────────────────────────────┐
│ docker compose up               │
│                                 │
│  server:8000 ← console + API   │
│  postgres:5432                  │
│  redis:6379                     │
│                                 │
│  AUTH_PROVIDER=local            │
│  ADMIN_EMAIL=admin@co.com       │
└─────────────────────────────────┘

Mode 2: Cloud (Render / Railway / Fly.io)
┌─────────────────────────────────┐
│ Render web service              │
│  ← Dockerfile build             │
│                                 │
│  Neon Postgres (managed)        │
│  Upstash Redis (managed)        │
│                                 │
│  AUTH_PROVIDER=clerk or oidc    │
│  CLERK_ISSUER=https://...       │
└─────────────────────────────────┘

Mode 3: No Server (just the library)
┌─────────────────────────────────┐
│ pip install edictum[yaml]       │
│                                 │
│ Edictum.from_yaml("c.yaml")    │
│ No Docker. No database.        │
│ Everything local.               │
└─────────────────────────────────┘
```
