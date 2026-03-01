# Discord Interactive Approvals — Implementation Order

## Prompts

| Order | File | Scope | Deliverable | Verify |
|-------|------|-------|-------------|--------|
| **1** | `PROMPT-DISCORD-P1-BACKEND.md` | `DiscordChannel` class, `/interactions` route, loader/service/schema wiring | Discord channel type works end-to-end via API | `ruff check`, imports clean, files <200 lines |
| **2** | `PROMPT-DISCORD-P2-TESTS.md` | Unit tests, integration tests, adversarial security tests | 3 test files, all green, `@pytest.mark.security` on adversarial | `pytest -v`, no regressions |
| **3** | `PROMPT-DISCORD-P3-FRONTEND.md` | Dashboard UI: config fields, type dropdown, validation, table icon | Admin can create/edit/test/delete Discord channels in Settings | Browser check: both themes, all fields, validation |

## Dependency Graph

```
P1 (Backend) ──→ P2 (Tests)
     │
     └──────────→ P3 (Frontend)
```

P2 and P3 are independent of each other — they can run in parallel after P1 is complete.

## Full Spec

The audited spec is at `PROMPT-DISCORD-INTERACTIVE.md` in the repo root.
