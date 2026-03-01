---
name: ux-fix
description: Fix UI/UX issues from a screenshot. Paste a screenshot of the problem area, get a fix that follows all project design rules, color tokens, shadcn mandate, and dual-theme requirements.
argument-hint: [optional description of what to fix]
---

# UX Fix — Screenshot-Driven UI Repair

Fix UI/UX issues identified from a screenshot. The user pastes a screenshot of the problem area and optionally describes what's wrong. You diagnose, locate the source, and fix it — following every project rule.

**Input:** A screenshot (pasted by user) + optional description via `$ARGUMENTS`.

---

## Phase 1: Load Design Context (EVERY session)

Read these files to internalize the rules. Do NOT skip this — you need these to judge correctness:

1. `CLAUDE.md` — Non-negotiable principles, shadcn mandate, coding standards, color rules
2. `DASHBOARD.md` (first 100 lines) — Brand system, color tokens, semantic colors
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate checklist
4. `dashboard/src/index.css` — Actual CSS variables (light + dark)

Then load the shared modules index so you know what exists:

5. `dashboard/src/lib/format.ts` — formatRelativeTime, formatArgs, truncate, etc.
6. `dashboard/src/lib/verdict-helpers.tsx` — verdictColor, VerdictIcon, VERDICT_STYLES
7. `dashboard/src/lib/env-colors.tsx` — ENV_COLORS, EnvBadge

**Do NOT output anything yet.** Internalize silently.

### Active Design Direction: Navy + White + Amber

The sidebar was redesigned. Now the rest of the site must match. Brand palette confirmed from logo: **navy + white + amber**. All fixes must align with this direction.

#### Dark Palette (updated values — use these, not the old ones)
| Token | Old | New | Why |
|-------|-----|-----|-----|
| `--background` | `#0f172a` | `#0c1222` | Deeper navy, matches logo |
| `--card` | `#1e293b` | `#151d2e` | Subtler contrast, less washed-out slate |
| `--border` | `#293548` | `#1e2a3a` | Softer, less prominent |

Light mode stays as-is (`#f8fafc` / `#ffffff`).

#### Depth & Layering
- **Main content area:** Subtle radial gradient — faint amber glow top-left (`amber-500/[0.02]` dark, `amber-500/[0.03]` light). Adds warmth.
- **Cards:** Soft box-shadow (`0 1px 3px rgba(0,0,0,0.3)` dark, `0 1px 2px rgba(0,0,0,0.04)` light).
- **Stats bar:** Wrapped in `bg-card/30` + bottom border — visual "header zone."

#### Color Consistency Rules (active fixes)
All icon/semantic colors must use the `600/400` dual-mode pattern:
- `text-amber-500` → `text-amber-600 dark:text-amber-400`
- `text-emerald-500` → `text-emerald-600 dark:text-emerald-400`
- Same for blue, red, violet, zinc
- `text-zinc-500` alone → `text-zinc-600 dark:text-zinc-400`
- `dark:bg-zinc-950/80` → `dark:bg-background/80` (use CSS variables, not hardcoded zinc)
- Page header icons: `text-muted-foreground` → `text-amber-600 dark:text-amber-400` (match sidebar accent)

#### What NOT to do
- Don't fix colors to the OLD values (`#0f172a`, `#1e293b`, `#293548`) — those are being replaced
- Don't use bare `text-*-400` or `text-*-500` without the dual-mode pair
- Don't add depth/shadows in ways that conflict with the plan (card shadow is CSS-level, not per-component)

---

## Phase 2: Analyze the Screenshot

Look at the screenshot and identify:

1. **What page/component is this?** Match it to a file in `dashboard/src/pages/` or `dashboard/src/components/`.
2. **What's wrong?** Categorize the issues:
   - **Color/theme:** Wrong colors, invisible text in light/dark, missing dual pattern
   - **Spacing:** Misaligned elements, inconsistent padding, cramped or too loose
   - **Component misuse:** Raw HTML where shadcn should be used, wrong variant
   - **Layout:** Overflow, clipping, misaligned columns, broken responsive
   - **Typography:** Wrong font size, weight, or color token
   - **Interaction:** Missing hover state, broken focus ring, dead UI
   - **Data display:** Truncation issues, raw IDs shown, missing empty/loading states

