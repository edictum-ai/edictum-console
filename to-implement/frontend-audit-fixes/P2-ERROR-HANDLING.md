# P2: Error Handling & Loading States

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group B (items B1-B4)
> **Depends on:** P1 (shared modules must exist)
> **Deliverable:** Every page has error banners with retry, skeleton loading layouts, stats bar handles zero correctly
> **Files touched:** ~7 files

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — shadcn mandate (Alert, Skeleton, Button, Loader2)
2. `dashboard/src/pages/dashboard-home.tsx` — empty catch block, Loader2 spinner
3. `dashboard/src/pages/approvals-queue.tsx` — 6 empty catch blocks
4. `dashboard/src/components/dashboard/stats-bar.tsx` — "100%" on zero events
5. `dashboard/src/pages/events-feed.tsx` — current loading pattern (reference)
6. `dashboard/src/pages/settings.tsx` — skeleton loading pattern (reference)
7. `dashboard/src/pages/api-keys.tsx` — current loading pattern

## Shared Modules Reference

| Import | From |
|--------|------|
| `Alert, AlertDescription` | `@/components/ui/alert` |
| `Button` | `@/components/ui/button` |
| `Skeleton` | `@/components/ui/skeleton` |
| `Loader2, AlertCircle` | `lucide-react` |
| `toast` | `sonner` |

---

## Tasks

### B1: Add error handling to Dashboard Home

**File:** `dashboard/src/pages/dashboard-home.tsx`

1. Add error state:
   ```typescript
   const [error, setError] = useState<string | null>(null)
   ```

2. In the catch block (currently empty at line ~35):
   ```typescript
   } catch {
     setError("Failed to load dashboard data")
     toast.error("Failed to load dashboard data")
   } finally {
   ```

3. Show an error banner above the content when `error` is set. Don't hide existing data — stale data + error banner is better than a blank error screen:
   ```tsx
   {error && (
     <Alert variant="destructive" className="mx-4 mt-4">
       <AlertCircle className="h-4 w-4" />
       <AlertDescription className="flex items-center justify-between">
         {error}
         <Button variant="outline" size="sm" onClick={() => { setError(null); void fetchData() }}>
           Retry
         </Button>
       </AlertDescription>
     </Alert>
   )}
   ```

4. Add same pattern to the SSE `approval_update` handler's `.catch(() => {})` — replace with `.catch(() => toast.error("Failed to refresh approvals"))`.

### B2: Add error handling to Approvals Queue

**File:** `dashboard/src/pages/approvals-queue.tsx`

1. Add error state for page-level failures
2. Replace all 6 empty `catch {}` blocks:
   - **Page load failures** → `setError(...)` + `toast.error(...)`
   - **Action failures** (approve/deny) → `toast.error("Failed to submit decision")`
   - **Fetch failures** (refresh) → `toast.error("Failed to refresh approvals")`
3. Show the same `<Alert variant="destructive">` pattern as B1 for page-level errors
4. Keep existing data visible when a refresh fails

### B3: Consistent skeleton loading across all pages

Replace lone centered `<Loader2>` spinners with page-structure-matching skeletons. Each page gets a skeleton that previews its layout.

**Files to update:**

#### `dashboard/src/pages/dashboard-home.tsx`
```tsx
if (loading && statsLoading) {
  return (
    <div className="flex flex-col p-4">
      {/* Stats bar skeleton */}
      <div className="-mx-4 -mt-4 mb-0 border-b border-border bg-card/30 px-6 py-3">
        <div className="flex items-center gap-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
      {/* Two column skeleton */}
      <div className="mt-4 grid grid-cols-[2fr_3fr] gap-4 h-[50vh]">
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2 p-4">
          <Skeleton className="h-[120px] w-full rounded-lg" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

#### `dashboard/src/pages/events-feed.tsx`
Replace `<Loader2>` with a three-panel skeleton matching the filter+list+detail layout.

#### `dashboard/src/pages/approvals-queue.tsx`
Replace with skeleton cards (3 cards) or skeleton table rows depending on current view mode.

#### `dashboard/src/pages/contracts.tsx`
Replace with a skeleton showing the tab bar + content area.

#### `dashboard/src/pages/api-keys.tsx`
Replace with skeleton table rows (3 rows with columns matching the key table).

**Pattern:**
```tsx
function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### B4: Fix "Approval Rate 100%" with zero events

**File:** `dashboard/src/components/dashboard/stats-bar.tsx`

Change line ~62-64:
```typescript
// Before
const approvalRate =
  stats.events_24h > 0
    ? (((stats.events_24h - stats.denials_24h) / stats.events_24h) * 100).toFixed(1)
    : "100"

// After
const approvalRate =
  stats.events_24h > 0
    ? `${(((stats.events_24h - stats.denials_24h) / stats.events_24h) * 100).toFixed(1)}%`
    : "—"
```

Also update the value rendering to not append `%` again if already included:
```tsx
value={approvalRate}
```

---

## Verification Checklist

- [ ] Dashboard Home: catch block shows toast + Alert banner. Retry button works.
- [ ] Approvals Queue: no empty catch blocks. `grep -r "catch {}" dashboard/src/pages/approvals-queue.tsx` → zero hits
- [ ] All 5 pages show skeleton layouts during loading (not a lone spinner)
- [ ] Stats bar shows "—" for approval rate when events_24h is 0
- [ ] Error banner doesn't hide existing data (stale data + banner is the correct UX)
- [ ] `pnpm --dir dashboard build` completes without errors
- [ ] Check both dark and light mode
