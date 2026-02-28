# P2: Frontend Foundation — Types, Parser, API Client, Page Shell

> **Scope:** Install shadcn components, types.ts, yaml-parser.ts, API client additions, page shell with tab routing + SSE + URL sync
> **Depends on:** P1 (backend endpoints must exist)
> **Deliverable:** Empty tabs that route correctly, SSE connected, URL state synced
> **Time budget:** Single session

---

## Required Reading

1. `contracts_spec.md` — Full spec. Focus on §1.4-1.9 (foundation), §2.5 (API client), §7 (page shell), §8 (types)
2. `CLAUDE.md` — shadcn mandate, shared modules, light/dark rules
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate

## Existing Patterns to Follow

- **Events page:** `pages/events-feed.tsx` + `pages/events/*.tsx` — page shell with `useSearchParams`, `useDashboardSSE`, `useCallback` fetchers
- **Approvals page:** `pages/approvals-queue.tsx` + `pages/approvals/*.tsx` — same shell pattern
- **SSE hook:** `hooks/use-dashboard-sse.ts` — pass `{ eventName: handler }` object
- **API client:** Split into `lib/api/bundles.ts`, `lib/api/stats.ts`, `lib/api/index.ts`

---

## Step 0: Remove v1 Prototype

Delete the entire v1 prototype before writing any code:

```bash
rm -rf dashboard/src/components/contracts/
rm dashboard/src/pages/contracts.tsx
```

Then fix any broken imports in `App.tsx` — the `ContractsPage` import will need to point to the new location. Check that the app compiles after deletion.

---

## Step 1: Install shadcn Components

```bash
cd dashboard
pnpm dlx shadcn@latest add accordion sheet
```

Check if the Sonner wrapper component exists at `dashboard/src/components/ui/sonner.tsx`. If not:
```bash
pnpm dlx shadcn@latest add sonner
```

Verify `js-yaml`, `@types/js-yaml`, `diff`, `@types/diff` are in `package.json`. If not:
```bash
pnpm add js-yaml diff
pnpm add -D @types/js-yaml @types/diff
```

---

## Step 2: Create `pages/contracts/types.ts`

Copy the types from `contracts_spec.md` §8 exactly. Key types:

- `ContractType`, `Effect`, `Mode`, `SideEffect`
- `ToolClassification`, `ContractBundle`, `ParsedContract`, `ActionBlock`
- `Expression` (recursive union type)
- `ContractDiff`

**All `Record` types must have both parameters:** `Record<string, unknown>`, `Record<string, number>`, `Record<string, ToolClassification>`. No bare `Record`.

This file should be ~80 lines. Types only, no logic.

---

## Step 3: Create `pages/contracts/yaml-parser.ts`

Three exported functions:

### `parseContractBundle(yamlString: string): ContractBundle`

- Parse with `js-yaml` (`yaml.load()`)
- Validate required fields: `apiVersion === "edictum/v1"`, `kind === "ContractBundle"`, `metadata.name` exists, `contracts` is an array
- Coerce types where needed (YAML parsing may return unexpected types)
- Throw descriptive errors on invalid input
- Reference `~/project/edictum/docs/contracts/yaml-reference.md` for field semantics

### `validateBundle(yamlString: string): { valid: boolean; error?: string; contractCount?: number }`

- Wraps `parseContractBundle` in try/catch
- Returns `{ valid: true, contractCount: N }` on success
- Returns `{ valid: false, error: "message" }` on failure
- Used by upload-sheet for inline validation

### `diffContracts(oldBundle: ContractBundle, newBundle: ContractBundle): ContractDiff`

- Compare by contract `id`
- Added: IDs in new not in old
- Removed: IDs in old not in new
- Modified: same ID, different content — generate human-readable change descriptions
  - Compare `when` expressions (JSON stringify + compare)
  - Compare `then` blocks
  - Compare `limits`, `within`, `not_within`, `allows`
  - Return descriptions like "added .pem to contains_any list", "max_tool_calls 30 → 50"
- Unchanged: IDs with identical content

**File size target:** ~120-150 lines. If approaching 200, extract `diffContracts` to a separate `yaml-diff.ts`.

---

## Step 4: API Client Additions

### Add to `dashboard/src/lib/api/bundles.ts`

New types and functions (from `contracts_spec.md` §2.5):

```typescript
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

export function listDeployments(env?: string, limit = 50) {
  const params = new URLSearchParams()
  if (env) params.set("env", env)
  params.set("limit", String(limit))
  return request<DeploymentResponse[]>(`/deployments?${params}`)
}
```

**Important:** `DeploymentResponse` already exists in this file. Do NOT create a duplicate type.

### Add to `dashboard/src/lib/api/stats.ts`

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

### Update `dashboard/src/lib/api/index.ts`

