# CONTEXT.md — Edictum Console Alignment Document

> Single source of truth for what edictum is, what it does, what the console must support.
> Every prompt, agent, and session references this document.
> Last updated: 2026-02-27

---

## 1. What Edictum Is

**One-liner:** Edictum enforces contracts on AI agent tool calls — preconditions before execution, sandbox allowlists for file paths and commands, postconditions after, session limits across turns, and a full audit trail. Contracts are YAML. Enforcement is deterministic. The agent cannot bypass it.

**Core metaphor:** Edictum sits at the **decision-to-action seam**. The agent decides to call a tool. Before that call executes, Edictum checks it against contracts. This is a hard boundary, not a suggestion.

**What Edictum is NOT:**
- NOT prompt engineering or input guardrails
- NOT output content filtering
- NOT an authentication/authorization system (accepts a Principal but doesn't authenticate)
- NOT ML-based detection (deterministic pattern matching)
- NOT a proxy or network-level tool (in-process library)

**Do NOT use metaphors:** gatekeeper, guardian, shield, firewall, sentinel, watchdog.
**DO use:** "hard boundary," "enforcement point," "the check between decision and action."

---

## 2. Terminology (Binding)

Source of truth: `.docs-style-guide.md` (copied from edictum core). No exceptions.

| Concept | Canonical Term | DO NOT USE |
|---------|---------------|------------|
| YAML constructs that define checks | **contract** / **contracts** | policies, rules, guards, checks |
| What Edictum does to tool calls | **enforces contracts** | governs, guards, protects, secures |
| When a contract blocks a call | **denied** / **deny** | blocked, rejected, prevented, stopped |
| When a contract allows a call | **allowed** / **allow** | passed, approved (except HITL), permitted |
| Runtime check sequence | **pipeline** | engine, evaluator, processor, middleware |
| What agents do that Edictum checks | **tool call** / **tool calls** | function call, action, operation, invocation |
| Framework integration layer | **adapter** / **adapters** | integration, plugin, connector, driver |
| Shadow-testing without denying | **observe mode** | shadow mode, dry run, passive mode, monitor mode |
| Identity context on a tool call | **principal** | user (in governance context), identity, caller, actor |
| Structured output from postconditions | **finding** / **findings** | result, detection, alert, violation |
| YAML file containing contracts | **contract bundle** | policy file, rule file, config |

### Server-Specific Terms

From `edictum-server/docs/planning/VERSIONING.md`:

| Term | Definition | Example |
|------|-----------|---------|
| **Bundle** | YAML file conforming to `edictum/v1` | `contracts.yaml` |
| **Revision** | Immutable, content-addressed snapshot | `sha256:abc123` |
| **Version** | Monotonic integer per tenant | `v1`, `v2`, `v3` |
| **Environment** | Deployment target | `dev`, `staging`, `production` |
| **Deployment** | Binding a version to an environment at a point in time | "v3 → production at 14:30Z" |

### Code Field Names vs Prose

Some code fields use legacy naming (e.g., `policy_version` in audit events). Use the field name when referencing code. Use canonical terms in prose: "the contract bundle version (`policy_version`)."

---

## 3. Edictum Core Features

Everything below is what the edictum core library (`pip install edictum`) supports. The console must support displaying, managing, and operating on all of these.

### 3.1 Contract Types

Four contract types, each evaluated at a different point in the pipeline:

#### Pre-Contract (`type: pre`)

Evaluated BEFORE tool execution. Can deny or require human approval.

```yaml
- id: block-sensitive-reads
  type: pre
  tool: read_file
  when:
    args.path:
      contains_any: [".env", ".secret"]
  then:
    effect: deny          # or: approve (triggers HITL)
    message: "Sensitive file '{args.path}' denied."
    tags: [secrets, dlp]
```

Fields: `id`, `type`, `enabled`, `mode`, `tool`, `when`, `then.effect` (deny|approve), `then.message`, `then.tags`, `then.metadata`, `then.timeout` (for approve), `then.timeout_effect` (deny|allow).

#### Post-Contract (`type: post`)

Evaluated AFTER tool execution. Can warn, redact output, or suppress output.

```yaml
- id: pii-in-output
  type: post
  tool: "*"
  when:
    output.text:
      matches_any: ['\b\d{3}-\d{2}-\d{4}\b']
  then:
    effect: warn          # or: redact, deny
    message: "PII detected in output."
```

Effect behavior depends on tool side-effect classification:
- `warn`: Always works. Logs finding.
- `redact`: Replaces matching patterns with `[REDACTED]`. Falls back to warn for write/irreversible tools.
- `deny`: Suppresses entire output with `[OUTPUT SUPPRESSED]`. Falls back to warn for write/irreversible tools.

#### Session Contract (`type: session`)

Cross-turn limits using persisted atomic counters. No `when` clause.

```yaml
- id: session-limits
  type: session
  limits:
    max_tool_calls: 50
    max_attempts: 120
    max_calls_per_tool:
      dangerous_tool: 3
  then:
    effect: deny
    message: "Session limit reached."
```

When multiple session contracts exist, limits merge by taking the MORE RESTRICTIVE (lower) value.

#### Sandbox Contract (`type: sandbox`)

Restricts tools to file paths, commands, or domains. Evaluated before execution (between preconditions and session contracts in pipeline).

```yaml
- id: file-boundary
  type: sandbox
  tool: write_file
  within: ["/app/workspace"]
  not_within: ["/app/workspace/.git"]
  outside: deny           # or: approve (triggers HITL)
  message: "Write outside workspace denied."
```

Fields: `tool`/`tools`, `within`/`not_within` (paths), `allows.commands`, `allows.domains`/`not_allows.domains`, `outside` (deny|approve), `message`, `timeout`, `timeout_effect`.

Path extraction is automatic from tool args (keys like `path`, `file_path`, `directory`, `src`, `dst`, etc.).

### 3.2 Bundle Schema

Every contract bundle is a YAML file with this structure:

```yaml
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: my-bundle          # lowercase slug
  description: "..."
defaults:
  mode: enforce             # enforce | observe
contracts: [...]            # 1+ contracts
tools:                      # optional: tool side-effect classifications
  read_config:
    side_effect: read       # pure | read | write | irreversible
  deploy:
    side_effect: irreversible
    idempotent: false
observability:              # optional
  otel:
    enabled: false
    endpoint: "..."
  stdout: true
  file: null
observe_alongside: false    # composition flag for shadow mode
```

Validated against JSON Schema. Max file size: 1MB. Bundle hash = SHA256 of raw YAML bytes.

### 3.3 When Clause (Selectors, Operators, Combinators)

#### Selectors

| Selector | Available In | Source |
|----------|-------------|--------|
| `environment` | pre, post | Envelope environment string |
| `tool.name` | pre, post | Tool name |
| `args.*` | pre, post | Tool arguments (dotted path traversal) |
| `output.text` | **post only** | String representation of tool output |
| `principal.user_id` | pre, post | Principal identity |
| `principal.role` | pre, post | Principal role |
| `principal.org_id` | pre, post | Principal organization |
| `principal.ticket_ref` | pre, post | Ticket reference |
| `principal.claims.*` | pre, post | Custom claims (dotted path) |
| `env.*` | pre, post | OS environment variables |
| `metadata.*` | pre, post | Envelope metadata (dotted path) |

Missing fields evaluate to `False` (contract does not fire), except with `exists` operator.

#### Operators (15 built-in)

| Operator | Description |
|----------|-------------|
| `exists` | Field is present and non-null |
| `equals` / `not_equals` | Strict equality/inequality |
| `in` / `not_in` | Value in/not in list |
| `contains` | Substring match |
| `contains_any` | Any substring matches |
| `starts_with` / `ends_with` | Prefix/suffix match |
| `matches` / `matches_any` | Regex (`re.search`) |
| `gt` / `gte` / `lt` / `lte` | Numeric comparison |

Custom operators supported. Type mismatches are fail-closed (truthy error sentinel).

#### Boolean Combinators

```yaml
when:
  all:                    # AND (short-circuits on first false)
    - args.path:
        starts_with: "/etc"
    - any:                # OR (short-circuits on first true)
        - environment:
            equals: production
        - principal.role:
            equals: admin
  not:                    # Negation
    args.force:
      equals: true
```

### 3.4 Multi-Bundle Composition

Agents can load multiple bundles, composed left-to-right:

```python
guard = Edictum.from_yaml("base.yaml", "team.yaml", "shadow.yaml")
```

**Composition rules:**
- Same contract ID → later bundle overrides earlier
- Unique contract IDs → concatenated
- `defaults.mode` → later wins
- `tools` → deep merged (later wins on conflict)
- `metadata` → deep merged
- Session limits → merged by taking more restrictive (lower) value

**`observe_alongside: true`** — the key composition feature:
- All contracts in this bundle become **shadow copies** (ID suffixed with `:candidate`)
- Shadow contracts are evaluated but NEVER affect the real decision
- Mode forced to `observe` with `_shadow: True` attribute
- Results captured in `PreDecision.shadow_results`
- Use case: deploy a candidate bundle alongside enforced contracts. See what it *would* do without affecting agents.

**CompositionReport** (returned with `return_report=True`):
- `overridden_contracts`: which contracts were replaced, by which bundle
- `shadow_contracts`: which contracts are observe-only shadows

**Server-side composition** (from VERSIONING.md):
```
Layer 1 (lowest):  org-wide base contracts
Layer 2:           team-specific contracts
Layer 3 (highest): environment overrides
```
Layers merge into a flat bundle before push. Each environment gets a self-contained bundle.

### 3.5 Modes (Enforce vs Observe)

Three levels of mode control:

| Level | How set | Behavior |
|-------|---------|----------|
| **Constructor** | `Edictum(mode="observe")` | All contracts run in observe mode unless individually overridden |
| **Bundle default** | `defaults.mode: observe` | Bundle-level default |
| **Per-contract** | `mode: observe` on individual contract | Overrides bundle default and constructor |

In **observe mode**: the contract is evaluated and logged, but the decision is never enforced. Denied calls become `call_would_deny` audit events. Tool execution proceeds.

### 3.6 Pipeline (Full Evaluation Order)

On every tool call:

1. **Attempt limit check** — `session.attempt_count()` >= `limits.max_attempts` → deny
2. **Before hooks** — Python hook callbacks (HookResult.DENY stops)
3. **Preconditions** — YAML pre-contracts + Python decorators. Per-contract observe: deny recorded but doesn't deny.
   - Effect `approve` → `pending_approval` (HITL)
4. **Sandbox contracts** — path/command/domain boundary checks. Same observe/approve logic.
5. **Session contracts** — cross-turn limit checks
6. **Execution limits** — `session.execution_count()` >= `limits.max_tool_calls` → deny. Per-tool limits checked.
7. **Shadow contract evaluation** — shadow preconditions + sandbox + session. Results in `shadow_results`. NEVER affect decision.
8. **Tool executes** (if allowed)
9. **Postconditions** — YAML post-contracts with effect-based response (warn/redact/deny, side-effect gated)
10. **After hooks** — fire-and-forget callbacks
11. **Audit event emitted** — always, for every evaluation

**Fail-closed:** All exceptions in contracts/hooks → caught → treated as deny with `policy_error=True`.

### 3.7 Audit Events

Every tool call evaluation produces an `AuditEvent`:

| Field | Description |
|-------|-------------|
| `call_id` | UUID per tool call |
| `tool_name` | Tool that was called |
| `tool_args` | Arguments (redacted by RedactionPolicy) |
| `action` | `call_denied`, `call_would_deny`, `call_allowed`, `call_executed`, `call_failed`, `call_approval_requested/granted/denied/timeout` |
| `decision_source` | What made the decision: `yaml_precondition`, `yaml_sandbox`, `session_contract`, `attempt_limit`, `operation_limit`, `hook` |
| `decision_name` | The contract ID (e.g., `"block-sensitive-reads"`) |
| `reason` | Human-readable denial/warning reason |
| `mode` | `enforce` or `observe` |
| `policy_version` | SHA256 hash of the bundle YAML |
| `contracts_evaluated` | Full list: `[{name, type, passed, message, observed}]` |
| `side_effect` | Tool classification: pure/read/write/irreversible |
| `environment` | Environment string |
| `principal` | Serialized principal (if set) |
| `duration_ms` | Evaluation + execution time |
| `session_attempt_count` / `session_execution_count` | Current session counters |

**What ServerAuditSink sends to the console** (subset):
```json
{
  "call_id": "...", "agent_id": "...", "tool_name": "...",
  "verdict": "call_denied", "mode": "enforce",
  "timestamp": "ISO8601",
  "payload": {
    "tool_args": {}, "side_effect": "read",
    "environment": "production", "principal": null,
    "decision_source": "yaml_precondition",
    "decision_name": "block-sensitive-reads",
    "reason": "Sensitive file denied.",
    "policy_version": "sha256:abc..."
  }
}
```

**Note:** `contracts_evaluated` is NOT currently sent by ServerAuditSink. This is a gap — the console would benefit from the full list for the event detail view.

### 3.8 Tool Side-Effect Classification

| Classification | Meaning | Postcondition behavior |
|---------------|---------|----------------------|
| `pure` | No side effects | Redact/deny fully applied |
| `read` | Read-only | Redact/deny fully applied |
| `write` | Writes data | Redact/deny fall back to warn |
| `irreversible` | Cannot be undone | Redact/deny fall back to warn |

Unregistered tools default to `irreversible`. Bash commands classified by heuristic (`BashClassifier`).

### 3.9 CLI Commands

| Command | Description |
|---------|-------------|
| `edictum validate FILES...` | Validate YAML bundles. Multiple files → composition check. `--json` output. |
| `edictum diff FILES...` | Compare bundles: added/removed/changed contracts + composition report. Exit 1 if changes. |
| `edictum check FILE` | Dry-run a tool call. `--tool`, `--args`, `--environment`, `--principal-*`. |
| `edictum replay FILE --audit-log JSONL` | Replay audit log against new contracts. Detects verdict changes (would-break analysis). |
| `edictum test FILE --cases YAML` | Run test cases with expected verdicts. |
| `edictum version` | Show version. |

**No `edictum deploy` command.** Deployment is a server-side operation (console's job).

### 3.10 Server SDK (5 Classes)

Installed via `pip install edictum[server]`. These are the client-side classes agents use to connect to the console:

| Class | Purpose | Console endpoint |
|-------|---------|-----------------|
| `EdictumServerClient` | HTTP client with Bearer auth + agent_id header | All endpoints |
| `ServerAuditSink` | Batched event posting (50 events or 5s) | `POST /api/v1/events` |
| `ServerContractSource` | SSE listener for contract updates | `GET /api/v1/stream` (event: `contract_update`) |
| `ServerBackend` | Distributed session state | `GET/PUT/DELETE /api/v1/sessions/{key}`, `POST .../increment` |
| `ServerApprovalBackend` | HITL approval create + poll | `POST /api/v1/approvals`, `GET /api/v1/approvals/{id}` |

### 3.11 Adapters (7 frameworks)

| Adapter | Framework |
|---------|-----------|
| `LangChainAdapter` | LangChain |
| `NanobotAdapter` | Nanobot |
| `OpenAIAgentsAdapter` | OpenAI Agents SDK |
| `ClaudeAgentSDKAdapter` | Claude Agent SDK |
| `CrewAIAdapter` | CrewAI |
| `AgnoAdapter` | Agno |
| `SemanticKernelAdapter` | Semantic Kernel |

### 3.12 Approval System

When a pre-contract or sandbox contract has `effect: approve`, the pipeline pauses and creates an approval request. The agent waits (polling) until a human approves, denies, or the timeout expires.

Approval lifecycle: `pending` → `approved` | `denied` | `timeout`

Each approval carries: `tool_name`, `tool_args`, `message`, `timeout`, `timeout_effect`, `principal`, `metadata`.

### 3.13 Findings System

Postcondition failures produce `Finding` objects: `type` (pii_detected, secret_detected, limit_exceeded, policy_violation), `contract_id`, `field`, `message`, `metadata`.

### 3.14 Built-in Templates

Discoverable via `Edictum.list_templates()`, loadable via `Edictum.from_template(name)`:
- `research-agent` — sensitive reads, PII detection, session limits
- `file-agent` — file-focused boundaries
- `devops-agent` — DevOps tool restrictions
- `nanobot-agent` — Nanobot-specific contracts

---

## 4. Console's Job

The console is the **server companion** to the edictum library. It adds:

### What the console provides that the library doesn't:

| Capability | Library alone | With console |
|-----------|--------------|-------------|
| Contract storage | Local YAML file | Versioned, signed, stored in Postgres |
| Contract deployment | Manual file copy | Deploy to environments, SSE push to agents |
| Contract composition | `from_yaml(*paths)` at startup | Server-side layer composition, observe-alongside |
| Audit events | stdout/file | Centralized Postgres storage, queryable, real-time feed |
| Approvals | CLI prompt (`LocalApprovalBackend`) | Web UI + mobile, notifications, multi-approver |
| Session state | In-memory (`MemoryBackend`) | Redis-backed, shared across agent restarts |
| Agent visibility | None | Fleet monitoring, connection status, event aggregation |
| API keys | None | Scoped per environment, revocable, usage tracking |

### Console API endpoints (what agents connect to):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/stream` | GET (SSE) | Contract updates push (event: `contract_update`) |
| `/api/v1/events` | POST | Batch audit event ingestion |
| `/api/v1/approvals` | POST | Create approval request |
| `/api/v1/approvals/{id}` | GET | Poll approval decision |
| `/api/v1/sessions/{key}` | GET/PUT/DELETE | Session state CRUD |
| `/api/v1/sessions/{key}/increment` | POST | Atomic counter increment |
| `/api/v1/bundles` | POST/GET | Upload and list contract bundles |
| `/api/v1/bundles/{version}/deploy` | POST | Deploy bundle to environment |
| `/api/v1/bundles/{version}/yaml` | GET | Raw YAML content |
| `/api/v1/bundles/current?env=` | GET | Current deployed bundle per env |
| `/api/v1/keys` | POST/GET | Create and list API keys |
| `/api/v1/keys/{id}` | DELETE | Revoke API key |
| `/api/v1/health` | GET | Health check (no auth) |

### CI/CD deployment (first release):

API-key-authenticated `POST /api/v1/bundles` + `POST /api/v1/bundles/{version}/deploy`. Pipelines call these directly.

### GitOps deployment (future — P1 roadmap):

ArgoCD-style: connect Git repo → watch branch → auto-deploy contract bundles on push. Sync status UI, auto-sync vs manual sync toggle. Reference implementation: ArgoCD's app-of-apps pattern.

---

## 5. User Workflows

### 5.1 First Run

```
docker compose up
→ Bootstrap wizard (set admin email + password)
→ Login
→ Guided onboarding: create first API key → connect agent → upload first contract bundle
```

### 5.2 Contract Lifecycle

```
Write YAML contract bundle locally
→ Validate with `edictum validate contracts.yaml`
→ Upload to console (UI or CI/CD API)
→ Deploy to staging environment
→ Agents in staging pick up new contracts via SSE
→ Monitor events — verify contracts are evaluating as expected
→ Promote to production (deploy same version to prod env)
→ Production agents pick up contracts live — no restart
```

### 5.3 Observe-Alongside (Safe Promotion)

```
Upload candidate bundle with observe_alongside: true
→ Deploy candidate alongside enforced contracts
→ Agents evaluate both: enforced contracts make real decisions,
  candidate contracts produce shadow results (call_would_deny events)
→ Monitor shadow results in events feed
→ If candidate looks good: promote to enforced (new bundle without observe_alongside)
→ If candidate is wrong: remove it — no impact on agents
```

### 5.4 Multi-Bundle Composition

```
Org-wide base contracts (Layer 1): security fundamentals
→ Team-specific contracts (Layer 2): domain rules
→ Environment overrides (Layer 3): production tighter than staging
Console composes layers → flat bundle per environment → push to agents
```

### 5.5 Approval Flow

```
Agent calls a tool → precondition with effect: approve fires
→ Agent creates approval request via POST /api/v1/approvals
→ Agent polls for decision (2s interval)
→ Console shows approval in queue with tool name, args, message, countdown timer
→ Operator approves (one click) or denies (with reason)
→ Agent receives decision → proceeds or stops
→ Timeout → timeout_effect applies (deny or allow)
```

### 5.6 Event Investigation

```
Dashboard shows denial spike in events histogram
→ Click through to events feed
→ Filter by verdict: denied, agent: agent-42
→ See contract ID that denied each call (decision_name)
→ Click contract to see its YAML definition
→ Determine if contract is too aggressive → update and redeploy
```

### 5.7 API Key Management

```
Create API key for production environment (label: "prod-fleet")
→ Copy key (shown once) → set as EDICTUM_API_KEY in agent config
→ Agent connects with key → key resolves to tenant
→ Monitor key usage (last_used_at)
→ Rotate: create new key → update agents → revoke old key
```

---

## 6. What's Built vs What's Planned

### Built (in repo now)

| Component | Status |
|-----------|--------|
| FastAPI backend (auth, routes, services, models) | Complete |
| Local auth (email/password, session cookies, Redis) | Complete |
| API key management (create, list, revoke) | Complete |
| Contract bundle upload, versioning, deployment | Complete |
| SSE contract push to agents | Complete |
| Ed25519 bundle signing | Complete |
| Audit event ingestion | Complete |
| HITL approval CRUD | Complete |
| Session state storage | Complete |
| Rate limiting on auth | Complete |
| Telegram notifications | Complete |
| NotificationChannel protocol | Complete |
| AuthProvider protocol | Complete |
| Health endpoint | Complete |
| Adversarial test suite (~43 tests) | Complete |
| Docker Compose (Postgres + Redis + server) | Complete |
| Dashboard: Bootstrap wizard (View 0) | Complete |
| Dashboard: Login (View 1) | Complete |
| Dashboard: Sidebar + Layout + AuthGuard + ThemeToggle | Complete |
| Dashboard: API client (`lib/api.ts`) + SSE | Complete |
| Dashboard: Dashboard Home (View 3) | Complete |
| Dashboard: Events Feed (View 4) | Complete |
| Dashboard: Approvals Queue (View 5) | Complete |
| Dashboard: 15 mockup components (Views 3-5) | Complete |

### Designed (in DASHBOARD.md, not built)

| View | Status |
|------|--------|
| View 6: Contracts | Research done, design drafted, needs mockups |
| View 7: API Keys | Research done, design drafted, needs mockups |
| View 8: Settings | Research done, design drafted, needs mockups |

### Planned (roadmap)

| Feature | Priority |
|---------|----------|
| GitOps contract deployment (ArgoCD-style) | P1 |
| Event retention + TTL | P0 |
| Agent labels/tags | P1 |
| Contract diff viewer | P2 |
| User management CRUD | P2 |
| Notification channels UI | P2 |
| OIDC auth provider | P2 |
| Slack notification channel | P2 |
| Audit log export | P2 |
| Environment overview page | P2 |
| Signing key management UI | P2 |
| EventSink protocol + OTLP export | P1 |
| Governance Intelligence (pattern detection) | P1 |
| Custom dashboards | P3 |

### Needs Update

Views 3-5 were built before the full composition model was designed. They need updates to show contract provenance (`decision_name`), `contracts_evaluated` list, observe mode differentiation, and bundle composition info per agent. See `PROMPT-UPDATE-VIEWS-3-5.md`.

---

## 7. Considerations & Constraints

### Architecture

- **The server NEVER evaluates contracts.** Zero latency on tool calls. Server stores events, manages approvals, pushes contract updates.
- **Fail closed.** Server unreachable → errors propagate → deny. Never fail open.
- **Single Docker image.** FastAPI serves SPA at `/dashboard`, API at `/api/v1/*`.
- **Multi-tenant data model.** Every query filters by `tenant_id`. Single tenant is default UX.
- **DDD layers.** Services (domain) / Routes (application) / Infrastructure. Services never import routes.

### What agents see vs what operators see

| Concept | Agent perspective | Operator perspective |
|---------|------------------|---------------------|
| Contract bundle | Raw YAML bytes + revision hash. No version numbers. | Version numbers (v1, v2, v3), environment matrix, deployment history |
| Environment | API key encodes env (`edk_production_...`) | Manage environments, deploy bundles per env |
| Composition | `from_yaml(*paths)` at startup or SSE push | Composition stack per env, shadow bundles, override reports |
| Audit events | Fire-and-forget batch post | Searchable feed, histograms, contract provenance, findings |

### SSE event name

**CRITICAL:** Event name MUST be `contract_update`. The existing edictum-server had `bundle_deployed` — this was a bug fixed in the console.

### ServerAuditSink gap

`contracts_evaluated` (the full list of contracts checked per event) is NOT currently sent by ServerAuditSink. Only `decision_source`, `decision_name`, `reason`, and `policy_version` are in the payload. Adding `contracts_evaluated` to the sink is a core library change needed for full event detail in the console.

### No `Edictum.reload()` yet

Phase 1 deliverable. `ServerContractSource` yields new bundles via SSE but the consumer must manually reinitialize. `from_yaml_string()` exists as the building block.

### Bundle versioning model

- Revisions are immutable (SHA256 hash IS identity = `policy_version`)
- Versions are monotonic per tenant (v1, v2, v3 — never reuse)
- Re-uploading same YAML = new version, same revision hash (for audit trail)
- Environments are independent (deploying v5 to prod doesn't affect staging)
- Deploy = move pointer. Rollback = deploy an older version.

---

## Document Map

| Document | Purpose | When to read |
|----------|---------|-------------|
| **CONTEXT.md** (this) | What edictum is, features, workflows, status | First — always |
| `CLAUDE.md` | Architecture, coding standards, testing discipline | Before writing code |
| `.docs-style-guide.md` | Terminology guide (binding) | Before writing any text |
| `CONVENTIONS.md` | Cross-repo coding and review conventions | Before writing code |
| `DASHBOARD.md` | View-by-view UI design decisions | Before building dashboard views |
| `SDK_COMPAT.md` | API contract the edictum SDK expects | Before modifying API endpoints |
| `DEV-NOTES.md` | Running the stack, password reset, practical dev tips | When developing |
| `PROMPT-UPDATE-VIEWS-3-5.md` | Update built views with contract provenance | When updating Views 3-5 |
