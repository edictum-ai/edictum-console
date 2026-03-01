---
name: spec-to-impl
description: Transform a feature spec into audited, implementation-ready prompts. Use when starting a new feature, designing a multi-tab view, or turning a design doc into sequenced build steps. Covers spec audit against project rules, gap identification, decision collection, and prompt generation.
argument-hint: [spec-file-path]
---

# Spec-to-Implementation Pipeline

Transform a feature specification into audited, implementation-ready sequenced prompts. This is a multi-phase process — do NOT skip phases or combine them.

**Input:** A spec file path (via `$ARGUMENTS`) or a feature description that needs a spec written first.

---

## Phase 1: Gather Context

Before auditing anything, read the project rules. These are the audit criteria:

1. `CLAUDE.md` — Architecture, non-negotiable principles, tech stack, coding standards, shadcn mandate
2. `CONVENTIONS.md` — Terminology (binding), code conventions
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate checklist (the acceptance test for any view)
4. `.docs-style-guide.md` — Terminology reference

Then read the actual codebase to understand current state:

5. **Shared modules** — Read every file in `dashboard/src/lib/` to know what already exists. Any utility the spec might redefine is a duplication violation.
6. **Existing page patterns** — Read at least one polished page (Events or Approvals) to understand the shell pattern, SSE integration, URL state, loading/error/empty states.
7. **API client structure** — Read `dashboard/src/lib/api/` to understand how endpoints are organized (split files, re-exports via index.ts).
8. **Backend route patterns** — Read one existing route file + the push manager to understand auth dependencies, service layer, push events.
9. **Test patterns** — Read `tests/conftest.py` and one test file to understand fixtures and conventions.

**Output of Phase 1:** Internal understanding. No user-facing output yet.

---

## Phase 2: Audit the Spec

Read the spec file. Audit every section against every rule. Be brutally honest.

Check for these categories of violations:

### Architecture Violations (CRITICAL)
- Does anything contradict CLAUDE.md's non-negotiable principles?
- Does it introduce server-side behavior that should be client-side (or vice versa)?
- Does it break tenant isolation?
- Does it bypass security boundaries?

### Shared Module Duplication (HIGH)
- Does the spec define types that already exist in the codebase?
- Does it propose utility functions that `lib/format.ts`, `lib/verdict-helpers.tsx`, `lib/env-colors.tsx`, or `lib/payload-helpers.ts` already provide?
- Does it put API functions in the wrong file or create a monolith?

### Light/Dark Color Rule (HIGH)
- Does every colored element specify the `text-*-600 dark:text-*-400` dual pattern?
- Does it use bare `text-*-400` anywhere without the light-mode pair?
- Does it specify badge opacity as `bg-*/15`, `border-*/30`?

### 200-Line File Limit (MEDIUM)
- Will any proposed file exceed 200 lines based on its responsibilities?
- Are complex components pre-split into sub-components?

### Audit Checklist Gaps (MEDIUM)
- Loading states for every async operation?
- Error states with retry for every API call?
- Empty states with user guidance for every list/table?
- Search/filter for views with >10 items?
- Keyboard accessibility?
- URL state sync for deep linking?

### Terminology (MEDIUM)
- Any forbidden terms? (guard, dry run, rule, policy, blocked, rejected — see CONVENTIONS.md)
- Any marketing language? (powerful, seamless, robust, elegant)

### Codebase Inconsistencies (MEDIUM)
- Does it reference the correct file paths? (e.g., `lib/api.ts` vs `lib/api/bundles.ts`)
- Does it assume dependencies are missing when they're already installed?
- Does it conflict with existing patterns?

### Design Gaps (LOW)
- Responsive behavior specified?
- Dependency decisions made (not "consider X or Y")?
- Test data / realistic examples included?

**Output of Phase 2:** Present findings to the user as a prioritized table:

```
| Priority | # | Issue | Action needed |
|----------|---|-------|---------------|
| CRITICAL | 1 | ... | Decision: A, B, or C |
| HIGH | 2 | ... | Fix: specify X |
| ...
```

Group by priority. For each finding, state:
- What the rule says (with file + line reference)
- What the spec says (with section reference)
- What needs to happen (decision from user, or a specific fix)

---

## Phase 3: Collect Decisions

Wait for the user to respond to every finding. They will say things like:
- "your suggestion" — apply your recommended fix
- "fix it" — apply the obvious fix
- "option A" — apply that specific option
- "I don't understand" — explain the issue more clearly
- A custom answer

Do NOT proceed to Phase 4 until every finding has a decision.

---

## Phase 4: Update the Spec

Apply all decisions to the spec file. This means editing the actual file, not just listing changes. After editing:

- Re-read the updated spec
- Verify no new issues were introduced by the fixes
- If new issues exist, flag them (short cycle — these should be minor)

**Output of Phase 4:** Confirm the spec is updated. List any remaining minor items.

---

## Phase 5: Generate Implementation Prompts

Slice the spec into sequenced prompts. Each prompt must be:

### Sizing Rules
- **One reviewable deliverable per prompt.** The user must be able to test the output before moving on.
- **Backend before frontend.** Endpoints must exist before UI that calls them.
- **Foundation before features.** Types, parsers, API client, page shell before tabs/panels.
- **Simple before complex.** The most well-defined tab first. The most complex tab last.
- **Dependencies explicit.** Each prompt states what it depends on.

### Prompt Structure (every prompt must include)

1. **Header:** Scope, depends-on, deliverable, time budget
2. **Required reading:** Specific files to read before coding
3. **Shared modules table:** What to import, from where — prevents duplication
4. **Files to create/modify:** Each file with its responsibilities, props, components, and file size target
5. **Wiring instructions:** How to connect new code to existing code (imports, routes, page shell updates)
6. **Verification checklist:** Specific things to test in the browser and terminal, covering:
   - Functional correctness (does it work?)
   - Both themes (dark AND light mode)
   - Audit checklist items relevant to this prompt
   - File size limits
   - No raw HTML elements
   - No duplicated utilities

### What NOT to include in prompts
- Don't repeat the entire spec — reference sections by number
- Don't include code that should be figured out during implementation
- Don't include aspirational features — only what's in scope for this prompt

### Prompt Naming
Write each prompt as `PROMPT-{FEATURE}-P{N}-{SCOPE}.md` in the repo root.

**Output of Phase 5:** All prompt files written. Present a summary table:

```
| # | File | Scope | Deliverable | Test |
|---|------|-------|-------------|------|
| P1 | PROMPT-...-P1-... | ... | ... | ... |
| P2 | ... | ... | ... | ... |
```

---

## Phase 6: Final Review

Read all generated prompts in sequence. Verify:
- No gaps between prompts (nothing falls through the cracks)
- Dependencies are correct (no prompt references something built in a later prompt)
- Verification checklists are testable (not vague — specific curl commands, specific UI actions)
- The full feature is covered (every section of the spec maps to at least one prompt)

If issues found, fix them and note what changed.

---

## Key Principles

- **Rules exist in files, not in heads.** Every audit finding must point to a specific rule in a specific file.
- **The codebase is ground truth.** Read actual shared modules, actual API structure, actual page patterns — not what the spec assumes.
- **The user stays in decision mode.** Present findings and options. Don't make architectural decisions without user input.
- **Each prompt = one testable deliverable.** No "build everything then check."
- **Polish is inline.** Quality gates in every prompt, not a cleanup pass at the end.
