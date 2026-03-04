# Frontend Quality Audit Prompt

> Use this prompt to verify frontend quality before marking any view as "done."
> This is not a type-check. This is a product quality gate.

## Context

Read these files first:
- `CLAUDE.md` — project rules, shadcn mandate, coding standards
- `DASHBOARD.md` — view specs, user stories, design decisions
- `CONTEXT.md` — what edictum is, terminology, workflows

## The Quality Bar

The polished views (Dashboard Home, Events Feed, Approvals Queue) set the standard. Every view must match this bar:

### 1. Data Quality
- [ ] Page fetches from real API endpoints (not hardcoded/mock data)
- [ ] SSE integration for real-time updates where applicable
- [ ] Loading, error, and empty states are all handled
- [ ] No UUIDs or raw IDs shown to users — resolve to human-readable names
- [ ] No placeholder text like "Coming soon" or "TODO" in production components

### 2. Visual Consistency
- [ ] Uses shadcn components for ALL UI primitives (see CLAUDE.md table)
- [ ] All colored text uses dual light/dark pattern: `text-*-600 dark:text-*-400`
- [ ] No hardcoded hex colors — use CSS variables or Tailwind tokens
- [ ] Badge opacity is consistent: `bg-*/15`, `border-*/30` (not `/10`, `/20`)
- [ ] Verdict colors match everywhere: emerald=allowed, red=denied, amber=pending
- [ ] ENV_COLORS match everywhere: red=production, amber=staging, emerald=development
- [ ] Font sizes are consistent with other views (check `text-xs`, `text-[11px]`, `text-[10px]` usage)
- [ ] Page padding matches other views (`p-6` for full pages, edge-to-edge for panel layouts)
- [ ] Verify in BOTH dark mode AND light mode

### 3. Interactivity
- [ ] Clickable elements have hover states
- [ ] Selected/active states are visually clear
- [ ] Deep linking works (URL params → auto-select + scroll into view)
- [ ] Search/filter where the view has > 10 items
- [ ] Keyboard accessible (interactive elements focusable, no click-only divs)
- [ ] No misleading features (if it looks interactive, it must work)

### 4. Code Quality
- [ ] File is under 200 lines (split if over)
- [ ] No duplicated utility functions (use shared modules in `lib/`)
- [ ] No raw `<button>`, `<input>`, `<label>`, `<select>` — use shadcn
- [ ] Spinners use `Loader2`, not border-hack divs
- [ ] Alerts use shadcn `Alert`, not hand-rolled divs
- [ ] Charts wrapped in shadcn `ChartContainer` + `ChartTooltipContent`
- [ ] TypeScript strict, no `any`
- [ ] No unused imports

### 5. Design Integrity
- [ ] View was designed from user stories (documented in DASHBOARD.md)
- [ ] Mockups were reviewed before implementation
- [ ] The view tells a clear story — user knows what to DO here
- [ ] Empty state guides the user (not just "No data")
- [ ] Error state is actionable (not just "Something went wrong")

## How to Use This

### For agents building a new view:
Run through this checklist BEFORE saying "done." If any item fails, fix it or flag it explicitly.

### For audit sessions:
Open each view in the browser (both dark and light mode). For each view:
1. Does it look like it belongs in the same app as Dashboard/Events/Approvals?
2. Click everything. Does it work?
3. Resize the window. Does it break?
4. Switch theme. Is anything unreadable?
5. Check the code against the checklist above.

### The test that matters:
**Would you show this to an investor in a demo?** If the answer is anything other than "yes, confidently" — it's not done.
