# SPEC: Events View Redesign (Variation B+A Hybrid)

> Railway-inspired dense log table with view options. Left filter panel + inline row expansion.
> No right detail panel — detail expands below the clicked row (accordion-style).
> Reference: Railway's log viewer UI. Decision date: 2026-03-09.

## Goal

Upgrade the Events Feed from card-style rows to a dense, configurable log table. Users should be able to see 2-3x more events, toggle which columns are visible, control the time range from one place, and see payload data inline without clicking.

## Current State

```
┌─────────────┬──────────────────────────┬────────────────┐
│  Filters    │  Search bar              │  Detail Panel  │
│  (220px)    │  Histogram               │  (380px)       │
│             │  Flex rows (card-style)  │                │
└─────────────┴──────────────────────────┴────────────────┘
```

- Flex rows with fixed widths, ~15 visible rows
- Time range only affects histogram, not event fetch (BUG: it does affect fetch via `sinceIso`)
- No column customization
- Args truncated to 60 chars, no inline payload view
- No export, no live/pause toggle

## Target State

Two-panel layout: filter sidebar + dense table with inline row expansion.
No right detail panel — clicking a row expands detail below it (accordion, one at a time).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [/ Cmd+K]  [15m][1h][6h][24h][7d][Custom]    ◉ Live  142 events  [↓]  ⚙  │
├─────────┬────────────────────────────────────────────────────────────────────┤
│ FILTERS │  [histogram — collapsible]                                        │
│         │  Time  │ Agent      │ Tool │ Verdict  │ Data                    ↕ │
│         │  ──────┼───────────┼──────┼──────────┼────────────────────────── │
│         │  14:23 │edictum-agt│Bash  │● allowed │cmd="git status"          │
│         │  14:22 │edictum-agt│Edit  │● allowed │path="/src/main.py"       │
│         │▸14:22 │nanobot-wfe│Bash  │● denied  │cmd="rm -rf /"            │
│         │  ┌──────────────────────────────────────────────────────────────┐ │
│         │  │ ● DENIED  enforce  production      14:22:45  Mar 9, 2026   │ │
│         │  │                                                            │ │
│         │  │ Decision Context            Tool Arguments                 │ │
│         │  │ ─────────────────           ──────────────                 │ │
│         │  │ Contract: destructive_cmd   { "command": "rm -rf /",      │ │
│         │  │ Source:   static_rule         "description": "clean up" }  │ │
│         │  │ Reason:   Blocks rm -rf                                    │ │
│         │  │                                                            │ │
│         │  │ Contracts Evaluated (2)                                     │ │
│         │  │ ✓ path_allowlist       passed                              │ │
│         │  │ ✗ destructive_cmd_blk  FAILED "rm with -rf is prohibited"  │ │
│         │  │                                                            │ │
│         │  │ Event: evt_a1b2  Call: call_x7y8  Trace: trc_m4n5  2ms    │ │
│         │  │ [Create Contract]  [Copy Event ID]  [View Raw JSON]        │ │
│         │  └──────────────────────────────────────────────────────────────┘ │
│         │  14:22 │edictum-agt│Read  │● allowed │path="/etc/passwd"        │
│         │  14:22 │nanobot-wfe│WebSr │○ w_deny  │query="hack wifi"         │
│         │  14:22 │edictum-agt│Bash  │● allowed │cmd="pnpm test" dur=23ms  │
│         │  ... full-width table, 25+ rows visible in dense mode ...        │
└─────────┴────────────────────────────────────────────────────────────────────┘
```

## New/Modified Files

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `events/events-toolbar.tsx` | Top bar: search, time pills, live/pause, export, count, gear | ~150 |
| `events/view-options-popover.tsx` | Gear popover: column toggles, panels, density | ~120 |
| `events/event-row-detail.tsx` | Inline expansion panel below selected row | ~150 |
| `lib/hooks/use-view-options.ts` | View options state + localStorage persistence | ~80 |

### Modified Files

| File | Changes |
|------|---------|
| `events-feed.tsx` | Two-panel layout (no right detail), `useViewOptions`, inline expand state |
| `events/event-list.tsx` | Replace flex rows with `<Table>`, inline expand, column visibility, density |
| `events/event-histogram.tsx` | Remove time range selector (moved to toolbar), add collapse support |
| `lib/histogram.ts` | Add 15m, 30m, 3h presets |

### Repurposed Files

| File | Change |
|------|--------|
| `events/event-detail.tsx` | **Deleted** — replaced by `event-row-detail.tsx` (inline expansion) |

### Unchanged Files

| File | Why |
|------|-----|
| `events/event-filter-panel.tsx` | Stays as-is (already good) |
| `events/detail-decision-context.tsx` | Reused inside `event-row-detail.tsx` |
| `events/detail-tool-args.tsx` | Reused inside `event-row-detail.tsx` |
| `events/detail-contracts-evaluated.tsx` | Reused inside `event-row-detail.tsx` |
| `lib/payload-helpers.ts` | Stays as-is |
| `lib/api/events.ts` | Stays as-is |

## Component Specifications

### 1. `useViewOptions` Hook

```typescript
interface ViewOptions {
  // Column visibility
  columns: {
    time: boolean       // default: true
    agent: boolean      // default: true
    tool: boolean       // default: true
    verdict: boolean    // default: true
    data: boolean       // default: true
    mode: boolean       // default: false
    contract: boolean   // default: false
    duration: boolean   // default: false
    environment: boolean // default: false
    traceId: boolean    // default: false
  }
  // Panel visibility
  panels: {
    filters: boolean    // default: true
    histogram: boolean  // default: true
  }
  // Display
  density: "compact" | "dense" | "comfortable"  // default: "dense"
  wrapData: boolean   // default: false
}