Add re-exports for all new functions and types:

```typescript
export { evaluateBundle, listDeployments } from "./bundles"
export { getContractStats } from "./stats"
export type { EvaluateRequest, EvaluateResponse, ContractEvaluation } from "./bundles"
export type { ContractCoverage, ContractStatsResponse } from "./stats"
```

---

## Step 5: Page Shell — `pages/contracts.tsx`

**Pattern to follow:** Events page (`pages/events-feed.tsx`).

### URL State

```typescript
const [searchParams, setSearchParams] = useSearchParams()
const activeTab = searchParams.get("tab") ?? "contracts"
```

Tab change syncs to URL:
```typescript
const setTab = useCallback((tab: string) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    next.set("tab", tab)
    return next
  })
}, [setSearchParams])
```

**Important:** Create a new `URLSearchParams` from `prev` — do NOT mutate `prev` directly (React won't detect the change).

### Data Loading

```typescript
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
```

### SSE

```typescript
useDashboardSSE({
  bundle_uploaded: (data: unknown) => {
    const d = data as { version: number }
    toast.success(`Version v${d.version} uploaded`)
    refresh()
  },
  contract_update: (data: unknown) => {
    const d = data as { version: number; env: string }
    toast.success(`v${d.version} deployed to ${d.env}`)
    refresh()
  },
})
```

### Tab Rendering

Use shadcn `Tabs` with `variant="line"` (underline style):

```tsx
<Tabs value={activeTab} onValueChange={setTab}>
  <TabsList variant="line">
    <TabsTrigger value="contracts">Contracts</TabsTrigger>
    <TabsTrigger value="versions">Versions</TabsTrigger>
    <TabsTrigger value="diff">Diff</TabsTrigger>
    <TabsTrigger value="evaluate">Evaluate</TabsTrigger>
  </TabsList>
  <TabsContent value="contracts">
    {/* Placeholder: "Contracts tab — coming in P3" */}
  </TabsContent>
  <TabsContent value="versions">
    {/* Placeholder: "Versions tab — coming in P4" */}
  </TabsContent>
  <TabsContent value="diff">
    {/* Placeholder: "Diff tab — coming in P5" */}
  </TabsContent>
  <TabsContent value="evaluate">
    {/* Placeholder: "Evaluate tab — coming in P6" */}
  </TabsContent>
</Tabs>
```

For now, each tab content is a simple placeholder `<div>` with the tab name. P3-P6 will replace these.

### Header

Match the Events page header pattern:
- Title: "Contracts" with icon
- Subtitle: "N contracts in bundle" or "No contract bundles uploaded yet"
- Action buttons area (right-aligned) — empty for now, Upload/Deploy buttons added in P3-P4

### Loading/Error States

- Loading: centered `Loader2` spinner (full page, like Events)
- Error: centered error message with retry button

### File Size

Should be ~100-130 lines. If the header section gets large, extract to a `contracts-header.tsx`.

---

## Step 6: Update App.tsx

The existing `ContractsPage` import points to the old location. Update it:

```typescript
import { ContractsPage } from "@/pages/contracts"
```

Verify the route exists:
```tsx
<Route path="contracts" element={<ContractsPage />} />
```

If it was removed during cleanup, add it back inside the authenticated `/dashboard` routes.

---

## Verification Checklist

After implementation, verify in the browser:

- [ ] `pnpm build` compiles without errors
- [ ] Navigate to `/dashboard/contracts` → see "Contracts" tab active with placeholder content
- [ ] Click each tab → URL updates (`?tab=versions`, `?tab=diff`, `?tab=evaluate`)
- [ ] Refresh page with `?tab=diff` in URL → Diff tab is active
- [ ] Open browser console → SSE connection established (check Network tab for `/api/v1/stream/dashboard`)
- [ ] Upload a bundle via curl or existing UI → toast notification appears "Version vN uploaded"
- [ ] Deploy a bundle → toast "vN deployed to {env}"
- [ ] `accordion` component exists in `components/ui/accordion.tsx`
- [ ] `sheet` component exists in `components/ui/sheet.tsx`
- [ ] `sonner` component exists in `components/ui/sonner.tsx`
- [ ] No TypeScript errors (`pnpm tsc --noEmit`)
- [ ] No `any` types in new files
- [ ] All new files under 200 lines
- [ ] `yaml-parser.ts` can parse the devops-agent template (import in browser console or write a quick test)
- [ ] `yaml-parser.ts` can parse the governance-v5 template (all contract types)
- [ ] `diffContracts` produces correct output for two different bundles
- [ ] No duplicated utility functions — uses `@/lib/format`, `@/lib/env-colors`, `@/lib/verdict-helpers` where needed
- [ ] Dark mode: placeholder content readable
- [ ] Light mode: placeholder content readable
