# Multi-Tenant UX — Implementation Prompts

## Execution Order

```
P1  Data Model + Migration
 |
 +---> P2  Auth Layer + Role Gates ----+
 |                                     |
 +---> P3  Tenant Endpoints + getMe ---+---> P4  Team Management Endpoints ---+
                                       |          |                           |
                                       |          +---> P5  Invitation Endpoints ---+
                                       |                     |                      |
                                       +---------------------+---> P6  Adversarial Tests (S9-S13)
                                       |                                       |
                                       +---> P7  Frontend Foundation -----+    |
                                                  |                       |    |
                                                  +---> P8  Routes -------+    |
                                                            |             |    |
                                                            +---> P9  Tenant Switcher
                                                            |             |
                                                  P4 -------+---> P10 Team Mgmt UI
                                                            |
                                                  P5 -------+---> P11 Invitation Page
                                                            |
                                                            +---> P12 Role-Gated UI
```

**Key:** Arrows show "depends on". P10 needs P4 (backend) + P7/P8 (frontend foundation). P11 needs P5 (backend) + P7 (types).

## Suggested Build Phases

### Phase A: Backend Foundation (P1 → P2 + P3 in parallel)
- **P1** must go first — everything depends on the data model
- **P2** and **P3** can run in parallel (both depend only on P1)
- After P2+P3: all existing endpoints are role-gated, tenant CRUD works, getMe returns tenant list

### Phase B: Backend Features (P4 + P5 in parallel → P6)
- **P4** (team management) and **P5** (invitations) can run in parallel
- **P6** (adversarial tests) runs after P4+P5 — tests everything built in P1-P5
- After P6: backend is complete and security-verified

### Phase C: Frontend Foundation (P7 → P8)
- **P7** must go before P8 (auth context needed for route guards)
- **P8** depends on P7 (TeamGuard consumes auth context)
- After P8: all pages served under `/dashboard/team/{slug}/`

### Phase D: Frontend Features (P9 + P10 + P11 + P12 in parallel)
- All four can run in parallel — each is independent after P7+P8
- **P9**: Tenant switcher in sidebar
- **P10**: Team management UI in settings
- **P11**: Invitation acceptance page
- **P12**: Role-gated UI across all existing views

## Prompt Summary

| # | File | Scope | Layer | Depends On |
|---|------|-------|-------|------------|
| P1 | `PROMPT-MULTI-TENANT-P1-DATA-MODEL.md` | tenant_memberships table, slug, migration, membership + role services | Backend | — |
| P2 | `PROMPT-MULTI-TENANT-P2-AUTH-ROLES.md` | require_role dependency, DashboardAuthContext, session schema, endpoint gating | Backend | P1 |
| P3 | `PROMPT-MULTI-TENANT-P3-TENANT-ENDPOINTS.md` | Tenant CRUD, slug resolution, updated getMe, login flow, bootstrap | Backend | P1, P2 |
| P4 | `PROMPT-MULTI-TENANT-P4-TEAM-MANAGEMENT.md` | Team management API: invite, list, remove, change role, transfer ownership | Backend | P1, P2 |
| P5 | `PROMPT-MULTI-TENANT-P5-INVITATIONS.md` | Invitation acceptance endpoints: token validation, password set, accept | Backend | P1, P4 |
| P6 | `PROMPT-MULTI-TENANT-P6-ADVERSARIAL-TESTS.md` | Adversarial tests S9-S13, update existing S3 tests, conftest updates | Backend | P1-P5 |
| P7 | `PROMPT-MULTI-TENANT-P7-FRONTEND-FOUNDATION.md` | AuthProvider context, usePermissions hook, API types, teams.ts client | Frontend | P3 |
| P8 | `PROMPT-MULTI-TENANT-P8-ROUTE-RESTRUCTURING.md` | TeamGuard, TeamRedirect, URL migration to /dashboard/team/{slug}/ | Frontend | P7 |
| P9 | `PROMPT-MULTI-TENANT-P9-TENANT-SWITCHER.md` | Tenant switcher dropdown in sidebar, create team dialog | Frontend | P7, P8 |
| P10 | `PROMPT-MULTI-TENANT-P10-TEAM-MANAGEMENT-UI.md` | Team management tab in Settings (7 sub-components) | Frontend | P4, P7, P8 |
| P11 | `PROMPT-MULTI-TENANT-P11-INVITATION-PAGE.md` | Invitation acceptance page with all states | Frontend | P5, P7 |
| P12 | `PROMPT-MULTI-TENANT-P12-ROLE-GATED-UI.md` | Role-based hide/show across all existing views | Frontend | P7 |

## Parallelization Opportunities

With a team of agents:
- **2 agents backend**: P2 + P3 in parallel after P1, then P4 + P5 in parallel
- **4 agents frontend**: P9 + P10 + P11 + P12 in parallel after P7 + P8
- **Max parallelism**: 4 agents in Phase D

## Spec Reference

All prompts reference `SPEC-MULTI-TENANT-UX.md` — the audited spec with all decisions resolved.
