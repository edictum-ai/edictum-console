# P1: Code Quality Foundation

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group A (items A1-A12)
> **Depends on:** Nothing — this is the foundation prompt
> **Deliverable:** All shared code extracted, duplicates removed, type safety fixed, dead code removed
> **Files touched:** ~15 files

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — coding standards, shadcn mandate, color rules (`text-*-600 dark:text-*-400`, `bg-*/15`, `border-*/30`)
2. `dashboard/src/lib/verdict-helpers.tsx` — current verdict color APIs
3. `dashboard/src/lib/format.ts` — current `getArgsPreview` (to be removed)
4. `dashboard/src/lib/payload-helpers.ts` — current `extractArgsPreview` (to be kept)
5. `dashboard/src/lib/api/client.ts` — current `request<T>` with `undefined as T` bug
6. `dashboard/src/lib/api/settings.ts` — `deleteChannel` uses `request<void>`
7. `dashboard/src/lib/api/index.ts` — barrel exports
8. `dashboard/src/pages/contracts/contracts-tab.tsx` — local `TYPE_BADGE` to remove
9. `dashboard/src/pages/contracts/diff-summary.tsx` — local `TYPE_COLORS` to remove
10. `dashboard/src/pages/contracts/bundle-header.tsx` — local `MODE_STYLES` to remove
11. `dashboard/src/pages/contracts/contract-row.tsx` — local `MODE_STYLES` to remove
12. `dashboard/src/pages/events/event-list.tsx` — re-exports to remove
13. `dashboard/src/pages/events/event-detail.tsx` — local `DetailRow` to extract
14. `dashboard/src/pages/events/detail-decision-context.tsx` — local `DetailRow` to extract
15. `dashboard/src/pages/approvals/approvals-table.tsx` — consumer of `getArgsPreview`
16. `dashboard/src/pages/approvals/badges.tsx` — dead `EnvBadge` re-export
17. `dashboard/src/hooks/use-dashboard-sse.ts` — frozen handler keys bug
18. `dashboard/src/pages/dashboard-home.tsx` — unsafe SSE type assertion
19. `dashboard/src/pages/contracts.tsx` — unsafe SSE type assertion
20. `dashboard/src/pages/contracts/evaluate-manual.tsx` — eslint-disable
21. `dashboard/src/pages/contracts/evaluate-replay.tsx` — eslint-disable
22. `dashboard/src/pages/events-feed.tsx` — imports re-exports from event-list

## Shared Modules Reference

| Module | What's already there | Don't duplicate |
|--------|---------------------|-----------------|
| `lib/format.ts` | `formatRelativeTime`, `formatArgs`, `formatToolArgs`, `formatTime`, `truncate` | These stay — only remove `getArgsPreview` |
| `lib/verdict-helpers.tsx` | `verdictColor`, `VerdictIcon`, `VERDICT_STYLES`, `verdictDot` | Unify `verdictColor` → derive from `VERDICT_STYLES` |
| `lib/env-colors.tsx` | `ENV_COLORS`, `EnvBadge` | Don't touch |
| `lib/payload-helpers.ts` | `extractProvenance`, `contractLabel`, `isObserveFinding`, `extractArgsPreview` | Keep `extractArgsPreview`, add direct-args overload |
| `lib/histogram.ts` | `TimeWindow`, `resolveWindow`, `DEFAULT_TIME_WINDOW`, etc. | Don't touch — but stop re-exporting from event-list |

---

## Tasks

### A1: Create `lib/contract-colors.ts`

Create `dashboard/src/lib/contract-colors.ts`:

```typescript
/**
 * Shared contract type and mode color definitions.
 * Single source of truth — text-*-600 dark:text-*-400 for light/dark compatibility.
 */

/** Contract type badge styles (pre, post, session, sandbox). */
export const CONTRACT_TYPE_COLORS: Record<string, string> = {
  pre: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  post: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  session: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  sandbox: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
}

/** Mode badge styles (enforce, observe). */
export const CONTRACT_MODE_COLORS: Record<string, string> = {
  enforce: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  observe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
}
```

