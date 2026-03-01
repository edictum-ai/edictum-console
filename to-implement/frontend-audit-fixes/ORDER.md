# Frontend Audit Fixes — Execution Order

> Prompts derived from `SPEC-FRONTEND-AUDIT-FIXES.md` after audit + decision session.
> Execute in order. Each prompt is one testable deliverable.

| # | File | Scope | Deliverable | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | `P1-CODE-QUALITY.md` | Group A: shared modules, dedup, type safety, cleanup | All shared code extracted, no duplicates, `requestVoid` added, re-exports fixed | None |
| 2 | `P2-ERROR-HANDLING.md` | Group B: error handling, loading skeletons, stats fix | Every page has error banners, skeleton loading, stats bar shows "—" on zero | P1 (shared modules must exist) |
| 3 | `P3-SHADCN-COMPLIANCE.md` | Group C: shadcn fixes, focus rings, ChartContainer, next-themes removal | All shadcn violations fixed, no raw ResponsiveContainer, no next-themes dep | P1 (contract colors must exist) |
| 4 | `P4-EMPTY-STATES.md` | Group D: reusable EmptyState component, educational copy, getting started card | Every empty state teaches the user, dashboard shows getting started when empty | P2 (error/loading states done first) |
| 5 | `P5-CONTRACTS.md` | Group E: tab disabling, upload sheet improvements, parallel evaluation | Contract tabs disabled when empty, upload sheet improved, eval 5x faster | P1 (shared modules), P4 (empty states) |
| 6 | `P6-POLISH.md` | Group F: aria-labels, clipboard, SSE jitter, formatRelativeTime, magic numbers, threshold fix, revoke fix | All minor polish items done | P1-P5 (cleanup pass, run last) |

## Notes

- Each prompt is self-contained with required reading, files to modify, and verification steps.
- P1 is the foundation — it must run first because later prompts depend on the shared modules it creates.
- P6 is a cleanup pass — it can run after any prompt but is best saved for last.
- All prompts reference `SPEC-FRONTEND-AUDIT-FIXES.md` for detailed specs.
