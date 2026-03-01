# P6: Minor Polish & Cleanup

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group F (items F1-F7)
> **Depends on:** P1-P5 (cleanup pass, best run last)
> **Deliverable:** Accessibility improvements, clipboard error handling, SSE jitter, edge case fixes, code cleanup
> **Files touched:** ~10 files

---

## Required Reading

Read these files before writing any code:

1. `dashboard/src/components/dashboard/triage-column.tsx` — approve/deny buttons need aria-labels
2. `dashboard/src/pages/approvals/approvals-table.tsx` — expand chevron needs aria-label
3. `dashboard/src/pages/approvals-queue.tsx` — view mode toggles need aria-labels
4. `dashboard/src/pages/events/detail-decision-context.tsx` — clipboard copy
5. `dashboard/src/pages/events/detail-tool-args.tsx` — clipboard copy
6. `dashboard/src/pages/api-keys/create-key-dialog.tsx` — clipboard copy
7. `dashboard/src/lib/sse.ts` — reconnection logic
8. `dashboard/src/lib/format.ts` — `formatRelativeTime`
9. `dashboard/src/lib/derive-agents.ts` — magic numbers
10. `dashboard/src/components/dashboard/activity-column.tsx` — "View all" threshold
11. `dashboard/src/pages/api-keys.tsx` — revoke + refetch pattern

## Shared Modules Reference

| Import | From |
|--------|------|
| `toast` | `sonner` |

---

## Tasks

### F1: Add missing `aria-label` attributes

**`dashboard/src/components/dashboard/triage-column.tsx`:**
Add `aria-label` to approve/deny buttons:
```tsx
<Button ... aria-label="Approve">
  <Check className="size-3" />
</Button>
<Button ... aria-label="Deny">
  <X className="size-3" />
</Button>
```

**`dashboard/src/pages/approvals/approvals-table.tsx`:**
Add `aria-label` to the expand chevron:
```tsx
<Button ... aria-label="Expand row">
  <ChevronDown ... />
</Button>
```

**`dashboard/src/pages/approvals-queue.tsx`:**
If view mode toggles use `title` prop, change to `aria-label` (more accessible). Or add both — `title` for hover tooltip, `aria-label` for screen readers.

### F2: Fix clipboard copy error handling

**Files:** `detail-decision-context.tsx`, `detail-tool-args.tsx`, `create-key-dialog.tsx`

In each file, wrap `navigator.clipboard.writeText` with try/catch and add a timeout cleanup:

```typescript
const [copied, setCopied] = useState(false)
const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()

async function handleCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  } catch {
    toast.error("Failed to copy to clipboard")
    return
  }
  clearTimeout(copyTimerRef.current)
  copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
}

// Cleanup on unmount
useEffect(() => {
  return () => clearTimeout(copyTimerRef.current)
}, [])
```

If the file already has a simple `setCopied(true)` + `setTimeout(() => setCopied(false), 2000)` without cleanup, add the cleanup ref to prevent the state update after unmount.

### F3: Add jitter to SSE reconnection

**File:** `dashboard/src/lib/sse.ts`

In the `onerror` handler, add jitter to prevent thundering herd:

```typescript
// Before
setTimeout(() => {
  this.createConnection()
}, this.reconnectDelay)

// After
const jitter = this.reconnectDelay * (0.5 + Math.random())
setTimeout(() => {
  this.createConnection()
}, jitter)
```

This spreads reconnection attempts between 50%-150% of the base delay.

### F4: Fix `formatRelativeTime` edge cases

**File:** `dashboard/src/lib/format.ts`

```typescript
export function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return "never"
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return "invalid date"
  const diff = Date.now() - date.getTime()
  if (diff < 0) return "just now"  // Handle future timestamps (clock skew)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
```

Changes: add `isNaN` check and future timestamp handling.

**Optional:** Add unit tests in `dashboard/__tests__/format.test.ts` (using vitest):
```typescript
import { formatRelativeTime } from "../src/lib/format"

test("formatRelativeTime edge cases", () => {
  expect(formatRelativeTime("")).toBe("never")
  expect(formatRelativeTime("not-a-date")).toBe("invalid date")
  expect(formatRelativeTime(new Date(Date.now() + 60000).toISOString())).toBe("just now")
})
```

If vitest is not configured, skip the test file — the manual verification checklist below covers these cases.

### F5: Extract magic numbers in `derive-agents.ts`

**File:** `dashboard/src/lib/derive-agents.ts`

Add named constants at the top of the file:

```typescript
/** Agent is considered offline if no activity for this duration. */
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000   // 30 minutes

/** Denied rate above which an agent is considered degraded. */
const DEGRADED_DENIED_RATE = 0.3               // 30%

/** Minimum denied count before degraded status applies. */
const DEGRADED_MIN_DENIED = 3

/** Duration of each sparkline time bucket. */
const SPARKLINE_BUCKET_MS = 5 * 60 * 1000      // 5 minutes

/** Number of sparkline time buckets (1 hour total). */
const SPARKLINE_BUCKET_COUNT = 12
```

Then replace the inline values:
- `30 * 60 * 1000` → `OFFLINE_THRESHOLD_MS`
- `0.3` → `DEGRADED_DENIED_RATE`
- `3` → `DEGRADED_MIN_DENIED` (the `>= 3` check)
- `5 * 60 * 1000` → `SPARKLINE_BUCKET_MS`
- `12` (in both the bucket loop and `11` in the loop start) → `SPARKLINE_BUCKET_COUNT`

### F6: Fix Activity column "View all" threshold

**File:** `dashboard/src/components/dashboard/activity-column.tsx` (line 174)

```typescript
// Before
{filteredEvents.length > 30 && (

// After
{filteredEvents.length > 15 && (
```

The list is sliced to 15 items (line 130: `.slice(0, 15)`), so the "View all events" button should appear when there are more than 15 events.

### F7: Fix API key revoke — pick one approach

**File:** `dashboard/src/pages/api-keys.tsx`

The current code does both an optimistic update AND a refetch. Remove the refetch:

```typescript
const handleRevoked = useCallback(() => {
  if (revokeTarget) {
    setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id))
  }
  setRevokeTarget(null)
  toast.success("API key revoked")
  // Don't refetch — the optimistic update is sufficient
}, [revokeTarget])
```

Find and remove the `void fetchKeys()` call that follows the optimistic update.

---

## Verification Checklist

- [ ] Tab through triage column — approve/deny buttons announce their labels
- [ ] Tab through approvals table — expand buttons announce "Expand row"
- [ ] Clipboard: copying text shows success, failing to copy (e.g., in iframe) shows error toast
- [ ] SSE: disconnect + reconnect uses jittered delay (check in network tab — reconnections are not all at exactly the same interval)
- [ ] `formatRelativeTime("")` returns "never"
- [ ] `formatRelativeTime("not-a-date")` returns "invalid date"
- [ ] `formatRelativeTime` with a future timestamp returns "just now"
- [ ] `derive-agents.ts` has no bare numeric literals for thresholds
- [ ] Activity column "View all events" button appears when there are 16+ events (not 31+)
- [ ] Revoking an API key removes it from the list without a flash/reload
- [ ] `pnpm --dir dashboard build` completes without errors
- [ ] Check both dark and light mode