If the user provided `$ARGUMENTS`, use that as additional context for what to fix.

If the issue is ambiguous, ask ONE clarifying question before proceeding.

---

## Phase 3: Locate the Source

Find the exact file(s) responsible:

1. Use Glob/Grep to find the component shown in the screenshot
2. Read the file(s) — understand current implementation
3. Identify the specific lines causing the issue

**Present a brief diagnosis to the user:**

```
Issue: [what's wrong]
File: [path:line]
Cause: [why it looks wrong]
Fix: [what you'll change]
```

Wait for user confirmation before editing, UNLESS the fix is unambiguous (e.g., missing `dark:` prefix, wrong color token, raw `<button>` instead of `<Button>`).

---

## Phase 4: Fix It

Apply the fix following these mandatory rules:

### Color Rules (from CLAUDE.md + DASHBOARD.md)
- ALL semantic text: `text-*-600 dark:text-*-400` — NEVER bare `text-*-400`
- Badge backgrounds: `bg-*/15` with `border-*/30`
- Verdict colors: emerald=allowed, red=denied, amber=pending
- Environment colors: red=production, amber=staging, emerald=development
- Use CSS variables from `index.css` where applicable (`--primary`, `--background`, etc.)

### Component Rules (from CLAUDE.md shadcn mandate)
- No raw `<button>`, `<input>`, `<label>`, `<select>`, `<table>`, `<hr>`
- Spinners: `Loader2` from lucide-react with `animate-spin`
- Alerts: shadcn `<Alert>`, not hand-rolled divs
- Install missing shadcn components if needed: `pnpm dlx shadcn@latest add <component>`

### Code Rules
- Files under 200 lines — split if the fix pushes it over
- No duplicated utilities — use shared modules from `lib/`
- TypeScript strict, no `any`
- No unused imports after the fix

### Design Tokens (from DASHBOARD.md + active plan)
- Font: Geist (sans), Geist Mono (mono)
- Border radius: `0.5rem` cards, `rounded-full` badges
- Dark background: `#0c1222` (deep navy), card: `#151d2e`, border: `#1e2a3a`
- Light background: slate-50 (`#f8fafc`), surface: white
- Accent: amber-500 (`#f59e0b`) — unchanged across themes
- Sidebar: `#111318` (darkest, more neutral navy) — intentional contrast with content area

---

## Phase 5: Verify

After applying the fix:

1. **Check the opposite theme.** If you fixed a dark mode issue, verify light mode didn't break (and vice versa). Trace every color class you touched.
2. **Check neighboring elements.** Did the fix cause spacing/alignment issues with siblings?
3. **Check shared usage.** Is the component/class used elsewhere? Grep for it. If so, verify the fix doesn't break other pages.
4. **Run a quick audit** against these PROMPT-FRONTEND-AUDIT.md items:
   - [ ] Dual light/dark color pattern on all colored text
   - [ ] shadcn components used (no raw HTML primitives)
   - [ ] No hardcoded hex colors
   - [ ] File under 200 lines
   - [ ] No duplicated utilities

Report the fix summary:

```
Fixed: [what changed]
Files: [list of modified files]
Themes: [verified dark + light]
Side effects: [none / list if any]
```

---

## Key Principles

- **Screenshot is truth.** What the user sees is the bug. Don't argue that the code "should" work.
- **Fix the root cause.** Don't patch symptoms. If a color is wrong because of a missing `dark:` variant, fix the pattern — don't add an override.
- **Minimal changes.** Fix what's broken. Don't refactor surrounding code, add comments, or "improve" things that weren't asked about.
- **Both themes always.** Every color change must work in both dark and light mode. No exceptions.
- **Check before you write.** Read the file before editing. Understand the component before changing it.