function useViewOptions(): {
  options: ViewOptions
  setColumn: (key: string, visible: boolean) => void
  setPanel: (key: string, visible: boolean) => void
  setDensity: (d: Density) => void
  toggleWrapData: () => void
  resetDefaults: () => void
}
```

Persisted to `localStorage` key `edictum:events:viewOptions`.

### 2. `EventsToolbar` Component

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search events...              Cmd+K]  [15m][1h][6h][24h][7d][Cust] │
│                                            ◉ Live  142 events  [↓] [⚙] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface EventsToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  timeWindow: TimeWindow
  onTimeWindowChange: (tw: TimeWindow) => void
  eventCount: number
  newEventCount: number
  onShowNewEvents: () => void
  isLive: boolean
  onToggleLive: () => void
  viewOptions: ViewOptions
  onViewOptionsChange: ViewOptions setter functions
  events: EventResponse[]  // for export
}
```

**Sub-elements:**
- **Search input**: Full-width InputGroup with Search icon, "Cmd+K" badge on right. Global keyboard listener for Cmd+K → focus.
- **Time range pills**: Button group. Active pill has `variant="default"`, inactive `variant="ghost"`. Presets: 15m, 1h, 6h, 24h, 7d. "Custom" opens popover with from/until date pickers.
- **Live toggle**: Green dot + "Live" when active. Click → pause SSE (gray dot, "Paused"). Click again → resume + fetch fresh.
- **Event count**: `{count} events` text.
- **New events banner**: When `newEventCount > 0`, show inline badge "↑ {N} new" that's clickable.
- **Export button**: Download icon → Popover menu with: Download as JSON / CSV / Plain text. Uses current filtered events.
- **Gear icon**: Opens ViewOptionsPopover.

**Layout**: Two rows on narrower screens, single row on wide. Use flex-wrap.

### 3. `ViewOptionsPopover` Component

Triggered by gear icon in toolbar. Uses shadcn `Popover` + `PopoverTrigger` + `PopoverContent`.

```
┌───────────────────────────┐
│ View Options              │
├───────────────────────────┤
│ COLUMNS                   │
│ ☑ Time                    │
│ ☑ Agent                   │
│ ☑ Tool                    │
│ ☑ Verdict                 │
│ ☑ Data (payload)          │
│ ☐ Mode                    │
│ ☐ Contract                │
│ ☐ Duration                │
│ ☐ Environment             │
│ ☐ Trace ID               │
├───────────────────────────┤
│ PANELS                    │
│ ☑ Show filters            │
│ ☑ Show histogram          │
├───────────────────────────┤
│ DISPLAY                   │
│ Density: [Compact|Dense|…]│
│ ☐ Wrap data column        │
├───────────────────────────┤
│ [Reset to defaults]       │
└───────────────────────────┘
```

- Changes apply instantly (no save button)
- Use shadcn Checkbox for toggles
- Use shadcn Tabs or ToggleGroup for density selector
- "Reset to defaults" ghost button at bottom

### 4. Dense Table (event-list.tsx rewrite)

Replace the current flex-based rows with shadcn `<Table>`.

**Column definitions:**

| Key | Header | Width | Content |
|-----|--------|-------|---------|
| time | Time | 70px | `formatTime(timestamp)` mono |
| agent | Agent | 120px | agent_id, truncated, link to agent detail |
| tool | Tool | 80px | Badge with tool_name |
| verdict | Verdict | 90px | Colored dot + label (allowed/denied/would_deny) |
| data | Data | flex-1 | Payload preview — `extractArgsPreview()` or full JSON, respects `wrapData` |
| mode | Mode | 70px | "enforce" / "observe" text |
| contract | Contract | 120px | contract name from provenance |
| duration | Duration | 60px | `{N}ms` right-aligned |
| environment | Env | 80px | env badge |
| traceId | Trace | 100px | truncated trace ID, mono |

