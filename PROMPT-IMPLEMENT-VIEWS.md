# Prompt: Implement Dashboard Views (0-5)

> Self-contained prompt for building the Edictum Console frontend views.
> Use this to start a fresh session focused on implementation.

## What You're Building

The Edictum Console frontend — a React + TypeScript + Vite SPA embedded in a FastAPI backend.
It lives in `dashboard/` and is served by FastAPI at `/dashboard`.

## Required Reading Before Starting

Read these files in order:

1. `CLAUDE.md` — Project rules, architecture, coding standards (the law)
2. `SDK_COMPAT.md` — API contract the SDK expects
3. `DASHBOARD.md` — View-by-view design decisions (the design spec)
4. `src/edictum_server/routes/` — All backend API endpoints (what the frontend talks to)
5. `src/edictum_server/schemas/` — All request/response shapes

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript strict |
| Build | Vite, output to `dashboard/dist/` |
| Styling | Tailwind CSS 4, `@theme inline` for custom tokens |
| Components | shadcn/ui |
| Routing | React Router |
| Icons | Lucide React |
| Fonts | Geist + Geist Mono (Google Fonts) |
| Tables | TanStack Table |
| Charts | Recharts |
| HTTP | Fetch API with cookie auth (HttpOnly session cookie) |
| Real-time | SSE via EventSource API |
| Base path | `/dashboard` (Vite config + React Router) |

## Brand System

See DASHBOARD.md "Brand System" section. Key tokens:

- Dark mode: navy background `#0f172a`, surface `#1e293b`, amber accent `#f59e0b`
- Light mode: slate-50 background `#f8fafc`, white surface, same amber accent
- Fonts: Geist (body), Geist Mono (code/data)
- Theme toggle stored in localStorage, defaults to dark

## Implementation Order

Build one view at a time, in order. For each view:

### Step 1: Generate 5 Mockup Variations

Create 5 distinct React component mockups as static pages (hardcoded data, no API calls).
Each mockup should be a real, styled component — not ASCII wireframes.

Show each mockup at two data scales:
- **Light state:** 1 agent, sparse data
- **Dense state:** 100 agents, firehose data

The 5 variations should explore different layouts as described in DASHBOARD.md for that view.
Present all 5 to the user for selection.

### Step 2: User Picks One

Wait for the user to choose a layout direction (or request a mix).

### Step 3: Build the Real View

Implement the selected layout with:
- Real API calls to the backend
- Real-time SSE where applicable
- Proper error handling, loading states, empty states
- Mobile responsive layout
- Light/dark theme support
- Keyboard shortcuts where specified

### Step 4: Verify

- Component renders correctly with mock data
- API integration works with the running backend
- Mobile layout is usable
- Light and dark themes both look correct

## Views to Build

### View 0: Bootstrap Wizard (first run only)

**When:** `GET /api/v1/health` returns `bootstrap_complete: false`
**What:** Multi-step wizard: Welcome → Create Admin → Capabilities Preview → Done
**Backend:** New `POST /api/v1/setup` endpoint needed (build this too)
**Details:** DASHBOARD.md "View 0" section

### View 1: Login

**When:** Not authenticated, bootstrap complete
**What:** Centered card, email/password, "Edictum Console" text branding, amber accent
**Backend:** `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `GET /api/v1/health`
**Handles:** 401 (bad creds), 429 (rate limited, show Retry-After countdown)
**Details:** DASHBOARD.md "View 1" section

### View 2: Onboarding Guide (first time after login)

**When:** `GET /api/v1/keys` returns empty list (no API keys = first time)
**What:** Step-by-step overlay on real dashboard: create key → copy snippet → connect agent
**State:** localStorage `edictum_onboarding_completed`
**Skippable** at any step
**Details:** DASHBOARD.md "View 2" section

### View 3: Dashboard Home

**When:** Authenticated, normal operation
**What:** Summary bar + needs attention triage + recent activity feed
**Backend:** Needs new endpoints: `GET /api/v1/stats/overview`, `GET /api/v1/agents`
**Real-time:** SSE for live updates
**Generate 5 layout mockups** as described in DASHBOARD.md "Mockups needed"
**Details:** DASHBOARD.md "View 3" section

### View 4: Events Feed

**When:** Navigate to Events from sidebar
**What:** Three-panel layout: faceted filters + event list with histogram + detail panel
**Backend:** Needs updates: `offset` param, `mode` filter, `GET /api/v1/events/stats`, dashboard SSE
**Key:** Tool arguments displayed prominently — three-level display (preview → detail → raw JSON)
**Virtual scrolling** required (TanStack Virtual)
**Live mode** default with "Show N New Events" buffer
**Generate 5 layout mockups** as described in DASHBOARD.md "Mockups needed"
**Details:** DASHBOARD.md "View 4" section

### View 5: Approvals Queue

**When:** Navigate to Approvals from sidebar
**What:** Adaptive card/table view with countdown timers, inline approve/deny, bulk actions
**Backend:** Needs updates: `agent_id`/`tool_name`/`env` filters, `decided_via` field, bulk endpoint
**Key:** Countdown timer with color escalation is the most important UI element
**Action UX:** One-click approve, reason-required deny, keyboard shortcuts
**Generate 5 layout mockups** as described in DASHBOARD.md "Mockups needed"
**Details:** DASHBOARD.md "View 5" section

## Shared Components to Build First

Before the views, scaffold the app and build shared components:

1. **App scaffold:** Vite + React + TypeScript + Tailwind + shadcn/ui + React Router
2. **Theme system:** CSS variables for light/dark, localStorage toggle, Geist fonts
3. **API client:** `lib/api.ts` — single module for all server calls, cookie auth
4. **SSE client:** `lib/sse.ts` — EventSource wrapper with reconnection
5. **Sidebar layout:** Navigation spine used by all views after login
6. **Auth guard:** Route wrapper that checks `/auth/me` and redirects to login

## Backend Changes Needed

Some views require new or updated backend endpoints. Build these as part of each view:

| Endpoint | View | Type |
|----------|------|------|
| `POST /api/v1/setup` | View 0 | New |
| `GET /api/v1/stats/overview` | View 3 | New |
| `GET /api/v1/agents` | View 3 | New |
| `GET /api/v1/activity` | View 3 | New |
| `GET /api/v1/stream/dashboard` (cookie SSE) | View 3+ | New |
| `GET /api/v1/events` + `offset`, `mode` filter | View 4 | Update |
| `GET /api/v1/events/stats` | View 4 | New |
| `GET /api/v1/approvals` + `agent_id`, `tool_name`, `env` filters | View 5 | Update |
| `PUT /api/v1/approvals/bulk` | View 5 | New |
| Add `decided_via` to Approval model | View 5 | Migration |

## Rules

- Read CLAUDE.md coding standards. Follow them exactly.
- Dark theme first, light as secondary.
- Tool arguments are the most important data in every view. Never hide them.
- Files under 200 lines. Split components when they grow.
- No `any` types. TypeScript strict mode.
- Test each view after building (at minimum: renders without errors, API calls work).
- One view at a time. Don't start the next until the current one is approved.
