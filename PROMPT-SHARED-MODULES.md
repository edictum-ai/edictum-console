# Shared Modules Extraction + Light Mode Fix

> Worktree session: Extract duplicated code into shared modules, then fix light/dark color consistency across all files.

## Context

Read first:
- `CLAUDE.md` — coding standards, shadcn mandate
- `PROMPT-FRONTEND-AUDIT.md` — quality checklist

## Setup

```bash
cd /Users/acartagena/project/edictum-console
cd dashboard && pnpm dev &
# Dashboard: http://localhost:5174/dashboard
```

## Phase 1: Extract Shared Modules

### A. Create `lib/format.ts`

Consolidate ALL formatting functions scattered across the codebase:

| Function | Currently In | Notes |
|----------|-------------|-------|
| `formatRelativeTime` | activity-column.tsx, history-table.tsx, derive-agents.ts | 3 different impls. Use the most complete (handles "never" + days). |
| `timeAgo` | versions-tab.tsx | Different name, same concept. Merge with `formatRelativeTime`. |
| `formatArgs` | triage-column.tsx | Inline `key=value, key=value` |
| `formatToolArgs` | approval-card.tsx | Pretty-printed JSON |
| `getArgsPreview` | approvals-table.tsx | Truncated inline |
| `formatTime` | event-list.tsx | `HH:MM:SS` format |
| `truncate` | event-list.tsx | Generic string truncation |
| `formatResponseTime` | history-table.tsx | Duration between two timestamps |

After creating `lib/format.ts`, update ALL importing files to use it. Delete the local copies.

### B. Create `lib/verdict-helpers.ts`

Consolidate verdict-related code:

| Item | Currently In | Notes |
|------|-------------|-------|
| `verdictColor()` | event-list.tsx, event-detail.tsx | Identical. Returns CSS classes. |
| `VerdictIcon` component | event-list.tsx, event-detail.tsx | Identical. Shield icons by verdict. |
| `VERDICT_STYLES` | activity-column.tsx, playground-tab.tsx | Different shapes. Unify. |
| `verdictDot()` | event-filter-panel.tsx | Dot color by verdict. |

**CRITICAL:** All verdict colors must use `text-*-600 dark:text-*-400` pattern. activity-column.tsx does this correctly — use it as reference.

### C. Create `lib/env-colors.ts`

Consolidate environment color definitions:

| Item | Currently In |
|------|-------------|
| `ENV_COLORS` object | agent-grid.tsx, bundle-header.tsx, versions-tab.tsx |
| `EnvBadge` component | approvals/badges.tsx |

Decisions to standardize:
- **development** color: `emerald` (not `sky` as in agent-grid.tsx)
- **Opacity:** `bg-*/15`, `border-*/30` everywhere (not `/10`, `/20`)
- **Text:** `text-*-600 dark:text-*-400` pattern
- Export a single `EnvBadge` component and `ENV_COLORS` constant. Update ALL files.

### D. Move `extractArgsPreview` to `lib/payload-helpers.ts`

Two implementations exist:
1. activity-column.tsx — simple (checks common keys)
2. event-list.tsx — sophisticated (tool-name-aware heuristics)

Use the event-list.tsx version as canonical. Move to `lib/payload-helpers.ts` (which already has related functions). Delete both local copies.

### E. Create `lib/histogram.ts`

Extract from event-list.tsx and activity-column.tsx:
- `HistogramBucket` type
- `buildHistogram()` function
- Chart config constants (with CSS variable colors, not hardcoded hex)

The two implementations differ (activity-column is simpler). Keep the event-list.tsx version as canonical. activity-column.tsx should call it with appropriate defaults.

## Phase 2: Light Mode Color Fix

After shared modules are extracted, do a systematic pass across ALL .tsx files in `dashboard/src/` (excluding `mockups/` and `components/ui/`).

**The rule:** Every `text-*-400` that is NOT inside a `dark:` prefix must become `text-*-600 dark:text-*-400`.

Known affected files (from audit):
- `components/contracts/types.ts` — TYPE_COLORS, EFFECT_COLORS, MODE_COLORS
- `components/contracts/contract-row.tsx` — boundary labels
- `components/contracts/diff-renderer.tsx` — added/removed text
- `components/contracts/diff-tab.tsx` — summary counts
- `components/contracts/playground-tab.tsx` — verdict styles, error text, icons
- `components/contracts/bundle-header.tsx` — ENV_COLORS (handled by Phase 1C)
- `components/contracts/versions-tab.tsx` — ENV_COLORS (handled by Phase 1C)
- `components/dashboard/agent-grid.tsx` — production env, bundle badge, observe badge
- `pages/events/event-detail.tsx` — verdictColor, VerdictIcon (handled by Phase 1B)
- `pages/events/event-list.tsx` — verdictColor, VerdictIcon (handled by Phase 1B)
- `pages/events/event-filter-panel.tsx` — verdictDot (handled by Phase 1B)
- `pages/approvals/badges.tsx` — EnvBadge, StatusBadge
- `pages/approvals/timer.tsx` — zoneTextColor, zoneBadgeStyle
- `pages/approvals/approvals-table.tsx` — deny button
- `pages/approvals/expanded-detail.tsx` — timeout effect
- `pages/approvals/history-table.tsx` — decision reason
- `pages/approvals-queue.tsx` — pending badge, icons, SSE warning
- `pages/contracts.tsx` — empty state icon

Also fix hardcoded hex colors in chart configs — replace with CSS variables.

## Phase 3: Remaining Cleanup

- Remove unused `ScrollArea` import from events-feed.tsx
- Replace remaining raw `<button>` elements (event-filter-panel.tsx, event-list.tsx) with shadcn Button
- Replace hand-rolled error div in contracts.tsx with shadcn Alert
- Replace hand-rolled spinner in App.tsx with Loader2
- Standardize SSE usage (all pages use `useDashboardSSE` hook or all use direct)

## Verification

After all changes:
1. `pnpm tsc --noEmit` — must pass
2. Open every page in dark mode — verify colors
3. Switch to light mode — verify ALL text is readable
4. Run through `PROMPT-FRONTEND-AUDIT.md` checklist for Dashboard, Events, Approvals
5. Check that no file exceeds 200 lines

## Files That Should Shrink Below 200 Lines After Extraction

| File | Current | After |
|------|---------|-------|
| event-list.tsx | 630 | ~350 (after extracting histogram, time-window, helpers) |
| activity-column.tsx | 274 | ~150 (after extracting histogram, helpers) |
| event-detail.tsx | 384 | ~350 (verdict helpers extracted, marginal) |
| events-feed.tsx | 322 | ~310 (minimal extraction, may need further split) |