**Row density:**

| Density | Row height | Font size | Padding |
|---------|-----------|-----------|---------|
| compact | 24px | 11px | py-0.5 px-2 |
| dense | 30px | 12px | py-1 px-2 |
| comfortable | 38px | 13px | py-2 px-3 |

**Selected row**: `bg-primary/10 ring-1 ring-primary/20` (keep current).
**Observe mode rows**: `opacity-75`.
**Highlighted row** (deep link): `animate-highlight-fade bg-primary/20 ring-2 ring-primary/40`.

**Data column behavior:**
- Default: single-line, truncated with ellipsis (`truncate` class)
- `wrapData=true`: multi-line, `whitespace-pre-wrap break-all`
- Content: `extractArgsPreview(event)` by default. Shows key=value pairs from tool_args.

**Column resize:**
- Column headers have a drag handle (4px border-right that changes cursor to `col-resize`)
- Dragging updates column width stored in component state
- Min-width per column to prevent collapse

**Sorting:**
- Click column header to sort asc/desc
- Sort indicator (arrow up/down) on active sort column
- Default sort: timestamp desc (most recent first)

### 5. Inline Row Expansion (`event-row-detail.tsx`)

When a row is clicked, an expansion panel slides open below it (150ms animation).
Only one row can be expanded at a time (accordion behavior — clicking another row
closes the current one and opens the new one).

**Layout (two-column inside the expansion):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● DENIED  enforce  production              14:22:45.123  Mar 9      │
│                                                                      │
│ ┌─ Decision Context ──────────────┐  ┌─ Tool Arguments ────────────┐ │
│ │ Contract: destructive_cmd_block │  │ {                           │ │
│ │ Source:   static_rule           │  │   "command": "rm -rf /",    │ │
│ │ Reason:   Blocks rm -rf and    │  │   "description": "clean up" │ │
│ │   other destructive commands   │  │ }                           │ │
│ │ Policy:   v3                    │  │                             │ │
│ └─────────────────────────────────┘  └─────────────────────────────┘ │
│                                                                      │
│ Contracts Evaluated (2)                                              │
│ ✓ path_allowlist        passed                                       │
│ ✗ destructive_cmd_block FAILED  "rm with -rf flag is prohibited"     │
│                                                                      │
│ Event: evt_a1b2c3d4  Call: call_x7y8z9  Trace: trc_m4n5o6  Dur: 2ms │
│                                                                      │
│ [Create Contract]  [Copy Event ID]  [View Raw JSON]                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface EventRowDetailProps {
  event: EventResponse
  colSpan: number  // spans full table width
}
```

**Reuses existing sub-components:**
- `DecisionContextCard` (from `detail-decision-context.tsx`)
- `ToolArgsCard` (from `detail-tool-args.tsx`)
- `ContractsEvaluatedCard` (from `detail-contracts-evaluated.tsx`)

But laid out horizontally (two-column grid) instead of vertically (current right panel).

**Observe mode alert:** If event is observe mode, show the warning banner at top of expansion.

**Action buttons:**
- "Create Contract" → navigates to contracts page with tool pre-filled
- "Copy Event ID" → copies to clipboard
- "View Raw JSON" → toggles raw JSON block below

**Animation:**
- Open: `animate-in slide-in-from-top-1` (150ms)
- The expansion is a `<TableRow>` with a single `<TableCell colSpan={visibleColumnCount}>` containing the detail card.

### 6. Histogram Changes

Remove the time range selector from EventHistogram — it moves to the toolbar.

**EventHistogram simplified props:**
```typescript
interface EventHistogramProps {
  histogramData: HistogramBucket[]
  onBarClick: (bucket: HistogramBucket) => void  // zoom to bucket
}
```

Time window management moves entirely to EventsToolbar.

### 6. New Histogram Presets

Add to `lib/histogram.ts`:

```typescript
const PRESETS = {
  "15m": { label: "Last 15m", windowMs: 15 * 60_000, bucketCount: 15, bucketMs: 60_000 },
  "30m": { label: "Last 30m", windowMs: 30 * 60_000, bucketCount: 15, bucketMs: 2 * 60_000 },
  "1h":  { label: "Last 1h",  windowMs: 60 * 60_000, bucketCount: 12, bucketMs: 5 * 60_000 },
  "3h":  { label: "Last 3h",  windowMs: 3 * 60 * 60_000, bucketCount: 12, bucketMs: 15 * 60_000 },
  "6h":  { label: "Last 6h",  windowMs: 6 * 60 * 60_000, bucketCount: 12, bucketMs: 30 * 60_000 },
  "12h": { label: "Last 12h", windowMs: 12 * 60 * 60_000, bucketCount: 12, bucketMs: 60 * 60_000 },
  "24h": { label: "Last 24h", windowMs: 24 * 60 * 60_000, bucketCount: 12, bucketMs: 2 * 60 * 60_000 },
  "7d":  { label: "Last 7d",  windowMs: 7 * 24 * 60 * 60_000, bucketCount: 14, bucketMs: 12 * 60 * 60_000 },
}
```

Toolbar shows: `15m | 1h | 6h | 24h | 7d | Custom`
(30m, 3h, 12h available in Custom popover's quick-range grid)

### 7. Export Function

```typescript
function exportEvents(events: EventResponse[], format: "json" | "csv" | "text") {
  // JSON: Pretty-printed array
  // CSV: Headers + rows with escaped values
  // Text: One line per event, formatted like log lines
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  // Trigger download via hidden <a> element
}
```

### 8. Keyboard Shortcuts

- `Cmd+K` or `/` → focus search bar
- `Escape` → blur search bar
- `↑/↓` in event list → navigate selected event (future, not in first pass)

## Layout Changes to events-feed.tsx

```tsx
// Before (three-panel):
<div className="flex h-full">
  <EventFilterPanel ... />     {/* 220px */}
  <EventList ... />            {/* flex-1 */}
  <EventDetail ... />          {/* 380px */}
