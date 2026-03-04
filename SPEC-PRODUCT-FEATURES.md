# SPEC: Product Features — Edictum Console

> Detailed specs for features that elevate the console from "functional tool" to "real product."
> Each feature is self-contained with user stories, UI design, data model, and implementation notes.
> Reference: Audit session + product planning, 2026-03-01.

---

## Table of Contents

1. [First-Start Wizard](#1-first-start-wizard)
2. ~~Contract Editor~~ — **Moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.5**
3. ~~Contract Library~~ — **Moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.1 (Templates)**
4. ~~AI Contract Chat Wizard~~ — **Moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.6**
5. [Notification Settings Polish](#5-notification-settings-polish)
6. [Product Tour / Guided Tooltips](#6-product-tour--guided-tooltips)
7. [Custom Environments](#7-custom-environments)

---

## 1. First-Start Wizard

### Problem

After bootstrap (admin account created), the user lands on an empty dashboard with zeros everywhere. No guidance on what to do next. The "oh, I need to create an API key first" realization requires reading docs or guessing.

### User Story

> As a new operator who just ran `docker compose up` and completed bootstrap,
> I want to be guided through the essential setup steps,
> so that I have a working agent connected and governed within 5 minutes.

### Design

**Full-page stepper — no sidebar.** The wizard replaces the normal dashboard layout entirely until completed or dismissed. No chrome, no navigation distractions. Single column, centered content, progress indicator at top.

**Route:** `/dashboard/setup/wizard` (redirected to automatically when the system detects a fresh install with 0 API keys and 0 bundles).

**Detection logic:** On login, check:
- `GET /api/v1/keys` returns 0 keys AND
- `GET /api/v1/bundles` returns 0 bundles AND
- No `wizard_dismissed` flag in user preferences (localStorage)

If all true → redirect to wizard. User can skip/dismiss at any time.

### Steps

#### Step 1: Welcome + System Check

```
┌─────────────────────────────────────────┐
│          [Edictum logo]                 │
│                                         │
│   Welcome to Edictum Console            │
│                                         │
│   Your server is ready. Let's set up    │
│   your first governed agent.            │
│                                         │
│   System Status:                        │
│   [*] Database .............. Connected  │
│   [*] Redis ................. Connected  │
│   [*] Signing key .......... Generated  │
│                                         │
│              [Get Started →]            │
└─────────────────────────────────────────┘
```

- Runs health check on mount
- If any service is unhealthy, show warning with troubleshooting hint
- "Get Started" only enabled when all services healthy

#### Step 2: Create API Key

```
┌─────────────────────────────────────────┐
│  Step 2 of 5                            │
│  ━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░  │
│                                         │
│   Create an API Key                     │
│                                         │
│   API keys authenticate your agents     │
│   when they connect to the console.     │
│   Each key is scoped to an              │
│   environment.                          │
│                                         │
│   Label:  [production-agent-1     ]     │
│   Environment: [Production ▼]           │
│                                         │
│   Environments define deployment        │
│   targets. Contracts can be deployed    │
│   independently per environment.        │
│                                         │
│              [Create Key →]             │
└─────────────────────────────────────────┘
```

After creation:

```
┌─────────────────────────────────────────┐
│   Your API Key (copy it now!)           │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ edk_production_a1b2c3d4e5f6... │ [Copy] │
│   └─────────────────────────────────┘   │
│                                         │
│   ⚠ This key is shown only once.       │
│   Store it securely.                    │
│                                         │
│              [Next →]                   │
└─────────────────────────────────────────┘
```

- Uses the same `createKey` API as the API Keys page
- Key is shown in a prominent code block with copy button
- "Next" only enabled after key is created
- If user already has keys, show "You already have keys. Skip this step?" option

#### Step 3: Install SDK

```
┌─────────────────────────────────────────┐
│  Step 3 of 5                            │
│  ━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░  │
│                                         │
│   Install the SDK                       │
│                                         │
│   Add the server extension to your      │
│   Python environment:                   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ pip install edictum[server]     │ [Copy] │
│   └─────────────────────────────────┘   │
│                                         │
│   Then configure your agent:            │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ from edictum import Edictum     │   │
│   │ from edictum.server import (    │   │
│   │   EdictumServerClient,          │   │
│   │   ServerAuditSink,              │   │
│   │   ServerBackend,                │   │
│   │   ServerApprovalBackend,        │   │
│   │ )                               │   │
│   │                                 │   │
│   │ client = EdictumServerClient(   │   │
│   │   base_url="<server_url>",      │   │
│   │   api_key="<your_key>",         │   │
│   │   agent_id="my-agent",          │   │
│   │ )                               │   │
│   │                                 │   │
│   │ guard = Edictum.from_yaml(      │   │
│   │   "contracts.yaml",             │   │
│   │   backend=ServerBackend(client), │   │
│   │   approval_backend=             │   │
│   │     ServerApprovalBackend(      │   │
│   │       client),                  │   │
│   │   audit_sink=                   │   │
│   │     ServerAuditSink(client),    │   │
│   │ )                               │   │
│   └─────────────────────────────────┘   │
│                                         │
│   The base_url is auto-filled with      │
│   your server's address. The api_key    │
│   is the key you just created.          │
│                                         │
│              [Next →]                   │
└─────────────────────────────────────────┘
```

- Code snippet auto-fills `base_url` from `EDICTUM_BASE_URL` (via health endpoint)
- Code snippet auto-fills `api_key` with the key created in step 2
- Tabbed display: Python | Environment Variables
- Environment variables tab shows `EDICTUM_SERVER_URL` and `EDICTUM_API_KEY`
- This step is informational — "Next" is always enabled

#### Step 4: Upload First Contract

```
┌─────────────────────────────────────────┐
│  Step 4 of 5                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░  │
│                                         │
│   Deploy Your First Contract            │
│                                         │
│   Contracts define what your agents     │
│   can and cannot do. Start with a       │
│   template or write your own YAML.      │
│                                         │
│   ┌─ Choose a starter template ──────┐  │
│   │                                  │  │
│   │ [*] Research Agent (recommended) │  │
│   │     Blocks sensitive file reads, │  │
│   │     detects PII, limits sessions │  │
│   │                                  │  │
│   │ [ ] DevOps Agent                 │  │
│   │     Restricts dangerous commands │  │
│   │     and file writes              │  │
│   │                                  │  │
│   │ [ ] Blank — I'll write my own    │  │
│   │                                  │  │
│   └──────────────────────────────────┘  │
│                                         │
│   [Preview YAML]    [Upload & Deploy →] │
│                                         │
└─────────────────────────────────────────┘
```

- Template selection with radio cards (not a dropdown)
- "Preview YAML" opens a collapsible with the rendered YAML (read-only, monospace, syntax-highlighted if contract editor is built)
- "Blank" option opens the full contract editor (see Feature #2)
- "Upload & Deploy" calls `uploadBundle` + auto-deploys to the environment matching the API key created in step 2
- If user already has bundles, show "You already have bundles. Skip this step?" option

#### Step 5: Complete

```
┌─────────────────────────────────────────┐
│  Step 5 of 5                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│   🎯 You're all set!                    │
│                                         │
│   Your console is configured:           │
│                                         │
│   [*] API key created (production)      │
│   [*] Contract bundle deployed (v1)     │
│   [ ] Waiting for first agent           │
│       connection...                     │
│                                         │
│   When your agent connects, events      │
│   will appear on the dashboard.         │
│                                         │
│   ┌── What's Next ─────────────────┐    │
│   │ • Set up notifications         │    │
│   │   (Telegram, Slack, Email)     │    │
│   │ • Add more contracts           │    │
│   │ • Explore observe mode         │    │
│   │   (shadow-test new contracts)  │    │
│   └────────────────────────────────┘    │
│                                         │
│         [Go to Dashboard →]             │
│                                         │
└─────────────────────────────────────────┘
```

- Real-time check: polls agent connection status. If an agent connects during this step, the checkbox updates live
- "What's Next" links navigate to the relevant pages
- "Go to Dashboard" sets `wizard_completed` in localStorage and navigates to `/dashboard`

### Skip / Dismiss Behavior

- Every step has a subtle "Skip setup" link in the top-right corner
- Skipping sets `wizard_dismissed` in localStorage
- User can re-run the wizard from Settings (add a "Re-run Setup Wizard" link)

### Technical Notes

- **New route:** `/dashboard/setup/wizard`
- **New component:** `pages/setup/wizard.tsx` + step sub-components
- **No backend changes needed** — uses existing API endpoints
- **LocalStorage flags:** `edictum_wizard_completed`, `edictum_wizard_dismissed`
- **Auto-redirect logic:** Add to `AuthGuard` or `DashboardLayout`

### Acceptance Criteria

- [ ] Fresh install auto-redirects to wizard
- [ ] All 5 steps are functional
- [ ] API key is created and shown
- [ ] SDK snippet auto-fills with correct server URL and key
- [ ] Template upload and deploy works
- [ ] Wizard can be skipped at any step
- [ ] Wizard can be re-run from Settings
- [ ] Returning user (with keys + bundles) goes directly to dashboard

---

## 2. Contract Editor — MOVED

> **This section has been moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.5 (Contract Editor Component).**
> The contract editor is now part of the Composable Contracts spec, which redesigns the entire Contracts page.

~~### Problem~~

~~Currently, contracts are edited in a raw `<textarea>` inside a sheet (slide-over panel). No syntax highlighting, no line numbers, no auto-completion, no schema validation inline. For a product whose core value is YAML contracts, the editing experience is critical.~~

### User Story

> As an operator editing contracts in the console,
> I want a proper code editing experience with syntax highlighting, validation, and live preview,
> so that I can write correct YAML contracts without switching to a local editor.

### Design

**Replace the textarea with CodeMirror 6** — lightweight, extensible, works in React, has YAML mode. Monaco is too heavy for this use case.

#### Editor Component

```
┌─────────────────────────────────────────────────────────────┐
│  Upload Contract Bundle                                 [X] │
│                                                             │
│  [Select a template... ▼]    [Browse File]                  │
│                                                             │
│  ┌── Drop a .yaml file here or edit below ───────────────┐  │
│  │                                                       │  │
│  │                          ┌── Drag file here ────────┐ │  │
│  │                          │    📄                     │ │  │
│  │                          │  Drop .yaml file         │ │  │
│  │                          └──────────────────────────┘ │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ─── OR ── Edit directly ───────────────────────────────── │
│                                                             │
│  ┌─ Editor ──────────────────────────────────────────────┐  │
│  │  1 │ apiVersion: edictum/v1                           │  │
│  │  2 │ kind: ContractBundle                             │  │
│  │  3 │ metadata:                                        │  │
│  │  4 │   name: my-bundle                                │  │
│  │  5 │   description: "..."                             │  │
│  │  6 │ defaults:                                        │  │
│  │  7 │   mode: enforce                                  │  │
│  │  8 │ contracts:                                       │  │
│  │  9 │   - id: block-sensitive-reads                    │  │
│  │ 10 │     type: pre                                    │  │
│  │ 11 │     tool: read_file                              │  │
│  │ 12 │     when:                                        │  │
│  │ 13 │       args.path:                                 │  │
│  │ 14 │         contains_any: [".env", ".secret"]        │  │
│  │ 15 │     then:                                        │  │
│  │ 16 │       effect: deny                               │  │
│  │ 17 │       message: "Sensitive file denied."          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Validation ──────────────────────────────────────────┐  │
│  │ ✓ Valid — 3 contracts (2 pre, 1 session)              │  │
│  │   Bundle: my-bundle | Mode: enforce                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Cancel]                           [Upload Bundle]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

When validation fails:

```
│  ┌─ Validation ──────────────────────────────────────────┐  │
│  │ ✗ Invalid — Line 14: unknown operator "contain_any"   │  │
│  │   Did you mean "contains_any"?                        │  │
│  └───────────────────────────────────────────────────────┘  │
```

#### Features

1. **Syntax highlighting** — YAML mode via `@codemirror/lang-yaml`
2. **Line numbers** — built into CodeMirror
3. **Error markers** — red squiggly underline on the line with the validation error (CodeMirror `lintSource`)
4. **Dark/light theme** — CodeMirror theme matching the app's current theme
5. **Drag-and-drop** — drop zone above the editor. Dropping a file replaces editor content (with AlertDialog confirmation if content exists)
6. **Browse button** — hidden `<input type="file">` triggered by a "Browse File" button
7. **Template selector** — dropdown that loads predefined templates. Uses AlertDialog for replacement confirmation
8. **Live validation** — debounced (300ms) client-side validation as user types. Shows contract count, types, and mode
9. **Keyboard shortcuts** — Cmd/Ctrl+S to trigger upload (when valid)

#### Where It's Used

1. **Upload Sheet** — replaces current textarea
2. **YAML viewer** — read-only mode for viewing deployed bundle YAML (contracts tab, version detail)
3. **Evaluate tab** — editing tool call JSON (could use JSON mode)

#### Dependencies

```
pnpm add codemirror @codemirror/lang-yaml @codemirror/lang-json @codemirror/theme-one-dark @codemirror/lint @codemirror/view @codemirror/state
```

#### Component API

```typescript
// components/yaml-editor.tsx
interface YamlEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  height?: string | number
  validation?: {
    valid: boolean
    error?: string
    line?: number      // Line number with the error (for gutter marking)
  }
  placeholder?: string
}
```

#### Implementation Notes

- **Separate the editor component from the upload logic.** `YamlEditor` is a reusable component. Upload sheet composes it with template selector, drag-drop, and validation.
- **Debounce validation** — use the existing `validateBundle` function but debounced at 300ms
- **Remove the `debounceRef` dead code** in current upload-sheet.tsx
- **Change Upload Sheet from `Sheet` to `Dialog`** with `max-w-3xl` — the current 500px sheet is too narrow for a code editor. Or keep sheet but make it wider (`sm:max-w-[700px]`).

### Acceptance Criteria

- [ ] YAML syntax highlighting with line numbers
- [ ] Real-time validation with error line marking
- [ ] Drag-and-drop file loading with confirmation
- [ ] Browse file button as fallback
- [ ] Template selector with AlertDialog confirmation
- [ ] Dark and light theme support
- [ ] Used in upload sheet, YAML viewer, and evaluate tab

---

## 3. Contract Library (Templates) — MOVED

> **This section has been moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.1 (Library tab — Templates section).**
> Templates are now a section within the composable contracts Library tab.

~~### Problem~~

~~New users don't know what contracts to write. The two built-in templates ("DevOps Agent" and "Production Governance") are hidden in a dropdown and have no explanation of what they do.~~

### User Story

> As an operator new to edictum,
> I want to browse pre-built contract templates and customize them for my use case,
> so that I can deploy effective governance without writing YAML from scratch.

### Design

**New tab on the Contracts page: "Library"** — sits between "Contracts" and "Versions" tabs.

```
[Contracts] [Library] [Versions] [Diff] [Evaluate]
```

#### Library View

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Library                                           │
│  Pre-built contract templates for common governance needs.  │
│                                                             │
│  ┌── Search ────────────────────────── [Filter by type ▼] ──┐
│  │ 🔍 Search templates...                                    │
│  └───────────────────────────────────────────────────────────┘
│                                                             │
│  ┌── Starter Packs ────────────────────────────────────────┐│
│  │                                                          ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     ││
│  │  │ 🔬          │  │ 🛠️          │  │ 🏭          │     ││
│  │  │ Research    │  │ DevOps      │  │ Production  │     ││
│  │  │ Agent       │  │ Agent       │  │ Governance  │     ││
│  │  │             │  │             │  │             │     ││
│  │  │ 4 contracts │  │ 5 contracts │  │ 8 contracts │     ││
│  │  │ pre,session │  │ pre,sandbox │  │ all types   │     ││
│  │  │             │  │             │  │             │     ││
│  │  │ [Preview]   │  │ [Preview]   │  │ [Preview]   │     ││
│  │  │ [Use →]     │  │ [Use →]     │  │ [Use →]     │     ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌── Individual Contracts ─────────────────────────────────┐│
│  │                                                          ││
│  │  Block Sensitive File Reads          [pre]  [Use →]      ││
│  │  Deny access to .env, .secret, credentials files         ││
│  │                                                          ││
│  │  PII Detection in Output             [post] [Use →]      ││
│  │  Warn when SSN, credit card, or email patterns appear    ││
│  │                                                          ││
│  │  Session Rate Limits                 [session] [Use →]   ││
│  │  Limit tool calls to 50 per session, 3 per dangerous     ││
│  │                                                          ││
│  │  Workspace File Boundary             [sandbox] [Use →]   ││
│  │  Restrict file writes to /app/workspace                  ││
│  │                                                          ││
│  │  Shell Command Allowlist             [sandbox] [Use →]   ││
│  │  Only allow git, npm, and python commands                ││
│  │                                                          ││
│  │  Human Approval for Deploys          [pre]    [Use →]    ││
│  │  Require approval before deploy/publish tools            ││
│  │                                                          ││
│  │  ... more ...                                            ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### Preview Modal

Clicking "Preview" on a starter pack or individual contract opens a dialog:

```
┌─────────────────────────────────────────────────────────────┐
│  Research Agent Template                                [X] │
│                                                             │
│  Best for: agents that search, read files, and summarize.   │
│  Includes: sensitive file blocking, PII detection,          │
│  session limits, output scanning.                           │
│                                                             │
│  Contracts included:                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ • block-sensitive-reads (pre) — Deny .env, .secret   │   │
│  │ • pii-in-output (post) — Warn on SSN/CC patterns     │   │
│  │ • session-limits (session) — 50 calls, 120 attempts  │   │
│  │ • workspace-boundary (sandbox) — /app/workspace only  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ YAML ────────────────────────────────────────────────┐  │
│  │ apiVersion: edictum/v1                                │  │
│  │ kind: ContractBundle                                  │  │
│  │ metadata:                                             │  │
│  │   name: research-agent                                │  │
│  │   description: "..."                                  │  │
│  │ ...                                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Copy YAML]    [Open in Editor]    [Deploy Directly →]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Data Model

Templates are **static JSON/YAML shipped with the frontend**, not stored in the database. No backend changes needed.

```typescript
// lib/contract-templates.ts
interface ContractTemplate {
  id: string
  name: string
  description: string
  category: "starter-pack" | "individual"
  tags: string[]                    // e.g., ["pre", "security", "pii"]
  contractCount: number
  yaml: string                       // Full YAML content
  contracts: {                       // Parsed summary for display
    id: string
    type: string
    description: string
  }[]
}
```

#### "Use" Flow

1. **"Use →"** opens the Upload Sheet (or editor dialog) with the template YAML pre-filled
2. User can customize before uploading
3. **"Deploy Directly →"** calls upload + auto-deploy in one action (with environment selection)

### Acceptance Criteria

- [ ] Library tab on Contracts page
- [ ] 6+ starter pack templates covering common agent patterns
- [ ] 10+ individual contract templates
- [ ] Search and filter by type
- [ ] Preview with YAML view
- [ ] One-click "Use" populates the editor
- [ ] "Deploy Directly" for fast deployment

---

## 4. AI Contract Chat Wizard — MOVED

> **This section has been moved to [SPEC-COMPOSABLE-CONTRACTS.md](./SPEC-COMPOSABLE-CONTRACTS.md) §9.6 (AI Contract Chat Wizard) and §7 (AI endpoints).**
> The AI wizard is now part of the composable contracts spec with expanded scope: 4 providers (Anthropic, OpenAI, OpenRouter, Ollama), DB-backed config via Settings page, and "Create from Event" AI flow.

~~### Problem~~

~~Writing YAML contracts requires knowing the edictum schema — selectors, operators, effects, contract types. Even with templates, users need to customize. An AI-powered chat that understands the contract format can guide users through authoring.~~

### User Story

> As an operator who knows what I want to restrict but not how to express it in edictum YAML,
> I want to describe my intent in plain English and get a valid contract generated,
> so that I can create governance rules without memorizing the YAML schema.

### Design

**Chat panel alongside the contract editor.** Not a standalone page — it's a helper that outputs YAML into the editor.

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Editor                          [AI Assistant ▶]  │
│                                                             │
│  ┌── Editor (60%) ──────┐  ┌── AI Chat (40%) ────────────┐ │
│  │                       │  │                              │ │
│  │  1 │ apiVersion: ...  │  │  What governance rules do    │ │
│  │  2 │ kind: Contract.. │  │  you need?                   │ │
│  │  3 │ ...              │  │                              │ │
│  │                       │  │  ┌──────────────────────┐    │ │
│  │                       │  │  │ I want to block my   │    │ │
│  │                       │  │  │ agent from reading    │    │ │
│  │                       │  │  │ any file with .env    │    │ │
│  │                       │  │  │ in the name, and also │    │ │
│  │                       │  │  │ limit it to 20 tool   │    │ │
│  │                       │  │  │ calls per session.    │    │ │
│  │                       │  │  └──────────────────────┘    │ │
│  │                       │  │                              │ │
│  │                       │  │  I'll create two contracts:  │ │
│  │                       │  │                              │ │
│  │                       │  │  1. A **pre-contract** that  │ │
│  │                       │  │  denies `read_file` when     │ │
│  │                       │  │  the path contains ".env"    │ │
│  │                       │  │                              │ │
│  │                       │  │  2. A **session contract**   │ │
│  │                       │  │  with `max_tool_calls: 20`   │ │
│  │                       │  │                              │ │
│  │                       │  │  [Apply to Editor]           │ │
│  │                       │  │  [Explain more]              │ │
│  │                       │  │                              │ │
│  │                       │  │  ┌────────────────────────┐  │ │
│  │                       │  │  │ Type a message...      │  │ │
│  │                       │  │  └────────────────────────┘  │ │
│  └───────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Conversation Flow (multi-turn)

The AI should:
1. **Ask clarifying questions** — "Which tools should this apply to? All tools, or specific ones?"
2. **Suggest contract types** — "This sounds like a pre-contract (checked before execution). Should I also add a sandbox contract for path restrictions?"
3. **Show generated YAML incrementally** — Each message that includes YAML shows it in a fenced code block with an "Apply to Editor" button
4. **Validate against the schema** — The AI knows edictum's contract schema and validates its own output
5. **Explain choices** — "I used `contains_any` because you want to match multiple patterns. I could also use `matches_any` for regex patterns."

#### Architecture

**Backend endpoint:** `POST /api/v1/contracts/assist`

```python
# Request
{
  "messages": [
    {"role": "user", "content": "I want to block reading .env files"},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "Also limit to 20 tool calls"}
  ],
  "current_yaml": "apiVersion: edictum/v1\n..."  # Current editor content for context
}

# Response (streamed)
{
  "role": "assistant",
  "content": "I'll add a session contract...",
  "yaml": "apiVersion: edictum/v1\nkind: ContractBundle\n..."  # Optional: generated YAML
}
```

**LLM backend:** The server proxies to the configured LLM provider. Config via env vars:
- `EDICTUM_AI_PROVIDER` — `anthropic`, `openai`, `ollama`, `none` (disabled)
- `EDICTUM_AI_API_KEY` — API key for the provider
- `EDICTUM_AI_MODEL` — model name (default: `claude-sonnet-4-20250514`)

**System prompt** includes:
- The full edictum contract schema (from CONTEXT.md sections 3.1-3.4)
- All operators and their behavior
- Examples of each contract type
- Common patterns and best practices

**If AI is not configured:** The chat panel shows "AI Assistant requires configuration. Set `EDICTUM_AI_PROVIDER` and `EDICTUM_AI_API_KEY` in your environment." with a link to docs.

### Acceptance Criteria

- [ ] Chat panel alongside contract editor
- [ ] Multi-turn conversation with context
- [ ] Generated YAML can be applied to editor with one click
- [ ] Validates generated YAML client-side before offering "Apply"
- [ ] Works with Anthropic, OpenAI, and Ollama
- [ ] Graceful fallback when AI is not configured
- [ ] System prompt covers full contract schema

---

## 5. Notification Settings Polish

### Problem

The current notification UI works but has rough edges: comma-separated text inputs for filters, hardcoded environment list, no way to test before saving, no field-level validation feedback.

### What Exists Today

- Channel CRUD (Telegram, Slack, Webhook, Email) — works
- Routing filters (environments, agent patterns, contract names) — works but UX is rough
- Test button — works but only after save
- Channel table with status indicators — works

### Changes Needed

#### 5A: Replace Comma-Separated Inputs with Tag/Chip UI

**Current:** Text input where user types `team-a-*, team-b-*` with commas.

**New:** Tag input component. User types a pattern, presses Enter, sees a chip appear. Click X on chip to remove.

```
Agent Patterns:
┌──────────────────────────────────────────┐
│ [team-a-* ×] [team-b-* ×] [_________|] │
└──────────────────────────────────────────┘
Type a glob pattern and press Enter
```

**Component:** Create `components/tag-input.tsx`:
```typescript
interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  hint?: string
}
```

Also use this for the Email "To Addresses" field in config-fields.tsx.

#### 5B: Dynamic Environment List from Server

**Current:** Hardcoded `["production", "staging", "development"]` checkbox list.

**New:** Fetch available environments from the server. Show checkboxes for known environments + an "Add custom" input.

**Backend change needed:** `GET /api/v1/environments` — returns list of environment names used in API keys and deployments. (See Feature #7: Custom Environments.)

**Interim (before backend):** Derive from existing API keys — each key has an `environment` field. Fetch keys, extract unique environments.

#### 5C: Agent and Contract Autocomplete in Filters

**Current:** Blind text input — user must know exact agent IDs and contract names.

**New:** Searchable multi-select with autocomplete. Data sourced from:
- **Agents:** Derived from recent events (already available via `/api/v1/events`)
- **Contracts:** From deployed bundles (already available via `/api/v1/bundles`)

```
Agent Patterns:
┌──────────────────────────────────────────┐
│ [research-agent ×] [___________________]│
│  ┌──────────────────────────────────┐    │
│  │ ✓ research-agent                 │    │
│  │   devops-agent                   │    │
│  │   coding-agent-prod              │    │
│  │   coding-agent-staging           │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

Users can still type custom glob patterns (press Enter to add), but they also get autocomplete from real data.

#### 5D: Field-Level Validation

**Current:** Submit button disabled when invalid. No indication of which field is the problem.

**New:** Show red border + error message on invalid fields:
```
Bot Token:
┌─────────────────────────────────────────┐
│                                         │  ← red border
└─────────────────────────────────────────┘
Bot token is required
```

Use shadcn's form patterns with `Label` + `Input` + error text below.

#### 5E: Test Before Save

**Current:** Must save first, then test.

**New:** Add a "Test Connection" button in the create dialog that validates credentials without saving:

**Backend change needed:** `POST /api/v1/notifications/test` — takes channel type + config, sends a test notification, returns success/failure. Does not persist the channel.

### Acceptance Criteria

- [ ] Tag/chip inputs for agent patterns, contract names, email addresses
- [ ] Dynamic environment list from server (or derived from keys)
- [ ] Autocomplete for agents and contracts in filter fields
- [ ] Field-level validation with red borders and error messages
- [ ] "Test Connection" works before save

---

## 6. Product Tour / Guided Tooltips

### Problem

Even with the First-Start Wizard covering initial setup, users encountering each page for the first time don't know what everything does. The stats bar labels, the filter panel, the contract tabs — all are self-evident to the developer but not to a new user.

### User Story

> As a new user visiting each page for the first time,
> I want brief callout bubbles explaining key UI elements,
> so that I can understand the console without reading documentation.

### Design

**Lightweight tooltip tour — not a modal walkthrough.** Each page has 3-5 callout points that appear once (on first visit to that page). User can dismiss individually or "Don't show tips again."

#### Library

Use **react-joyride** (MIT, 4.5k stars, well-maintained) — provides positioned callout bubbles with highlight/spotlight, step sequencing, and callback hooks.

```
pnpm add react-joyride
```

#### Tour Definitions

```typescript
// lib/tours.ts
interface TourStep {
  target: string       // CSS selector
  content: string      // Tooltip text
  placement?: string   // top, bottom, left, right
}

export const TOURS: Record<string, TourStep[]> = {
  dashboard: [
    {
      target: "[data-tour='stats-bar']",
      content: "These stats summarize the last 24 hours. Pending shows approval requests waiting for you. Agents shows connected vs total.",
      placement: "bottom",
    },
    {
      target: "[data-tour='triage']",
      content: "Triage shows approval requests that need your attention. Approve or deny directly from here.",
      placement: "right",
    },
    {
      target: "[data-tour='verdict-chart']",
      content: "The verdict distribution shows how many tool calls were allowed, denied, or observed over time.",
      placement: "left",
    },
  ],
  events: [
    {
      target: "[data-tour='event-filters']",
      content: "Filter events by agent, tool, verdict, mode, or contract. Filters combine with AND logic.",
      placement: "right",
    },
    {
      target: "[data-tour='event-search']",
      content: "Search across agent names, tool names, and argument values.",
      placement: "bottom",
    },
  ],
  contracts: [
    {
      target: "[data-tour='contracts-tabs']",
      content: "Contracts shows your active bundles. Versions tracks deployment history. Diff compares versions. Evaluate lets you test contracts against sample tool calls.",
      placement: "bottom",
    },
    {
      target: "[data-tour='upload-btn']",
      content: "Upload a YAML contract bundle. You can paste YAML, drag a file, or start from a template.",
      placement: "left",
    },
  ],
  // ... more tours per page
}
```

#### Integration

```typescript
// components/page-tour.tsx
function PageTour({ tourId }: { tourId: string }) {
  const [run, setRun] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(`tour_${tourId}_seen`)
    if (!seen) setRun(true)
  }, [tourId])

  const handleComplete = () => {
    localStorage.setItem(`tour_${tourId}_seen`, "true")
    setRun(false)
  }

  return (
    <Joyride
      steps={TOURS[tourId]}
      run={run}
      continuous
      showSkipButton
      callback={({ status }) => {
        if (status === "finished" || status === "skipped") handleComplete()
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          // Match app theme
        },
      }}
    />
  )
}
```

Each page adds `<PageTour tourId="dashboard" />` at the top.

#### "Reset Tours" in Settings

Add a button in Settings > System: "Reset Guided Tours" — clears all `tour_*_seen` localStorage keys.

### Acceptance Criteria

- [ ] Tours defined for all 6 main pages
- [ ] Each tour runs once per page (first visit)
- [ ] User can skip or dismiss at any point
- [ ] "Don't show tips" option
- [ ] "Reset tours" button in Settings
- [ ] Tour styling matches app theme (dark/light)
- [ ] `data-tour` attributes added to key UI elements

---

## 7. Custom Environments

### Problem

The system hardcodes three environments: `production`, `staging`, `development`. Teams use different naming conventions: `prod/stg/dev`, `live/preview/test`, `qa/sandbox`, custom names.

### User Story

> As an operator with custom environment naming,
> I want to define my own environment names,
> so that my contract deployments and API keys match my team's infrastructure.

### Design

#### Data Model

**New table: `environments`**

```sql
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(50) NOT NULL,          -- e.g., "production", "qa", "sandbox"
  display_name VARCHAR(100),          -- e.g., "Production", "QA Environment"
  color VARCHAR(7),                   -- hex color for badges, e.g., "#ef4444"
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,  -- the env used when none specified
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
```

**Bootstrap migration:** For existing tenants, create three default environments:
```
production  | sort_order=0 | color=#ef4444 (red)    | is_default=false
staging     | sort_order=1 | color=#f59e0b (amber)  | is_default=false
development | sort_order=2 | color=#22c55e (green)  | is_default=true
```

#### API

```
GET    /api/v1/environments          → list environments for current tenant
POST   /api/v1/environments          → create environment (admin+)
PUT    /api/v1/environments/{id}     → update name, color, sort_order (admin+)
DELETE /api/v1/environments/{id}     → delete (only if no keys or deployments use it)
```

#### Frontend Changes

**1. Replace hardcoded env lists everywhere:**

| Current Location | Change |
|-----------------|--------|
| `lib/env-colors.tsx` — `ENV_COLORS` map | Fetch from API, fall back to defaults |
| `api-keys/create-key-dialog.tsx` — Environment dropdown | Dynamic from API |
| `contracts/deploy-dialog.tsx` — Environment selector | Dynamic from API |
| `contracts/bundle-header.tsx` — `KNOWN_ENVS` | Dynamic from API |
| `notifications/filter-fields.tsx` — Environment checkboxes | Dynamic from API |

**2. Environment management UI in Settings:**

New section in Settings, or new tab "Environments":

```
┌─────────────────────────────────────────────────────────────┐
│  Environments                                               │
│  Define deployment targets for your contracts and API keys. │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ● production    Production        [Edit] [Delete]   │    │
│  │ ● staging       Staging           [Edit] [Delete]   │    │
│  │ ● development   Development       [Edit] [Delete]   │    │
│  │ ● qa            QA Environment    [Edit] [Delete]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [+ Add Environment]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**3. Color picker for environment badges:**

Each environment gets a custom color used in `EnvBadge` across the app. The edit dialog has a simple color picker (preset palette of 8-10 colors, not a full color wheel).

**4. First-Start Wizard integration:**

In Step 2 (Create API Key), add an optional "Customize Environments" expandable:
```
Default environments: Production, Staging, Development
[Customize environments...]
  → Opens inline editor to rename, add, or remove environments
```

#### Migration Strategy

1. Create `environments` table
2. Backfill from existing API key `environment` values + known defaults
3. Update `EnvBadge` to use a `useEnvironments()` hook that fetches from API
4. All hardcoded `["production", "staging", "development"]` replaced with hook data

### Acceptance Criteria

- [ ] Environments table with CRUD API
- [ ] Settings UI for managing environments
- [ ] Custom colors per environment
- [ ] All hardcoded env lists replaced with dynamic data
- [ ] API key creation uses dynamic environment list
- [ ] Contract deployment uses dynamic environment list
- [ ] Notification filters use dynamic environment list
- [ ] BundleHeader shows all environments, not just 3
- [ ] First-Start Wizard offers environment customization
- [ ] Migration creates defaults for existing tenants

---

## Implementation Priority

```
Phase 1 (Ship-ready polish):
  → Contract Editor (#2) — core UX improvement, unblocks #3 and #4
  → Notification Polish (#5) — tag inputs, validation, test-before-save
  → Custom Environments (#7) — unblocks correct env handling everywhere

Phase 2 (Onboarding):
  → First-Start Wizard (#1) — the critical first impression
  → Product Tour (#6) — lightweight, adds guided discovery
  → Empty States (#D from audit spec) — teach users what things are

Phase 3 (Power features):
  → Contract Library (#3) — depends on #2 (editor)
  → AI Contract Wizard (#4) — depends on #2 (editor) + backend LLM integration
```

---

## Cross-References

| Spec | Related Feature |
|------|----------------|
| `SPEC-FRONTEND-AUDIT-FIXES.md` Group D | Empty states — implements educational copy. D3 is a lightweight inline "Getting Started" card on the dashboard that serves as a precursor to the full First-Start Wizard (#1). When #1 is implemented, D3 checks `edictum_wizard_completed` in localStorage and hides itself. |
| `SPEC-FRONTEND-AUDIT-FIXES.md` Group E | Contracts page — #2 replaces upload sheet |
| `SPEC-MULTI-TENANT-UX.md` | Multi-tenant — #7 environments must be tenant-scoped |
| `CONTEXT.md` Section 3.1-3.4 | Contract schema — #4 AI wizard system prompt |
| `DASHBOARD.md` View 6 | Contracts page design — #2 and #3 extend it |
