# P3: shadcn Compliance & UI Consistency

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group C (items C1-C7)
> **Depends on:** P1 (contract colors must exist for C5)
> **Deliverable:** All shadcn violations fixed, focus rings on interactive elements, no raw ResponsiveContainer, no next-themes dependency
> **Files touched:** ~10 files

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — shadcn mandate table, color rules
2. `dashboard/src/components/sidebar.tsx` — raw `<button>` for brand toggle (line 86)
3. `dashboard/src/pages/events/event-list.tsx` — raw `<button>` for event rows (line 316)
4. `dashboard/src/pages/contracts/versions-tab.tsx` — raw `<button>` for version items
5. `dashboard/src/pages/contracts/deploy-dialog.tsx` — raw `<label>` (line 66)
6. `dashboard/src/pages/contracts/diff-tab.tsx` — raw `<label>` (lines 101, 122)
7. `dashboard/src/pages/settings/notifications/filter-fields.tsx` — raw `<label>` (line 65)
8. `dashboard/src/components/dashboard/triage-column.tsx` — double border-r (line 96)
9. `dashboard/src/pages/dashboard-home.tsx` — h-screen overflow (line 76), parent border-r (line 88)
10. `dashboard/src/components/dashboard/agent-grid.tsx` — raw `ResponsiveContainer` (line 44)
11. `dashboard/src/components/ui/sonner.tsx` — `next-themes` import
12. `dashboard/src/hooks/use-theme.ts` — custom theme hook (verify it exists and its API)

## Shared Modules Reference

| Import | From |
|--------|------|
| `Label` | `@/components/ui/label` |
| `ChartContainer` | `@/components/ui/chart` |
| `useTheme` | `@/hooks/use-theme` |

---

## Tasks

### C1: Fix focus rings on interactive elements

**`dashboard/src/components/sidebar.tsx` (line 86):**
Keep the raw `<button>` (it's a branded element with gradient). Add focus-visible ring:
```tsx
// Before
className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm"

// After
className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

**`dashboard/src/pages/events/event-list.tsx` (line 316):**
The event row `<button>` is semantically correct. Add focus-visible ring to the className:
```
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

**`dashboard/src/pages/contracts/versions-tab.tsx`:**
Same — find clickable list items and add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

### C2: Replace raw `<label>` with shadcn `Label`

**Files to update:**
- `dashboard/src/pages/contracts/deploy-dialog.tsx` (line 66)
- `dashboard/src/pages/contracts/diff-tab.tsx` (lines 101, 122)
- `dashboard/src/pages/settings/notifications/filter-fields.tsx` (line 65)

In each file:
1. Add import: `import { Label } from "@/components/ui/label"`
2. Replace `<label className="text-sm font-medium">...</label>` with `<Label>...</Label>`
3. If the label has custom styling, pass it via `className` on the `Label` component

### C3: Fix double borders

**Option: Remove from child components** (parent already provides the border)

In `dashboard/src/components/dashboard/triage-column.tsx` (line 96):
```tsx
// Before
<div className="border-r border-border flex flex-col h-full">

// After
<div className="flex flex-col h-full">
```

The parent in `dashboard-home.tsx` (line 88) already wraps it with `border-r border-border`.

In `dashboard/src/pages/events/event-filter-panel.tsx`:
Check if the parent (`events-feed.tsx`) already adds a `border-r`. If so, remove it from the filter panel.

### C4: Fix DashboardHome h-screen overflow

**File:** `dashboard/src/pages/dashboard-home.tsx` (line 76)

```tsx
// Before
<div className="flex flex-col p-4 h-screen overflow-auto">

// After
<div className="flex flex-col p-4 h-full overflow-auto">
```

The parent `<main className="flex-1 overflow-auto">` in `DashboardLayout` already constrains height. Using `h-screen` causes double scrollbars.

### C5: diff-summary color fix

This is automatically resolved by P1-A1 (contract colors extraction). After P1, `diff-summary.tsx` imports from `lib/contract-colors.ts` which uses the correct `text-*-600 dark:text-*-400` pattern.

**Verify after P1:** Check that `diff-summary.tsx` no longer has any local color definitions.

### C6: Replace raw `ResponsiveContainer` with shadcn `ChartContainer`

**File:** `dashboard/src/components/dashboard/agent-grid.tsx`

Replace the `MiniSparkline` component:

```tsx
// Before
import { Area, AreaChart, ResponsiveContainer } from "recharts"

function MiniSparkline({ data, status, agentName }: ...) {
  return (
    <ResponsiveContainer width="100%" height={28}>
      <AreaChart data={chartData}>...</AreaChart>
    </ResponsiveContainer>
  )
}

// After
import { Area, AreaChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

const sparklineConfig = {
  v: { label: "Events", color: "var(--color-emerald-500, #10b981)" },
} satisfies ChartConfig

function MiniSparkline({ data, status, agentName }: ...) {
  const color = status === "healthy" ? "var(--success)" : status === "degraded" ? "var(--warning)" : "var(--muted-foreground)"
  const chartData = data.map((v, i) => ({ i, v }))
  const gradientId = `spark-${agentName}-${status}`
  return (
    <ChartContainer config={sparklineConfig} className="h-7 w-full [&>div]:!aspect-auto">
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
```

Key: `[&>div]:!aspect-auto` overrides ChartContainer's default aspect-video for the 28px sparklines. Test that sparklines render correctly in agent cards.

### C7: Fix `next-themes` vs custom `useTheme` conflict

**File:** `dashboard/src/components/ui/sonner.tsx`

1. Read `dashboard/src/hooks/use-theme.ts` to understand its API
2. Replace the import:
   ```tsx
   // Before
   import { useTheme } from "next-themes"

   // After
   import { useTheme } from "@/hooks/use-theme"
   ```
3. Map the custom hook's output to what Sonner expects. If the custom hook returns `{ theme: "dark" | "light", toggleTheme }`, then:
   ```tsx
   const { theme } = useTheme()
   ```
   Should work directly since Sonner expects `theme` as a string.

4. Remove the `next-themes` dependency:
   ```bash
   cd dashboard && pnpm remove next-themes
   ```

---

## Verification Checklist

- [ ] Tab through the sidebar — brand toggle button has a visible focus ring
- [ ] Tab through event list rows — each row has a visible focus ring
- [ ] `grep -r "<label" dashboard/src/pages/contracts/ dashboard/src/pages/settings/` → zero hits for raw labels (only `Label` from shadcn)
- [ ] No double borders visible on Dashboard Home (triage column doesn't have double right border)
- [ ] Dashboard Home doesn't have double scrollbars (h-screen replaced with h-full)
- [ ] Agent grid sparklines render correctly in cards (no collapsed height)
- [ ] `grep -r "ResponsiveContainer" dashboard/src/` → only in `components/ui/chart.tsx` (shadcn's internal use)
- [ ] `grep -r "next-themes" dashboard/src/` → zero hits
- [ ] `grep "next-themes" dashboard/package.json` → zero hits
- [ ] Toast notifications work in both dark and light mode
- [ ] `pnpm --dir dashboard build` completes without errors
