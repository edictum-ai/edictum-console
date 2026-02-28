# Prompt: Build View 6 Mockups + Continue View 7-8 Design

> Self-contained prompt for continuing the Edictum Console dashboard design.
> View 6 (Contracts) is fully designed — build 5 mockup variations.
> Views 7 (API Keys) and 8 (Settings) are designed — build their mockups next.

## Required Reading (in this order)

1. `CONTEXT.md` — **Read first.** What edictum is, all core features, terminology, user workflows, what's built vs planned. This is the alignment document.
2. `CLAUDE.md` — Project rules, architecture, coding standards.
3. `.docs-style-guide.md` — Terminology guide (binding). "contract" not "policy/rule". No exceptions.
4. `DASHBOARD.md` — All view designs. View 6 section has the 5 mockup variations to build. Views 7-8 have their designs and mockup variation descriptions.
5. `DEV-NOTES.md` — Dev workflow (Docker, Vite dev server, password reset).

## What to Build This Session

### Phase 1: View 6 Mockups (Contracts)

Build 5 real React mockup components in `dashboard/src/pages/mockups/`. Same pattern as Views 3-5 mockups (15 components already exist there as reference).

Each mockup is a standalone page component with hardcoded data — no API calls. They're for visual comparison so the user can pick or mix approaches.

**The 5 variations (from DASHBOARD.md View 6 section):**

1. **Environment Matrix + Detail Tabs** — Structured operator view. Deployment cards + version table + detail tabs (YAML, Diff, Playground, History).
2. **Split Pane IDE** — Developer view. Contract list left, editor/viewer right. VS Code feel.
3. **ArgoCD Sync Status** — Ops view. Sync status per environment. Click out-of-sync → diff + deploy.
4. **Timeline + Composition Stack** — Deployment-centric. Vertical timeline + composition stacks per env.
5. **Tabbed Workbench** — All-in-one. Top tabs: Bundles | Environments | Playground | History.

**Every mockup must show:**
- Composition stack per environment (enforce + observe_alongside bundles)
- `observe_alongside` bundles visually differentiated (amber/dashed, "observe" badge)
- YAML syntax-highlighted content (use a simple highlighter or monospace with color)
- Diff view between versions (red/green line diff)
- Playground area (YAML + Python + output panels, even if static)
- Environment badges (production=red, staging=amber, development=green)
- Deploy action with confirmation
- Scale: show with 3-5 bundle versions, 3 environments

**Hardcoded data to use:**

```typescript
const MOCK_BUNDLES = [
  { version: 5, revision_hash: "sha256:e7f2a1...", uploaded_by: "admin@example.com", created_at: "2026-02-27T08:00:00Z", deployed_envs: ["development"] },
  { version: 4, revision_hash: "sha256:b3c8d9...", uploaded_by: "admin@example.com", created_at: "2026-02-27T06:30:00Z", deployed_envs: ["staging"] },
  { version: 3, revision_hash: "sha256:a1b2c3...", uploaded_by: "admin@example.com", created_at: "2026-02-26T14:00:00Z", deployed_envs: ["production"] },
  { version: 2, revision_hash: "sha256:d4e5f6...", uploaded_by: "admin@example.com", created_at: "2026-02-25T10:00:00Z", deployed_envs: [] },
  { version: 1, revision_hash: "sha256:112233...", uploaded_by: "admin@example.com", created_at: "2026-02-24T09:00:00Z", deployed_envs: [] },
];

const MOCK_COMPOSITION_STACKS = {
  production: [
    { bundle_name: "org-base-contracts", version: 3, mode: "enforce" },
    { bundle_name: "team-api-contracts", version: 2, mode: "enforce" },
  ],
  staging: [
    { bundle_name: "org-base-contracts", version: 4, mode: "enforce" },
    { bundle_name: "team-api-contracts", version: 2, mode: "enforce" },
    { bundle_name: "candidate-pii-detection", version: 1, mode: "observe_alongside" },
  ],
  development: [
    { bundle_name: "org-base-contracts", version: 5, mode: "enforce" },
  ],
};

const MOCK_YAML = `apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: org-base-contracts
  description: "Organization-wide security contracts"
defaults:
  mode: enforce
contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret", "credentials"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' denied."
      tags: [secrets, dlp]

  - id: prod-deploy-approval
    type: pre
    tool: exec
    when:
      all:
        - args.command:
            contains: "deploy"
        - environment:
            equals: production
    then:
      effect: approve
      message: "Production deploy requires approval"
      timeout: 300
      timeout_effect: deny

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 100
      max_attempts: 200
    then:
      effect: deny
      message: "Session limit reached."`;

const MOCK_DEPLOYMENTS = [
  { id: "d1", env: "production", bundle_version: 3, deployed_by: "admin@example.com", created_at: "2026-02-26T14:30:00Z" },
  { id: "d2", env: "staging", bundle_version: 4, deployed_by: "admin@example.com", created_at: "2026-02-27T06:45:00Z" },
  { id: "d3", env: "development", bundle_version: 5, deployed_by: "admin@example.com", created_at: "2026-02-27T08:10:00Z" },
  { id: "d4", env: "staging", bundle_version: 3, deployed_by: "admin@example.com", created_at: "2026-02-26T12:00:00Z" },
  { id: "d5", env: "production", bundle_version: 2, deployed_by: "admin@example.com", created_at: "2026-02-25T16:00:00Z" },
];
```

**Playground mock data:**

```typescript
const MOCK_PLAYGROUND_PYTHON = `from edictum import Edictum, EdictumDenied

guard = Edictum.from_yaml("contracts.yaml")

# This will be DENIED - .env is a sensitive file
try:
    result = await guard.run(
        "read_file",
        {"path": "/app/.env"},
        read_file,
    )
except EdictumDenied as e:
    print(f"DENIED: {e.reason}")

# This will SUCCEED - safe file
result = await guard.run(
    "read_file",
    {"path": "/app/README.md"},
    read_file,
)`;

const MOCK_PLAYGROUND_OUTPUT = [
  { type: "audit", event: { action: "call_denied", tool_name: "read_file", decision_name: "block-sensitive-reads", reason: "Sensitive file '/app/.env' denied." } },
  { type: "text", text: "DENIED: Sensitive file '/app/.env' denied." },
  { type: "audit", event: { action: "call_allowed", tool_name: "read_file", decision_name: null, reason: null } },
  { type: "audit", event: { action: "call_executed", tool_name: "read_file", decision_name: null, reason: null } },
];
```

### Phase 2: Views 7-8 Mockups (same approach)

After View 6 mockups are built and the user picks, build 5 mockup variations each for:
- **View 7: API Keys** — designs and variations are in DASHBOARD.md
- **View 8: Settings** — designs and variations are in DASHBOARD.md

Use the same hardcoded data approach. Reference the existing Views 3-5 mockups for patterns.

### Mockup Component Pattern

Follow the existing pattern in `dashboard/src/pages/mockups/`. Each mockup:
- Is a self-contained page component (no API calls)
- Uses hardcoded data for visual comparison
- Uses the project's design system (Tailwind, shadcn/ui, Venture palette)
- Supports dark and light themes
- Is registered in App.tsx under the `/dashboard/mockups/` route group
- Is lazy-loaded

File naming: `contracts-v1.tsx`, `contracts-v2.tsx`, etc. (or whatever pattern Views 3-5 use).

### Mockup Gallery

Add the new mockups to the existing mockup gallery at `/dashboard/mockups`. Add a "Contracts" section to the sidebar navigation.

## Design Principles (Established, Non-Negotiable)

From DASHBOARD.md and previous design sessions:

- Tool arguments are the most important data. Show what the agent is trying to do.
- Real-time via SSE is table stakes.
- Adaptive layouts based on data volume.
- Countdown timers with color escalation for time-sensitive items.
- One-click approve, reason-required deny.
- Three-level data display: preview → structured detail → raw JSON.
- Empty state = onboarding. Never a blank page.
- Dark and light themes. Venture palette: navy dark, slate-50 light, amber accent.

## Brand System

Full brand system is in DASHBOARD.md. Key tokens:
- Accent: `#f59e0b` (amber)
- Enforce mode: accent colored
- Observe mode: `blue-400`/`blue-500` (distinct from enforce)
- Environment badges: production=`red`, staging=`amber`, development=`green`
- Fonts: Geist (body), Geist Mono (code)

## Terminology Reminders

- **contract** (not rule, policy, guard)
- **contract bundle** (not policy file)
- **denied** (not blocked, rejected)
- **observe mode** (not shadow mode, dry run)
- **finding** (not alert, violation)
- **pipeline** (not engine, evaluator)

Check `.docs-style-guide.md` before writing any text.

## Rules

- pnpm always
- No claude code mentions in commits
- Same coding standards as CLAUDE.md
- React 19 + TypeScript strict mode, no `any`
- Functional components only
- shadcn/ui for primitives
- Tailwind utility classes
- Components < 200 lines
- Dark theme by default