Then update consumers:
- `contracts-tab.tsx` — remove local `TYPE_BADGE`, import `CONTRACT_TYPE_COLORS`
- `diff-summary.tsx` — remove local `TYPE_COLORS`, import `CONTRACT_TYPE_COLORS`
- `bundle-header.tsx` — remove local `MODE_STYLES`, import `CONTRACT_MODE_COLORS`
- `contract-row.tsx` — remove local `MODE_STYLES`, import `CONTRACT_MODE_COLORS`

### A2: Unify verdict border opacity

In `dashboard/src/lib/verdict-helpers.tsx`:
- Change `VERDICT_STYLES` border values from `/25` to `/30` (lines for allowed, denied, pending, timeout)
- Make `verdictColor()` a thin wrapper that returns from `VERDICT_STYLES`:
  ```typescript
  export function verdictColor(v: string): string {
    return VERDICT_STYLES[v] ?? VERDICT_STYLES["timeout"] ?? ""
  }
  ```

### A3: Remove `getArgsPreview` duplication

1. In `dashboard/src/lib/payload-helpers.ts`, add a convenience wrapper that takes plain args:
   ```typescript
   /** Preview from a plain tool_args record (no event wrapper needed). */
   export function argsPreview(toolArgs: Record<string, unknown> | null): string {
     if (!toolArgs) return "(no arguments)"
     const entries = Object.entries(toolArgs)
     if (entries.length === 0) return "(empty)"
     const preview = entries
       .slice(0, 2)
       .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
       .join(", ")
     return entries.length > 2 ? `${preview} ...` : preview
   }
   ```
2. Remove `getArgsPreview` from `dashboard/src/lib/format.ts`
3. Update `dashboard/src/pages/approvals/approvals-table.tsx` — change import from `getArgsPreview` to `argsPreview` from `@/lib/payload-helpers`

### A4: Extract `DetailRow` to shared component

Create `dashboard/src/components/detail-row.tsx`:
```typescript
interface DetailRowProps {
  label: string
  value: string | null | undefined
  mono?: boolean
}

export function DetailRow({ label, value, mono }: DetailRowProps) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}
```

Check the exact `DetailRow` interface in both `event-detail.tsx` and `detail-decision-context.tsx` — merge any differences into the shared component. Then update both files to import from `@/components/detail-row`.

### A5: Fix `request<T>` type safety for 204 responses

In `dashboard/src/lib/api/client.ts`:
1. Add `requestVoid`:
   ```typescript
   export async function requestVoid(
     path: string,
     options: RequestInit = {},
   ): Promise<void> {
     const res = await fetch(`${API_BASE}${path}`, {
       credentials: "include",
       headers: { "Content-Type": "application/json", ...options.headers },
       ...options,
     })
     if (!res.ok) {
       const body = await res.text()
       const retryAfter = res.headers.get("Retry-After")
       throw new ApiError(res.status, body, retryAfter ? parseInt(retryAfter, 10) : undefined)
     }
   }
   ```
2. Remove the `if (res.status === 204) return undefined as T` line from `request<T>`
3. In `dashboard/src/lib/api/settings.ts`, change `deleteChannel` to use `requestVoid`
4. In `dashboard/src/lib/api/index.ts`, export `requestVoid`

### A6: Fix event-list re-exports

1. In `dashboard/src/pages/events/event-list.tsx`, remove lines 50-51:
   ```
   export type { TimeWindow, PresetKey }
   export { DEFAULT_TIME_WINDOW, resolveWindow }
   ```
2. In `dashboard/src/pages/events-feed.tsx`, change imports from `./events/event-list` to `@/lib/histogram`:
   ```typescript
   import { type TimeWindow, DEFAULT_TIME_WINDOW, resolveWindow } from "@/lib/histogram"
   ```

### A7: Fix barrel import bypass

- `dashboard/src/pages/settings/danger-zone/rotate-key-dialog.tsx` — change `import { rotateSigningKey } from "@/lib/api/settings"` to `import { rotateSigningKey } from "@/lib/api"`
- `dashboard/src/pages/settings/danger-zone/purge-events-dialog.tsx` — change `import { purgeEvents } from "@/lib/api/settings"` to `import { purgeEvents } from "@/lib/api"`

