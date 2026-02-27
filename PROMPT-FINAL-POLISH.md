# Final Non-Contracts Polish

> Quick session: fix remaining non-contracts issues before ship.

## Context

Read first:
- `CLAUDE.md` — project rules, shadcn mandate, shared modules table
- `PROMPT-FRONTEND-AUDIT.md` — quality gate checklist

## Setup

```bash
cd /Users/acartagena/project/edictum-console
cd dashboard && pnpm dev &
```

## Tasks

### 1. Replace 3 raw `<button>` with shadcn Button (trivial)

**event-filter-panel.tsx:101** — facet section collapse toggle:
```tsx
<button onClick={...} className="flex w-full items-center gap-1 rounded px-1.5 py-1.5 ...">
```
Replace with `<Button variant="ghost" size="sm" className="w-full justify-start h-auto px-1.5 py-1.5">`. Import Button from `@/components/ui/button`.

**event-filter-panel.tsx:121** — facet value filter toggle:
```tsx
<button key={value.key} onClick={...} className="flex w-full items-center justify-between rounded px-2 py-1 ...">
```
Replace with `<Button variant="ghost" size="sm" className="w-full justify-between h-auto px-2 py-1">`.

**event-list.tsx:316** — "Show N New Events" banner:
```tsx
<button onClick={onShowNewEvents} className="mx-3 mt-2 rounded-md bg-primary/10 ...">
```
Replace with `<Button variant="ghost" size="sm" className="mx-3 mt-2 bg-primary/10 text-primary hover:bg-primary/15">`.

### 2. Replace hardcoded hex in agent-grid sparkline (trivial)

**agent-grid.tsx:40:**
```tsx
const color = status === "healthy" ? "#10b981" : status === "degraded" ? "#f59e0b" : "#71717a"
```
Replace with Tailwind CSS variable references or semantic values. Since this is a Recharts stroke/fill that needs a raw color value, use:
```tsx
const color = status === "healthy"
  ? "hsl(var(--success))"
  : status === "degraded"
    ? "hsl(var(--warning))"
    : "hsl(var(--muted-foreground))"
```
Check that `--success` and `--warning` are defined in `dashboard/src/index.css` (they should be — the theme has them). If not, keep the hex but add a comment explaining why.

### 3. Unify SSE usage (small)

Three pages use SSE differently:
- `dashboard-home.tsx` — uses `useDashboardSSE` hook from `@/hooks/use-dashboard-sse`
- `events-feed.tsx` — uses `createDashboardSSE` directly
- `approvals-queue.tsx` — uses `createDashboardSSE` directly

Pick ONE pattern. The hook is cleaner (handles connect/disconnect/cleanup in useEffect). Migrate events-feed.tsx and approvals-queue.tsx to use `useDashboardSSE`.

Read `dashboard/src/hooks/use-dashboard-sse.ts` and `dashboard/src/pages/dashboard-home.tsx` to see the hook pattern.

For events-feed.tsx, the current SSE setup (lines ~139-148) becomes:
```tsx
useDashboardSSE({
  event_created: (data) => {
    const event = data as EventResponse
    setBufferedEvents((prev) => [event, ...prev])
  },
})
```

For approvals-queue.tsx, the current SSE setup (lines ~78-101) becomes:
```tsx
useDashboardSSE({
  approval_created: () => { void fetchPending() },
  approval_decided: () => { void fetchPending(); void fetchHistory() },
  approval_timeout: () => { void fetchPending(); void fetchHistory() },
})
```

Remove the manual `sseRef`, `setSseConnected` state, and cleanup logic that the hook now handles. If the hook doesn't expose connection status, either add it to the hook or remove the "Live updates paused" UI from approvals-queue.tsx (or keep it simple and skip the connection status for now).

### 4. Merge library branch + clean worktree

```bash
cd /Users/acartagena/project/edictum

# Remove the worktree first
git worktree remove .claude/worktrees/validated-juggling-brooks

# Merge the branch
git merge feat/from-server-reload

# Clean up
git branch -d feat/from-server-reload
```

If the worktree has uncommitted changes, check what they are before removing.

### 5. Split oversized files (optional but recommended)

Only do these if time allows. Priority order:

**bootstrap.tsx (344 lines)** — Extract 4 step components:
- `pages/bootstrap/credentials-step.tsx`
- `pages/bootstrap/api-key-step.tsx`
- `pages/bootstrap/test-step.tsx`
- `pages/bootstrap/done-step.tsx`
- Keep `pages/bootstrap.tsx` as the orchestrator (~80 lines)

**api.ts (292 lines)** — Split by domain:
- `lib/api/auth.ts` — login, logout, me
- `lib/api/events.ts` — listEvents
- `lib/api/approvals.ts` — listApprovals, submitDecision
- `lib/api/bundles.ts` — bundle CRUD
- `lib/api/index.ts` — re-exports + shared types + fetch wrapper

**event-detail.tsx (355 lines)** — Extract card sections:
- `pages/events/detail-decision-context.tsx`
- `pages/events/detail-tool-args.tsx`
- `pages/events/detail-contracts-evaluated.tsx`

## Verification

1. `pnpm tsc --noEmit` — must pass
2. Open Dashboard, Events, Approvals in dark mode — verify SSE still works on all 3
3. Switch to light mode — verify readable
4. Click an activity row in dashboard — verify deep link + scroll + highlight
5. `cd ~/project/edictum && python -m pytest tests/test_server/ -q` — all pass
6. No raw `<button>`, `<input>`, `<label>` in production code (excluding contracts/ and mockups/)
