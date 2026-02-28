# Prompt: Design Remaining Dashboard Views (6-8+)

> Self-contained prompt for continuing the Edictum Console dashboard design.
> Use this after Views 0-5 are implemented.

## Context

Edictum Console is a self-hostable agent operations console — runtime governance for AI agents.
Views 0-5 are implemented. Now we design and build the remaining views.

## Required Reading

1. `CLAUDE.md` — Project rules, architecture (the law)
2. `DASHBOARD.md` — All design decisions so far (Views 0-5 are complete, 6-8+ are stubs)
3. `SDK_COMPAT.md` — API contract
4. `src/edictum_server/routes/` — Backend endpoints
5. `src/edictum_server/schemas/` — Request/response shapes
6. `src/edictum_server/db/models.py` — Data models

## Design Methodology

Established in DASHBOARD.md. For EVERY view:

1. **Research** — Investigate how 5-7 best-in-class tools solve the same problem. Web search for their UIs.
2. **Extract patterns** — Document what works, what doesn't, comparison matrix.
3. **Draft the view** — Layout, components, data flow, backend endpoints needed, scale scenarios.
4. **5 mockup variations** — Generate as real React components (not ASCII). Show at 1-agent and 100-agent scale.
5. **User picks** — Wait for selection or mix.
6. **Build** — Implement the chosen layout with real API calls, SSE, mobile support.

## Core Design Principles (from Views 0-5)

These are established and non-negotiable:

- **Tool arguments are the most important data.** Never show just a tool name. Always show what the agent is trying to do.
- **Sidebar is the navigation spine.** Present on all views after login.
- **Real-time via SSE is table stakes.** Everything updates live.
- **Adaptive layouts.** Switch between card/table views based on data volume.
- **Countdown timers for time-sensitive items.** Color escalation (green → amber → red).
- **One-click approve, reason-required deny.** Minimize friction for common actions.
- **Faceted filters for scale.** Known dimensions with counts. No query language needed.
- **Three-level data display.** Preview → structured detail → raw JSON.
- **Mobile-first for approvals.** Swipe gestures, push notifications, card layouts.
- **Empty state = onboarding.** Never show a blank page.
- **Dark and light themes.** Venture palette: navy dark, slate-50 light, amber accent always.

## Views to Design

### View 6: Contracts (Bundles)

The governance rules view. Operators upload YAML contracts, version them, deploy to environments.

**Backend exists:**
- `POST /api/v1/bundles` — upload YAML
- `GET /api/v1/bundles` — list with deployed_envs
- `GET /api/v1/bundles/{version}` — get by version
- `GET /api/v1/bundles/{version}/yaml` — raw YAML content
- `POST /api/v1/bundles/{version}/deploy` — deploy to env
- `GET /api/v1/bundles/current?env=` — current deployed bundle

**Questions to answer through research:**
- How do config management tools show versioned config? (LaunchDarkly flags, Terraform state, ArgoCD manifests)
- How to show YAML content readably? (syntax highlighting, diff view between versions)
- How to show deployment status across environments? (version X in prod, version Y in staging)
- How to handle the deploy action? (one-click? confirmation? diff preview?)
- Contract diff viewer (compare versions side by side) — how do other tools do this?
- What about contract validation/linting feedback?

**Consider:**
- An operator managing 1 contract vs 20 contracts
- Showing which agents are running which contract version
- Rollback UX (deploy an older version)
- YAML editor vs file upload vs paste

### View 7: API Keys

API key management. Operators create keys for agents, manage environments, revoke.

**Backend exists:**
- `POST /api/v1/keys` — create (returns full key ONCE)
- `GET /api/v1/keys` — list non-revoked
- `DELETE /api/v1/keys/{id}` — revoke (soft delete)

**Questions to answer through research:**
- How do API key management UIs work? (Stripe, Twilio, OpenAI, GitHub tokens)
- The "show once" pattern for secrets — copy UX, confirmation
- Environment badges (production/staging/development) — color coding?
- Revocation UX — confirmation dialog, showing impact
- Key labels and organization at scale (20+ keys)
- Missing: show revoked keys (history), add env filter, pagination

**Consider:**
- An operator with 1 key vs 50 keys across 3 environments
- The "oops I closed the tab before copying" scenario
- Key rotation workflow
- Which agents are using which key (if trackable)

### View 8: Settings

Console configuration. Notification channels, user management, tenant settings.

**Backend partially exists:**
- Health endpoint shows auth_provider, version
- Telegram webhook configured via env vars
- No user management endpoints beyond bootstrap
- No settings API

**Questions to answer through research:**
- How do self-hosted tools handle settings? (Sentry, GitLab, Grafana)
- Notification channel configuration UI (Telegram, Slack, Discord)
- User management (list, invite, roles) — when this is built
- Theme preferences, session settings
- Retention policy configuration (`EDICTUM_EVENT_RETENTION_DAYS`)
- Signing key management (view, rotate)
- About/system info page (version, auth provider, DB status, connected agents)

**Consider:**
- Settings that require restart vs live-reloadable
- Danger zone (delete tenant, purge events, rotate signing keys)
- Connection testing (test Telegram webhook, test DB connection)

### Future Views (if needed)

- **Agent Detail** — drill-down from Dashboard Home or Events. Full agent profile: events, approvals, connection status, contract version, tool usage breakdown.
- **Environment Overview** — per-environment view: which contract is deployed, which agents are connected, recent events.
- **Deployment History** — timeline of all deploys across environments. Rollback actions.
- **Governance Intelligence** — PointFive-style recommendations. Pattern detection results, contract suggestions, security flags. (Major feature, needs its own planning cycle.)

## Backend Endpoints Likely Needed

Identify these during research. Known gaps from DASHBOARD.md:

| Endpoint | View | Purpose |
|----------|------|---------|
| `GET /api/v1/deployments` | View 6 | Deployment history |
| `GET /api/v1/keys` + `include_revoked`, `env` filter | View 7 | Key history, env filter |
| User management CRUD | View 8 | List, create, update, deactivate users |
| `GET /api/v1/settings` / `PUT /api/v1/settings` | View 8 | Runtime settings |
| Notification channel test endpoints | View 8 | Test Telegram/Slack connectivity |

## Output

For each view, update DASHBOARD.md with:
- Design references (which tools were researched)
- Layout description with ASCII wireframe
- Component breakdown
- Backend endpoints needed
- Scale scenarios (1 agent vs 100)
- Mobile layout
- 5 mockup variation descriptions

Then build the 5 real React mockups for user selection, same as Views 0-5.

## Rules

- Same coding standards as CLAUDE.md.
- Same design methodology: research → extract → draft → mockup → pick → build.
- Update DASHBOARD.md as you go — it's the living design document.
- Don't skip the research phase. Every view gets 5-7 tool comparisons first.
- Tool arguments context matters in EVERY view, not just Events and Approvals.