### A8: Fix unsafe SSE type assertions

In `dashboard/src/pages/dashboard-home.tsx`, add a guard:
```typescript
new_event: (raw) => {
  const event = raw as Record<string, unknown>
  if (typeof event?.id === "string" && typeof event?.tool_name === "string") {
    setEvents((prev) => [event as EventResponse, ...prev].slice(0, 100))
  }
},
```

In `dashboard/src/pages/contracts.tsx`, add a guard:
```typescript
bundle_uploaded: (data: unknown) => {
  const d = data as Record<string, unknown>
  if (typeof d?.bundle_name === "string" && typeof d?.version === "number") {
    toast.success(`${d.bundle_name} v${d.version} uploaded`)
    void refreshSummaries()
    if (d.bundle_name === selectedBundle) void refreshVersions()
  }
},
```

Apply the same pattern to all other SSE handlers in `contracts.tsx`.

### A9: Fix `useDashboardSSE` frozen handler keys

In `dashboard/src/hooks/use-dashboard-sse.ts`:
```typescript
export function useDashboardSSE(handlers: Record<string, (data: unknown) => void>) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const handlerKeys = Object.keys(handlers).sort().join(",")

  useEffect(() => {
    if (!handlerKeys) return

    const proxyHandlers: Record<string, (data: unknown) => void> = {}
    for (const key of handlerKeys.split(",")) {
      proxyHandlers[key] = (data) => handlersRef.current[key]?.(data)
    }

    let client: SSEClient | null = createDashboardSSE(proxyHandlers)
    client.connect()

    return () => {
      client?.disconnect()
      client = null
    }
  }, [handlerKeys])
}
```

### A10: Fix eslint-disable suppressions

In `dashboard/src/pages/contracts/evaluate-manual.tsx` and `evaluate-replay.tsx`:
- Remove the `// eslint-disable-line react-hooks/exhaustive-deps` comments
- Structure the effect so deps are correct — only `selectedBundle` should trigger the reset:
  ```typescript
  useEffect(() => {
    setTool("")
    setArgsJson("{}")
    setResult(null)
  }, [selectedBundle])
  ```

### A11: Remove unused dependency

```bash
cd dashboard && pnpm remove @tanstack/react-virtual
```

### A12: Remove dead code

In `dashboard/src/pages/approvals/badges.tsx`, remove lines 5-6:
```
// Re-export EnvBadge from shared module for backwards compatibility
export { EnvBadge } from "@/lib/env-colors"
```

No file imports `EnvBadge` from badges.tsx.

---

## Verification Checklist

- [ ] `grep -r "TYPE_BADGE\|TYPE_COLORS" dashboard/src/pages/` → zero hits (all come from lib/)
- [ ] `grep -r "MODE_STYLES" dashboard/src/pages/` → zero hits
- [ ] `grep -r "getArgsPreview" dashboard/src/` → zero hits
- [ ] `grep -rn "function DetailRow" dashboard/src/` → exactly 1 hit (in components/detail-row.tsx)
- [ ] `grep -r "undefined as T" dashboard/src/` → zero hits
- [ ] `grep -r "export.*TimeWindow\|export.*resolveWindow" dashboard/src/pages/` → zero hits
- [ ] `grep -r "from.*@/lib/api/settings" dashboard/src/pages/` → zero hits
- [ ] `grep -r "eslint-disable" dashboard/src/pages/contracts/` → zero hits
- [ ] `grep -r "@tanstack/react-virtual" dashboard/package.json` → zero hits
- [ ] `grep -r "EnvBadge" dashboard/src/pages/approvals/badges.tsx` → zero hits
- [ ] `grep "/25" dashboard/src/lib/verdict-helpers.tsx` → zero hits (all use /30)
- [ ] `pnpm --dir dashboard build` completes without errors
- [ ] Visual regression check: contract type badges (pre/post/session/sandbox) and mode badges (enforce/observe) look identical before and after extraction. Open contracts page in both dark and light mode.