</div>

// After (two-panel + toolbar + inline expand):
<div className="flex flex-col h-full">
  <EventsToolbar ... />
  <div className="flex flex-1 min-h-0">
    {options.panels.filters && <EventFilterPanel ... />}
    <EventList
      columns={options.columns}
      density={options.density}
      wrapData={options.wrapData}
      showHistogram={options.panels.histogram}
      expandedEventId={expandedEventId}
      onToggleExpand={(id) => setExpandedEventId(prev => prev === id ? null : id)}
    />
  </div>
</div>
```

Key changes:
- **No right detail panel** — removed entirely.
- Toolbar sits above the two-panel flex.
- EventList gets full remaining width (was sharing with 380px detail panel).
- `expandedEventId` state in events-feed.tsx, passed to EventList.
- EventList renders `EventRowDetail` inline below the expanded row.

## What This Does NOT Change

- Filter panel structure and facets (stays as-is)
- SSE wiring and event fetching logic (stays as-is)
- Deep link support (stays as-is, scroll-to in new table, auto-expand linked event)
- API contract (no backend changes)
- Detail sub-components (DecisionContextCard, ToolArgsCard, ContractsEvaluatedCard — reused in inline expand)

## What This Removes

- **Right detail panel** (`event-detail.tsx` as a side panel) — replaced by inline row expansion
- **Mobile Sheet for detail** — replaced by inline expansion (works on all sizes)
- The `selectedEventId` concept becomes `expandedEventId` (expand, not select)

## Quality Checklist

- [ ] Both dark and light mode tested
- [ ] All columns render correctly with real data
- [ ] View options persist across page navigation
- [ ] Time range change triggers fresh server fetch
- [ ] Export works with filtered events
- [ ] Cmd+K focuses search
- [ ] Dense mode shows 25+ rows in viewport
- [ ] Column resize works smoothly
- [ ] Histogram hides/shows via view option
- [ ] Filter panel hides/shows via view option
- [ ] Inline row expansion opens/closes on click (accordion — one at a time)
- [ ] "Show N New" banner works with SSE
- [ ] Deep links (?event=, ?ts=) still work
- [ ] Mobile layout doesn't break

## Build Order

### Parallel batch 1 (no dependencies between these):
1. `useViewOptions` hook — `lib/hooks/use-view-options.ts`
2. Update `histogram.ts` — add new presets (15m, 30m, 3h)

### Parallel batch 2 (depends on batch 1):
3. `ViewOptionsPopover` — `events/view-options-popover.tsx` (uses ViewOptions type)
4. `EventsToolbar` — `events/events-toolbar.tsx` (uses ViewOptions, TimeWindow)
5. `EventRowDetail` — `events/event-row-detail.tsx` (inline expansion panel)
6. Simplify `EventHistogram` — remove time range selector

### Sequential (depends on all above):
7. Rewrite `EventList` as dense table with inline expand
8. Wire everything in `events-feed.tsx` — two-panel layout, toolbar, expand state
9. Export function (can be added to toolbar)
10. Delete old `event-detail.tsx` (replaced by inline expand)
11. Test both themes, all view options, deep links, export
