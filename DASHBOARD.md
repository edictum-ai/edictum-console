# Dashboard Design Document

> View-by-view design decisions for the Edictum Console frontend.
> Each view is defined before any code is written.

## Brand System

Venture palette as base, adapted for both light and dark modes.
No logo SVG for now — text-only "Edictum Console" branding.

### Color Tokens

#### Dark Mode (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#f59e0b` | Brand amber. Buttons, active states, highlights |
| `--accent-green` | `#22c55e` | Success, allowed, approved |
| `--background` | `#0f172a` | Deep navy (slate-900) page background |
| `--surface` | `#1e293b` | Navy-light (slate-800) cards, panels |
| `--surface-hover` | `#334155` | Slate-700 hover state |
| `--foreground` | `#f8fafc` | Slate-50 primary text |
| `--foreground-secondary` | `#94a3b8` | Slate-400 secondary text |
| `--foreground-tertiary` | `#64748b` | Slate-500 tertiary text |
| `--border-color` | `rgba(255,255,255,0.08)` | Subtle borders |
| `--danger` | `#ff4444` | Errors, denied, destructive |

#### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#f59e0b` | Same amber (unchanged) |
| `--accent-green` | `#22c55e` | Same green (unchanged) |
| `--background` | `#f8fafc` | Slate-50 page background |
| `--surface` | `#ffffff` | White cards, panels |
| `--surface-hover` | `#f1f5f9` | Slate-100 hover state |
| `--foreground` | `#0f172a` | Slate-900 primary text |
| `--foreground-secondary` | `#64748b` | Slate-500 secondary text |
| `--foreground-tertiary` | `#94a3b8` | Slate-400 tertiary text |
| `--border-color` | `#e2e8f0` | Slate-200 borders |
| `--danger` | `#dc2626` | Red-600 |

### Shared

| Token | Value |
|-------|-------|
| Font (body) | Geist (Google Font) |
| Font (mono) | Geist Mono (Google Font) |
| Icons | Lucide React |
| Components | shadcn/ui |
| CSS | Tailwind CSS 4, `@theme inline` |
| Border radius | `0.5rem` cards, `rounded-full` badges |
| Theme toggle | User preference, stored in localStorage, defaults to dark |

### Semantic Colors

| Meaning | Text | Background | Border |
|---------|------|------------|--------|
| Allowed/Approved | `emerald-400` | `emerald-500/10` | `emerald-500/20` |
| Denied | `red-400` | `red-500/10` | `red-500/20` |
| Pending | `amber-400` | `amber-500/10` | `amber-500/20` |
| Timeout/Inactive | `zinc-400` | `zinc-500/10` | `zinc-500/20` |
| Enforce mode | `accent` | `accent/10` | `accent/20` |
| Observe mode | `blue-400` | `blue-500/10` | `blue-500/20` |

---

## Operator Flow

```
First visit → [Bootstrap Wizard] → Login → [Onboarding Guide] → Dashboard Home
                                                                      ↓
Return visit → Login → Dashboard Home → Events / Approvals / Contracts / Settings
```

---

## View 0: Bootstrap Wizard (first run only)

**Status:** Planning

### When it shows

`GET /api/v1/health` returns `bootstrap_complete: false`. The frontend checks this
before showing login. If not bootstrapped, redirect to wizard.

### What it does

Multi-step wizard that:
1. **Welcome** — "Welcome to Edictum Console" + brief what-this-is (governance for AI agents)
2. **Create Admin** — email + password form. This creates the first admin user + tenant.
3. **Capabilities Preview** — while setting up, show what the console can do:
   - Contract management (push contract bundles to agents)
   - HITL approval workflows (approve/deny agent actions)
   - Audit event feed (see what your agents are doing)
   - Fleet monitoring (which agents are connected)
4. **Done** — redirect to login

### Backend changes needed

Current CLAUDE.md says "No /setup endpoint — admin bootstrap from env vars in lifespan only."

**Decision change:** Support BOTH paths:
- **Env vars** (`EDICTUM_ADMIN_EMAIL` + `EDICTUM_ADMIN_PASSWORD`) — still works, bootstrap in lifespan as before. For Docker/CI/headless deploys.
- **Setup wizard** (`POST /api/v1/setup`) — new endpoint, only works when `bootstrap_complete: false`. Creates admin + tenant. For interactive first-run.

The setup endpoint is locked after first use (same guard as env var bootstrap: if users exist, reject).

### New endpoint

```
POST /api/v1/setup
  Auth: None (only works when no users exist)
  Body: { email: str, password: str, tenant_name?: str }
  Response: { message: "Admin created", user_id, tenant_id }
  Error: 409 if already bootstrapped
```

### Security

- S7 (Bootstrap Lock) still applies — setup only works once
- Password validation: minimum 12 characters
- Adversarial test: call `/setup` after bootstrap → 409
- No tenant_name required (defaults to "Default")

---

## View 1: Login

**Status:** Planning

### Layout

Centered card on background (`--background`).

- "Edictum Console" text branding (no logo SVG — text only for now)
- Email input
- Password input
- "Sign In" button (amber `#f59e0b` background, black text)
- Footer: version from health endpoint

### Behavior

1. On mount: `GET /api/v1/health` — check `bootstrap_complete`
   - If `false` → redirect to Bootstrap Wizard (View 0)
   - If `true` → show login form
2. On mount: `GET /api/v1/auth/me` — check if already logged in
   - If authenticated → redirect to Dashboard Home
3. On submit: `POST /api/v1/auth/login` with `{ email, password }`
   - Success → cookie set automatically, redirect to Dashboard Home
   - 401 → show "Invalid email or password" (no enumeration)
   - 429 → show "Too many attempts. Try again in X seconds." (from `Retry-After` header)

### Backend endpoints used

- `GET /api/v1/health` (no auth)
- `GET /api/v1/auth/me` (cookie, may 401)
- `POST /api/v1/auth/login` (no auth)

---

## View 2: Onboarding Guide (first time after login)

**Status:** Planning

### When it shows

After login, if no API keys exist for the tenant (`GET /api/v1/keys` returns empty list).
This is the "first time" signal — once they create a key, they won't see it again.

### What it does

A step-by-step guided flow overlaid on the real dashboard UI:

1. **"Create your first API key"** — highlights the API Keys section, walks through creating one. Shows the key once with a copy button. Explains environments (production/staging/development).

2. **"Connect your agent"** — shows a code snippet:
   ```python
   pip install edictum[server]
   ```
   ```python
   from edictum import Edictum

   e = Edictum.from_server(
       server_url="http://localhost:8000",
       api_key="edk_production_...",
   )
   ```

3. **"Push your first contract"** — brief pointer to the Contracts section where they can upload YAML. Or link to edictum docs for contract authoring.

4. **"You're set"** — dismiss, land on Dashboard Home.

### Backend endpoints used

- `GET /api/v1/keys` (dashboard auth) — check if empty
- `POST /api/v1/keys` (dashboard auth) — create key during guide
- `GET /api/v1/health` — for server URL display

### UX notes

- Skippable at any step ("Skip guide" link)
- Doesn't block the UI — it's a spotlight/tooltip overlay
- State stored in localStorage: `edictum_onboarding_completed`

---

## Design Methodology

For every view: research how best-in-class tools solve the same problem, extract what works,
then adapt for Edictum's context. Don't invent UI patterns — borrow proven ones.

### Key Patterns (from ArgoCD, Grafana, Datadog, Sentry, LaunchDarkly, Vercel, Linear)

1. **Home = entity list, not widget dashboard.** 6/7 tools land on a filtered, sortable list. Widget dashboards are secondary/enterprise.
2. **Tabs as triage funnels.** Progressive narrowing (All > For Review > Escalating) beats "show everything + filter down."
3. **Status badges are universal.** Colored pills/dots for instant health readability.
4. **Inline actions reduce navigation.** Approve/deny from the list. Deploy without leaving the page.
5. **Algorithmic surfacing.** Sort by urgency/age, not just chronological. Surface what needs attention.
6. **Real-time is table stakes.** Status badges, counts, and feeds update live via SSE.
7. **Sidebar is the navigation spine.** Left sidebar with customizable sections.
8. **No "Hello user" banners.** Personalization through content scoping (my approvals, my agents), not greetings. User identity shown in sidebar/header — subtle, not a banner.
9. **Empty state = onboarding.** First-time with no data → guided setup, not blank page.
10. **Custom dashboards are enterprise.** Start simple, add widget builder later.

---

## View 3: Dashboard Home

**Status:** Planning

### Design References

- **Sentry**: Tabbed triage (All > For Review > Escalating) with sparklines and event counts
- **ArgoCD**: Status badge cards with sync/health at a glance, pie chart summary toggle
- **Vercel**: Clean project cards with deploy status, sidebar navigation
- **Linear**: Focus grouping — algorithmically surface what matters first

### What it answers

The operator opens the console and asks: **"Is everything OK? What needs my attention?"**

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar           │  Summary Bar                                │
│                   │  [Pending: 3] [Agents: 12] [Events 24h: 847]│
│ • Overview   ←    │─────────────────────────────────────────────│
│ • Events          │  Needs Attention                            │
│ • Approvals       │  ┌─────────────────────────────────────────┐│
│ • Contracts       │  │ ⬤ 3 pending approvals (oldest: 2m ago) ││
│ • API Keys        │  │ ⬤ 1 agent disconnected (bot-prod-3)    ││
│ • Settings        │  │ ⬤ 5 denials in last hour               ││
│                   │  └─────────────────────────────────────────┘│
│ ─────────────     │                                             │
│ user@email.com    │  Recent Activity                            │
│ Theme toggle      │  [Events] [Approvals] [Deployments]  tabs   │
│                   │  ┌─────────────────────────────────────────┐│
│                   │  │ 10:32 bot-prod-1  file.write  denied    ││
│                   │  │ 10:31 bot-prod-2  http.get    allowed   ││
│                   │  │ 10:30 deploy v7 → production            ││
│                   │  │ 10:28 approval #42 approved by admin    ││
│                   │  │ ...                                     ││
│                   │  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Sections

#### 1. Summary Bar (top)

3-4 compact metric cards. Not full widgets — just numbers with labels.

| Card | Value | Source | Color |
|------|-------|--------|-------|
| Pending Approvals | Count of status=pending | `GET /approvals?status=pending` | Amber if >0, green if 0 |
| Active Agents | Count of connected SSE clients | **New endpoint needed** | Green if >0, zinc if 0 |
| Events (24h) | Count of events in last 24 hours | **New endpoint needed** | Neutral |
| Denials (24h) | Count of verdict=denied in 24h | **New endpoint needed** | Red if >0, green if 0 |

**Scaling 1→100 agents:** The cards just show numbers. They work the same at any scale. The key is that the "Active Agents" count gives a health pulse without listing every agent.

#### 2. Needs Attention (middle)

A short, prioritized list of items requiring operator action. Not everything — just what's actionable. Sorted by urgency.

**Items that appear here:**
- Pending approvals (sorted by age, oldest first — they have timeouts)
- Agents that disconnected recently (if we track presence)
- Spike in denials (more denials than usual in a time window)
- Failed deployments (if any)

**Scaling:** At 1-3 agents, this might show "No issues" with a green checkmark. At 100 agents, it shows only the items that need action — maybe 5 disconnected agents and 12 pending approvals. It never shows 100 items. It's a **triage list**, capped at ~10 most urgent.

**Inline actions:** "Approve" / "Deny" buttons directly on pending approval items. "View" link to jump to details.

#### 3. Recent Activity (bottom)

Tabbed feed of recent events across the system.

**Tabs:**
- **All** — unified feed of events, approvals, deployments
- **Events** — audit events from agents (tool calls)
- **Approvals** — approval requests, decisions, timeouts
- **Deployments** — contract deploys

Each row: timestamp, agent name, action, verdict/status badge.

**Scaling:** Shows last 20 items with "View all →" link to the full Events/Approvals view. At 1 agent, you see sparse activity. At 100 agents, the feed is dense but still just 20 rows — the full firehose lives in the Events view (View 4).

**Real-time:** New items appear at the top via SSE. No manual refresh.

### Backend endpoints needed

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /api/v1/stats/overview` | Returns `{ pending_approvals, active_agents, events_24h, denials_24h }` | P0 |
| `GET /api/v1/agents` | List known agents with last_seen, status, event_count | P0 |
| `GET /api/v1/activity` | Unified recent activity feed (events + approvals + deploys) | P1 |
| Dashboard SSE endpoint (cookie auth) | Real-time updates for the web UI | P0 |

**Note:** `GET /api/v1/stats/overview` is a single aggregation endpoint. Better than making 4 separate calls. Computed server-side, cached briefly (5-10s in Redis).

### Needs Attention

Prioritized list of items requiring operator action. Sorted by urgency.

**What appears here (v1 — count-based, no intelligence):**

| Alert | Trigger | Action |
|-------|---------|--------|
| Pending approvals | status=pending, sorted by age (they have timeouts) | Approve / Deny inline |
| Agent offline | No heartbeat/events for X minutes | View agent detail |
| Agent dead | No activity for >1 hour | Investigate / Remove |
| Denial spike | Denials > 2x rolling average in time window | View denied events |

**Scaling note:** A single nanobot generates 200+ events/hour. At 10 agents that's 2,000+/hr.
This section must aggregate, not list individual events. "5 denials in last hour" not
"denial at 10:01, denial at 10:02, denial at 10:03..."

**Capped at ~10 most urgent items.** This is a triage list, not the full picture.

### Future: Governance Intelligence (separate feature — PointFive-style)

Planned as its own feature, not just a dashboard section. Similar to how PointFive detects
cloud waste and recommends optimizations, Edictum Console will detect governance gaps and
recommend contract improvements.

**Detect → Recommend → Remediate:**

- **Observe-mode gaps:** Agent triggers `file.write` in observe mode repeatedly → suggest "Add a file-safety contract"
- **Uncovered tools:** Agent calls tools not covered by any contract → suggest "Extend contract coverage"
- **Security patterns:** Unusual burst of sensitive tool calls → flag for investigation
- **Contract staleness:** Contract hasn't been updated in X weeks but agent behavior has changed → suggest review
- **Denial patterns:** Repeated denials on same tool+args → suggest allow-contract or finding on possible misconfiguration

**This is a differentiator.** Most ops consoles are passive dashboards. Edictum Console
actively helps operators tighten governance based on real agent behavior.

**Not in v1.** Requires: event aggregation pipeline, pattern detection engine (start with
count-based thresholds, ML later), recommendations table, UI for reviewing/acting on suggestions.
Plan the dashboard to have a slot for this, but don't build it yet.

### Scale scenarios

| Scenario | Summary Bar | Needs Attention | Recent Activity |
|----------|-------------|-----------------|-----------------|
| **1 agent, quiet** | Pending: 0, Agents: 1, Events: 12, Denials: 0 | "All clear" green state | Sparse, a few events |
| **1 agent, active** | Pending: 2, Agents: 1, Events: 230, Denials: 8 | 2 pending approvals, denial spike flag | Dense feed, verdict colors visible |
| **10 agents, normal** | Pending: 5, Agents: 10, Events: 2.1k, Denials: 23 | 5 approvals (oldest: 4m), 1 observe-mode suggestion | Fast-scrolling feed, tabbed filtering useful |
| **100 agents, peak** | Pending: 47, Agents: 89/100, Events: 18k, Denials: 412 | Top 10 most urgent (approval timeouts, 11 agents offline, security flag) | Feed is a firehose — tabs essential, "View all" link |

### Mockups needed

**5 layout variations to compare:**

1. **Summary top, triage middle, activity bottom** (current draft)
2. **Two-column: triage left, activity right** (wider screens, denser)
3. **Full-width activity feed with floating alert cards** (Sentry-inspired, alert toasts overlay the feed)
4. **Card grid home** (ArgoCD-inspired — each agent is a card with health badge, works well at 10, questionable at 100)
5. **Minimal: just triage + one-click into views** (Linear-inspired — the home is tiny, the sidebar does the work)

Each mockup should be shown with:
- 1 agent state
- 100 agent state

These mockups will be ASCII wireframes or built as static React components for visual comparison.

### Empty state

If no agents have connected yet (no events, no approvals):
- Summary bar shows all zeros
- "Needs Attention" shows nothing
- Recent Activity shows "No activity yet"
- The onboarding guide (View 2) handles first-time setup

### Sidebar navigation

Present on all views after login. Contains:

- **Overview** (View 3 — this page)
- **Events** (View 4)
- **Approvals** (View 5)
- **Contracts** (View 6)
- **API Keys** (View 7)
- **Settings** (View 8)
- Divider
- User email (subtle, bottom of sidebar)
- Theme toggle (light/dark)
- Logout

The sidebar shows badge counts for actionable items:
- Approvals shows pending count (e.g., "Approvals `3`")
- No counts on other items (avoid noise)

---

### Data Display Principle

**Tool name alone is useless. Arguments and context are what matters.**

Every event/approval row must show the call arguments prominently — not tucked behind a click.
`exec` tells the operator nothing. `exec("rm -rf /tmp")` tells them everything.

The backend already provides this:
- Events: `payload` JSON field contains `tool_args`, `side_effect`, `principal`, `environment`, `decision_source`, `reason`, `policy_version`
- Approvals: `tool_args` (JSON dict) + `message` (human-readable description)

**Display priority per row:**
1. Agent name + timestamp
2. Tool name + **full arguments** (the most important part)
3. Verdict/status badge
4. Context: contract that triggered the decision, reason, environment

---

## View 4: Events Feed

**Status:** Planning

### Design References

- **Datadog Log Explorer**: Faceted sidebar + event list + right detail panel. Gold standard.
- **Kibana Discover**: Always-on date histogram with click-drag zoom. Customizable columns.
- **Axiom**: Live-first default. Structured filter builder (no query language needed).
- **Vercel Logs**: "Show N New Events" button — don't push events off screen while reading.
- **Grafana Explore**: Dual detail mode (inline expand OR side panel toggle).
- **Sentry**: Progressive disclosure — collapsible sections, expand what you need.

### What it answers

"What are my agents doing? What got denied? What should I worry about?"

### Event Storage Architecture

**v1: Postgres + TTL + auto-partition pruning.**

- All events stored in Postgres (monthly partitions, already implemented)
- `EDICTUM_EVENT_RETENTION_DAYS` setting (default 7 for local/free, 90 for enterprise/startup)
- `prune_event_partitions()` auto-drops old partitions
- Composite indexes: `(tenant_id, timestamp)`, `(tenant_id, agent_id, timestamp)`, `(tenant_id, verdict, timestamp)`
- At 100 agents: ~14M events/month, ~42 GB for 90 days. Postgres handles this fine.
- Never sample audit events — 100% recall required for governance.

**Future: EventSink protocol for dual-write** (Postgres + OTLP/S3/Elastic). Phase 2.
**Future: ClickHouse option for 1000+ agent fleets.** Phase 3.
**Future: Redis Streams → pattern detector for Governance Intelligence.** Phase 2.

### Layout: Three-Panel (Datadog-inspired)

```
┌──────────────────┬────────────────────────────────┬──────────────────┐
│ FILTERS          │ VERDICT HISTOGRAM               │                  │
│                  │ [▓▓|▓▓▓▓|▓▓|▓|▓▓▓▓▓▓|▓▓▓]     │                  │
│ Agent            │  ■ allowed ■ denied ■ pending   │  EVENT DETAIL    │
│  agent-47  (412) │                                 │                  │
│  agent-03  (341) │ ─ EVENTS ──── Live [●] ──────  │  agent-47        │
│  agent-12  (287) │                                 │  12:34:02        │
│  ...89 total     │ TIME  AGENT    TOOL     VERDICT │  [DENIED]        │
│                  │ ───── ──────── ──────── ─────── │                  │
│ Tool             │ 12:34 agent-47 exec     [DENY]  │  ── tool_args ── │
│  exec      (847) │       "deploy prod --force"     │  command:         │
│  read_file (412) │                                 │   deploy prod    │
│  write_file(203) │ 12:34 agent-03 read_file [ALLOW]│   --force        │
│  mcp_call   (98) │       "/var/secrets/keys.json"  │  working_dir:    │
│                  │                                 │   /app/releases  │
│ Verdict          │ 12:33 agent-91 mcp_call [PEND]  │                  │
│  allowed   (1247)│       "stripe.charges.create"   │  ── decision ──  │
│  denied     (412)│       {amount: 20000, usd}      │  reason: "force  │
│  pending     (47)│            [Approve] [Deny]     │   deploy denied  │
│                  │                                 │   by contract"   │
│ Mode             │ 12:33 agent-22 exec     [ALLOW] │  contract:       │
│  enforce   (1580)│       "npm test --coverage"     │   no-force-push  │
│  observe    (126)│                                 │  mode: enforce   │
│                  │ 12:32 agent-05 write    [DENY]  │  env: production │
│ Environment      │       "/etc/nginx/upstream.conf"│                  │
│  production (980)│                                 │  ── raw json ──  │
│  staging    (726)│ [Show 12 New Events]            │  [collapsed]     │
│                  │                     ~12 evt/sec │  [Copy JSON]     │
└──────────────────┴────────────────────────────────┴──────────────────┘
```

### Three Panels

#### Left: Faceted Filters

- Known dimensions: **agent_id**, **tool_name**, **verdict**, **mode**, **environment**
- Each value shows count (e.g., `denied (412)`)
- Click to filter. Click again to remove.
- Active filters shown as removable pills above the event list
- No query language needed — structured filters cover the use case
- Sidebar collapsible on narrow screens

#### Center: Event List + Histogram

**Verdict Histogram (always present above the list):**
- Stacked bar chart: green (allowed), red (denied), amber (pending)
- Auto-buckets based on selected time range
- Click-drag to zoom into a time range (Kibana pattern)
- Answers "when did denials spike?" instantly

**Event List:**
- Each row shows: timestamp, agent, tool, **truncated args preview**, verdict badge
- Args preview: heuristic picks the most important field from tool_args
  - `exec` → show `command` value
  - `read_file`/`write_file` → show `path` value
  - `mcp_call` → show function name + key params
  - Fallback: first key/value pair, truncated at ~60 chars
- Verdict badge: colored pill (green/red/amber/zinc)
- Pending approvals show inline [Approve] [Deny] buttons
- Click row → opens detail in right panel

**Live Mode (default):**
- SSE stream, events appear at top
- "Show N New Events" button when paused/scrolled (Vercel pattern)
- Pause button freezes stream
- Auto-batch rendering: if >10 events/sec, update UI at 1/sec with "receiving N evt/sec" indicator
- 500-event in-memory buffer. Older events load from API on scroll.
- "Return to Live" button when in historical time range (Axiom pattern)

**Virtual scrolling** (TanStack Virtual) — non-negotiable at 100 agents. Only render visible rows.
**Cursor-based pagination** for historical data (not offset — events are constantly written).

#### Right: Event Detail Panel

Opens when clicking an event row. Structured sections, not a flat dump.

**Section order (optimized for governance decisions):**

1. **Header:** Verdict badge (large, colored) + tool_name + agent_id + timestamp
2. **Tool Arguments** (OPEN BY DEFAULT — the most important section):
   - Formatted key/value table, not raw JSON
   - Long values (SQL queries, code, email bodies) in monospace block
   - Copy individual values or entire args as JSON
3. **Decision Context:** verdict, mode, reason, decision_source, policy_version
4. **Agent Context:** agent_id, environment, principal, side_effect
5. **Raw JSON:** collapsed by default, for debugging. Full event payload.

**Toggle:** Operators can switch detail view to inline expand (Grafana pattern) via a setting.

### Scale Handling

| Scale | Filter Panel | Histogram | List | Detail |
|-------|-------------|-----------|------|--------|
| 1 agent (sparse) | Single value per facet | Sparse bars | Calm, events trickle | Full detail visible |
| 10 agents | Facets show distribution | Moderate density | Scrollable, manageable | Side panel works |
| 100 agents (firehose) | Facet counts essential for navigation | Dense, stacked verdict colors | Virtual scroll, batched rendering, "Show N New" buffer | Side panel essential — can't expand inline at this rate |

**Agent selector** at the top: "All agents" (default) or pick specific agents. Like Vercel's "filter to my requests."

### Mobile Layout

Single column. Filter panel → slide-out drawer. Detail → full-screen overlay.

```
┌──────────────────────────┐
│ [≡ Filters] Events  [●]  │
│                          │
│ ┌──────────────────────┐ │
│ │ ● exec             2m │ │
│ │ agent-47 | [DENIED]   │ │
│ │ "deploy prod --force" │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ● read_file        3m │ │
│ │ agent-03 | [ALLOWED]  │ │
│ │ "/data/report.csv"    │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ● mcp_call         5m │ │
│ │ agent-91 | [PENDING]  │ │
│ │ "stripe.charge $200"  │ │
│ │      [Approve] [Deny] │ │
│ └──────────────────────┘ │
│                          │
│     [Show 4 New Events]  │
└──────────────────────────┘
```

- Card layout with **args preview inline** (most important field shown directly)
- Tap card → full-screen detail
- Swipe right → filter by this agent. Swipe left → filter by this tool.

### Backend Changes Needed

| Change | Type | Purpose |
|--------|------|---------|
| Add `offset` param to `GET /events` | Update | Cursor-based pagination |
| Add `mode` filter to `GET /events` | Update | Filter enforce vs observe |
| Add total count header to `GET /events` | Update | "Showing X of Y" |
| `GET /api/v1/events/stats` | New | Aggregations: count by verdict, by agent, by tool, by time bucket |
| `GET /api/v1/stream/dashboard` | New | SSE endpoint accepting cookie auth (current `/stream` is API-key only) |
| `EDICTUM_EVENT_RETENTION_DAYS` setting | New | Configurable TTL. Default 7 (local/free tier), 90 (enterprise/startup) |
| `prune_event_partitions()` | New | Auto-drop old partitions in background worker |
| Composite indexes on events table | New migration | Speed up dashboard aggregation queries |

### Mockups needed

5 layout variations (same approach as View 3):
1. Three-panel (Datadog) — as drafted above
2. Two-panel — no filter sidebar, filters as pills/dropdowns above the list
3. Full-width list with histogram — filters collapsed by default, expand on demand
4. Split: histogram + summary cards top, event list bottom (Kibana-like)
5. Stream-first: live feed dominant, historical as secondary mode (Axiom-like)

Each at 1 agent and 100 agents. Real React mockups when we build.

## View 5: Approvals Queue

**Status:** Planning

### Design References

- **PagerDuty**: Color-coded urgency, swipe-to-act mobile, escalation timeout, bulk checkbox+bar
- **Slack Workflows**: Inline approve/deny buttons, one-click approve, modal for deny reason, message updates in-place
- **Linear Triage**: Keyboard shortcuts for rapid processing (`A`=approve, `D`=deny), sequential inbox flow
- **Terraform Cloud**: "Show what will change" plan output — tool_args displayed like a plan diff
- **Opsgenie**: Long-tap multi-select on mobile, priority-based sorting

### What it answers

"What agents are waiting on me? What do they want to do? Should I allow it?"

### Key difference from Events

Approvals are **urgent and time-bounded**. Agents are waiting for a decision. Timeouts
tick down (default 5 minutes). This is the most latency-sensitive view in the console.

### Layout

**Adaptive:** Auto-switches based on pending count.

**Low volume (<5 pending) — Card View:**
```
┌──────────────────┬─────────────────────────────────────────────┐
│ EDICTUM CONSOLE  │ Approvals   2 pending                       │
│                  ├─────────────────────────────────────────────┤
│   Overview       │                                             │
│   Events         │ ┌─ nanobot-prod ──────────── 4:32 ────────┐│
│ * Approvals [2]  │ │                           remaining     ││
│   Contracts      │ │ exec("rm -rf /tmp/build-artifacts")     ││
│   API Keys       │ │                                          ││
│   Settings       │ │ "Cleanup build artifacts from last       ││
│                  │ │  deploy before starting new build"       ││
│ ──────────────── │ │                                          ││
│ user@email.com   │ │ ── tool_args ──────────────────────────  ││
│ [◑] [↗]         │ │ command:  rm -rf /tmp/build-artifacts    ││
│                  │ │ cwd:     /app                            ││
│                  │ │ env:     production                      ││
│                  │ │                                          ││
│                  │ │ timeout: deny on expiry                  ││
│                  │ │                                          ││
│                  │ │        [Approve]        [Deny ▾]         ││
│                  │ └──────────────────────────────────────────┘│
│                  │                                             │
│                  │ ┌─ nanobot-prod ──────────── 2:18 ────────┐│
│                  │ │                           remaining     ││
│                  │ │ write_file("/etc/app.cfg")               ││
│                  │ │                                          ││
│                  │ │ "Update max_retries from 3 to 5"        ││
│                  │ │                                          ││
│                  │ │ ── tool_args ──────────────────────────  ││
│                  │ │ path:     /etc/app.cfg                   ││
│                  │ │ content:  max_retries = 5 (was 3)       ││
│                  │ │ env:      production                     ││
│                  │ │                                          ││
│                  │ │ timeout: deny on expiry                  ││
│                  │ │                                          ││
│                  │ │        [Approve]        [Deny ▾]         ││
│                  │ └──────────────────────────────────────────┘│
│                  │                                             │
│                  │ ── History ────────────────────────────────│
│                  │ 12:20 nanobot-prod exec [APPROVED] admin 2m│
│                  │ 11:45 nanobot-prod write [DENIED] admin 1m │
│                  │                          View all →        │
└──────────────────┴─────────────────────────────────────────────┘
```

**High volume (5+ pending) — Table View:**
```
┌──────────────────┬─────────────────────────────────────────────┐
│ EDICTUM CONSOLE  │ Approvals   47 pending                      │
│                  ├─────────────────────────────────────────────┤
│   Overview       │                                             │
│   Events         │ [☑ Select All]  [Approve (3)] [Deny (3)]   │
│ * Approvals [47] │                                             │
│   Contracts      │ ┌──────────────────────────────────────────┐│
│   API Keys       │ │[Pending] [Approved] [Denied] [Timeout]  ││
│   Settings       │ │                                          ││
│                  │ │ [Agent ▾] [Tool ▾] [Env ▾] [Search..]   ││
│ ──────────────── │ │                                          ││
│ user@email.com   │ │ ⏱   AGENT    TOOL       ARGS      ENV   ││
│ [◑] [↗]         │ │ ──── ──────── ────────── ──────── ────── ││
│                  │ │☐0:42 agent-47 exec       "deploy  prod  ││
│                  │ │ [!!]          prod       --force"        ││
│                  │ │      [Approve] [Deny]                    ││
│                  │ │                                          ││
│                  │ │☐1:18 agent-12 write_file "/etc/   prod  ││
│                  │ │ [!]                     nginx.."         ││
│                  │ │      [Approve] [Deny]                    ││
│                  │ │                                          ││
│                  │ │☐3:45 agent-91 mcp_call   "stripe  prod  ││
│                  │ │                          .charge         ││
│                  │ │                          $200"           ││
│                  │ │      [Approve] [Deny]                    ││
│                  │ │                                          ││
│                  │ │☐4:12 agent-33 exec       "npm     stag  ││
│                  │ │                          publish"        ││
│                  │ │      [Approve] [Deny]                    ││
│                  │ │                                          ││
│                  │ │ ... +43 more                             ││
│                  │ └──────────────────────────────────────────┘│
└──────────────────┴─────────────────────────────────────────────┘
```

### Countdown Timer + Color Escalation

The single most important UI element. Agents are waiting for a decision.

| Zone | Condition | Visual | Behavior |
|------|-----------|--------|----------|
| Green | >60% time remaining | Green text, calm | Normal sort order |
| Amber | 20-60% remaining | Amber text | Sort rising |
| Red | <20% remaining | Red text, pulse animation | Bumped to top of list |
| Expired | 0% | Grey, struck through | Shows "timed out (denied)" or "timed out (allowed)" |

If `timeout_effect` is `"allow"` (dangerous — wrong thing happens on expiry), the red zone
gets an extra danger treatment: red background tint + warning icon.

### Action UX

**Approve:** One click/tap. No confirmation dialog. Agent is waiting — friction kills.
Optional reason field (not required).

**Deny:** One click/tap opens inline reason field (not a modal — stay on page).
Reason is **required** for deny. Submit to complete.

**Keyboard shortcuts (desktop, Linear-inspired):**
- `A` = Approve selected/focused
- `D` = Open deny reason field
- `Enter` = Submit deny reason
- `Escape` = Cancel
- `↑`/`↓` = Navigate queue
- `Space` = Toggle checkbox (for bulk)

**Swipe gestures (mobile, PagerDuty-inspired):**
- Swipe right = Approve (green flash)
- Swipe left = Deny (opens reason input)

### Bulk Actions

For the "47 pending" scenario:

- Checkboxes on each row
- Action bar appears when items selected: "Approve Selected (N)" / "Deny Selected (N)"
- "Select All Pending" shortcut
- Filter first, then bulk act: e.g., filter to `env=staging` + `tool=read_file`, select all, approve all
- Deny-all requires a single shared reason
- Group by agent: "agent-finance-bot (12 pending)" with "Approve All for Agent" action

### Tool Arguments Display (Terraform Plan Pattern)

`tool_args` is the star of the show. This is what the operator needs to make a decision.

**In card view:** Full args displayed as structured key-value table (always visible).

**In table view:** Truncated preview in the row. Smart heuristic picks the key argument:
- `exec` → show `command`
- `write_file` → show `path`
- `mcp_call` → show function + key params
- `send_email` → show `to` + `subject`
- Fallback: first key, truncated ~60 chars

**In detail panel (click row):** Full args + message + decision context.
Known tool types get semantic rendering:
- SQL: syntax highlighted, destructive keywords (DROP/DELETE) in red
- File paths: monospace with directory tree context
- Financial: amount with currency formatting
- Email: preview card layout (to/subject/body)

### Mobile Layout

Full-screen cards. Swipe through like a card deck.

```
┌──────────────────────────┐
│ Approvals    47 pending   │
│                          │
│ ┌──────────────────────┐ │
│ │      ⏱ 0:42 [!!]     │ │
│ │                       │ │
│ │ agent-47              │ │
│ │ exec  |  production   │ │
│ │                       │ │
│ │ "deploy prod --force" │ │
│ │                       │ │
│ │ ── args ────────────  │ │
│ │ command: deploy prod  │ │
│ │          --force      │ │
│ │ cwd: /app/releases    │ │
│ │                       │ │
│ │ timeout: deny         │ │
│ │                       │ │
│ │  [Approve]   [Deny]   │ │
│ └──────────────────────┘ │
│                          │
│ ← swipe right: approve   │
│   swipe left: deny →     │
│                          │
│         1 / 47           │
└──────────────────────────┘
```

Push notifications with action buttons (PagerDuty pattern):
- Notification shows: agent, tool, args preview, countdown
- "Approve" button directly on notification (lock screen)
- "View" button opens full detail

### Real-Time (SSE)

- New approvals appear at top without refresh (`approval_created`)
- Decided by someone else → item disappears with "Decided by [name] via [console/telegram]" flash (`approval_decided`)
- Timed out → item greys out with "Timed out" label (`approval_timeout`)
- Countdown timers tick client-side (computed from `created_at + timeout_seconds`)
- Connection lost indicator: "Live updates paused — reconnecting..."

### Post-Decision Feedback

- Card/row animates: green border (approved), red (denied)
- Shows decided_by + time_to_decision
- Auto-advance to next pending (mobile)
- Desktop: item stays briefly (0.5s transition), then moves to history section
- Toast notification: "Approved — agent-47 exec"

### Audit Trail — Who Approved, Where, When

Every decision is a full audit record. Non-negotiable for governance.

**Fields tracked per decision:**
- `decided_by` — who (user email or "telegram:@username" or "slack:@user")
- `decided_via` — where (console / telegram / slack / discord) **NEW FIELD NEEDED**
- `decided_at` — when (timestamp)
- `decision_reason` — why (free text, required for deny)
- `time_to_decision` — how long (computed: decided_at - created_at)

**Multi-channel approval flow:**
1. Agent creates approval → stored in DB with status=pending
2. Approval fans out to ALL configured channels (NotificationChannel protocol):
   - Console: appears in Approvals queue (SSE push)
   - Telegram: message with inline Approve/Deny buttons
   - Slack: Block Kit message with action buttons (future)
   - Discord: embed with reaction buttons (future)
3. **First response wins** — whichever channel responds first records the decision
4. All other channels get updated: "Decided by admin@co via Telegram" (message edit)
5. Agent receives decision via poll or SSE

**Race condition handling:** `submit_decision()` already checks status before updating.
If two channels submit simultaneously, only the first succeeds. The second gets a 409 Conflict.

**Timeout flow:**
1. Background worker checks every 10s for expired approvals
2. Expired → status set to "timeout", `timeout_effect` applied (deny or allow)
3. SSE pushes `approval_timeout` to all connected clients
4. Telegram/Slack messages updated to show "Timed out — [denied/allowed]"
5. Agent polling `GET /approvals/{id}` receives `status: "timeout"`

**Backend change needed:** Add `decided_via` field to Approval model and schema.

### History Tab

Below the pending queue, or as a separate tab.

- Filterable: status, agent, tool, env, decided_by, **decided_via**, date range
- Each entry: what was requested, what was decided, who decided, **via which channel**, time-to-decision
- **Time-to-decision metric** — average response time. Helps identify when team needs more operators or timeouts are too aggressive.
- **Channel breakdown** — % of decisions via console vs telegram vs slack. Shows where the team actually works.

### Backend Changes Needed

| Change | Type | Purpose |
|--------|------|---------|
| Add `agent_id` filter to `GET /approvals` | Update | Filter by agent |
| Add `tool_name` filter to `GET /approvals` | Update | Filter by tool |
| Add `env` filter to `GET /approvals` | Update | Filter by environment |
| Add `since`/`until` filters to `GET /approvals` | Update | Time range for history |
| Add total count header | Update | "Showing X of Y" |
| `PUT /api/v1/approvals/bulk` | New | Bulk approve/deny multiple approvals |
| Dashboard SSE (cookie auth) | New | Real-time approval events for web UI |

### Mockups needed

5 variations (real React when we build):
1. Card view (low volume) + table view (high volume) with auto-switch — as drafted above
2. Full-width table always, with expandable detail rows (Kibana inline expand)
3. Two-column: queue left, detail right (like email inbox)
4. Kanban: columns for Pending → Approved / Denied / Timeout (Trello-style)
5. Notification-center style: stacked cards with swipe actions, optimized for mobile-first

## View 6: Contracts (Bundles)

**Status:** Design complete — ready for mockup build

### Design references

| Tool | Key Pattern | Adopted? |
|------|------------|----------|
| **LaunchDarkly** | Per-flag targeting per env; env selector dropdown; "Compare and Copy" with selective checkbox copying; JSON patch diff in audit log | Yes — env comparison, selective promote |
| **Terraform Cloud** | State diff vs previous version (automatic); run-to-state lineage; rollback behind "Advanced" toggle | Yes — auto-diff; No — hidden rollback |
| **ArgoCD** | Live diff (Desired vs Live) side-by-side/unified; health status badges with propagation; resource tree | Yes — diff viewer gold standard; status badges |
| **AWS AppConfig** | Graduated rollout strategies (linear/exponential); auto-rollback on alarm; validators before deploy | Future — graduated rollout; Yes — validation |
| **Vercel** | Deployment timeline; 3-path promote (instant rollback, promote preview, promote staged); post-rollback auto-assign disable | Yes — rollback as distinct action; deployment timeline |
| **OPA/Styra DAS** | Impact analysis simulation before deploy; manual distribution mode with approval; decision replay | Future — impact preview |
| **Unleash** | Environment-as-columns in flag list table; change request workflow (Draft→Review→Approve→Apply); scheduling | Yes — environment matrix pattern |

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Contracts                                    [Upload Contract] │
├─────────────────────────────────────────────────────────────┤
│ Current Deployments                                           │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ Production   │ │ Staging      │ │ Development  │          │
│ │ v3 · 2h ago  │ │ v4 · 30m ago │ │ v5 · just now│          │
│ │ by admin@... │ │ by admin@... │ │ by admin@... │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
├─────────────────────────────────────────────────────────────┤
│ Version │ Uploaded    │ By       │ prod │ stag │ dev │ Actions│
│─────────┼─────────────┼──────────┼──────┼──────┼─────┼────────│
│ v5      │ 2m ago      │ admin@   │      │      │ ●   │ ⋯     │
│ v4      │ 1h ago      │ admin@   │      │ ●    │     │ ⋯     │
│ v3      │ 3h ago      │ admin@   │ ●    │      │     │ ⋯     │
│ v2      │ yesterday   │ admin@   │      │      │     │ ⋯     │
│ v1      │ 2 days ago  │ admin@   │      │      │     │ ⋯     │
├─────────────────────────────────────────────────────────────┤
│ Showing 5 of 12 versions                     [Load more]     │
└─────────────────────────────────────────────────────────────┘
```

**Contract Detail (click a version row):**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Contracts                                          │
│ Contract v4                                                  │
│ Uploaded 1h ago by admin@example.com                         │
│ [deployed: staging]              [Deploy to...] [Compare]    │
├──────────┬──────────┬──────────────────────────────────────┤
│ YAML     │ Diff     │ Deployment History                    │
├──────────┴──────────┴──────────────────────────────────────┤
│ (Active tab content)                                         │
│                                                              │
│ YAML tab: Syntax-highlighted YAML with line numbers,         │
│   code folding, search. Read-only. Copy + Download buttons.  │
│                                                              │
│ Diff tab: "Compare with: [v3 ▾]" dropdown.                  │
│   Side-by-side diff with red/green highlighting.             │
│   Shows additions, deletions, modifications.                 │
│                                                              │
│ History tab: Vertical timeline of deployments.               │
│   Each entry: env badge, timestamp, deployed by.             │
│   "Rollback to this version" link on past deployments.       │
└─────────────────────────────────────────────────────────────┘
```

### Component breakdown

| Component | Purpose | shadcn/ui base |
|-----------|---------|---------------|
| `ContractsPage` | Page wrapper, data fetching, state | — |
| `CurrentDeployments` | Summary cards showing current version per env | Card |
| `ContractTable` | Version list with environment matrix columns | DataTable (TanStack Table) |
| `EnvironmentBadge` | Colored dot/badge for env columns (green=deployed) | Badge |
| `ContractDetail` | Detail view with tabs (YAML, Diff, History) | Tabs |
| `YamlViewer` | Syntax-highlighted YAML display (CodeMirror or Shiki) | — (custom) |
| `ContractDiff` | Side-by-side diff between two versions | — (custom, use diff library) |
| `DeploymentTimeline` | Vertical timeline of deploys for a version | — (custom) |
| `UploadContractDialog` | Modal: file picker or paste YAML, validation | Dialog, Textarea |
| `DeployDialog` | Confirmation modal: version, target env, mini-diff | AlertDialog |
| `RollbackDialog` | Confirmation: target env, version to restore, diff | AlertDialog |
| `CompareEnvironmentsDialog` | Side-by-side: staging vs production YAML diff | Dialog |

### Data flow

1. **List page** loads: `GET /api/v1/bundles` → table with `deployed_envs` per bundle.
2. **Current deployments** cards: derived from bundles list (latest deployed version per env), or `GET /api/v1/bundles/current?env=production` × 3 envs.
3. **Contract detail** navigates to `/dashboard/contracts/{version}`.
4. **YAML tab**: `GET /api/v1/bundles/{version}/yaml` → render with syntax highlighting.
5. **Diff tab**: Fetch both `GET /api/v1/bundles/{versionA}/yaml` and `GET /api/v1/bundles/{versionB}/yaml` → client-side diff (use `diff` library).
6. **Deploy action**: `POST /api/v1/bundles/{version}/deploy` with `{ env }`.
7. **Upload**: `POST /api/v1/bundles` with `{ yaml_content }` → redirect to new version detail.
8. **SSE**: Dashboard SSE stream delivers `contract_update` events → auto-refresh list and deployment cards.

### Backend endpoints needed

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `GET /api/v1/bundles` | GET | Exists | List bundles with deployed_envs |
| `GET /api/v1/bundles/{version}` | GET | Exists | Single bundle metadata |
| `GET /api/v1/bundles/{version}/yaml` | GET | Exists | Raw YAML content |
| `POST /api/v1/bundles` | POST | Exists | Upload new bundle |
| `POST /api/v1/bundles/{version}/deploy` | POST | Exists | Deploy to environment |
| `GET /api/v1/bundles/current?env=` | GET | Exists | Current deployed per env |
| `GET /api/v1/deployments` | GET | **New** | Deployment history timeline |
| `GET /api/v1/bundles` + pagination | GET | **Update** | Add `limit`, `offset` params |

### Scale scenarios

**1 contract (getting started):**
- Current Deployments cards may show "Not deployed" for some envs.
- Table has 1-5 rows. Environment matrix is still valuable — shows where each version lives.
- Empty state for deployment history: "Upload your first contract to get started" with link to docs.

**20 contracts (active governance):**
- Current Deployments cards are the quick-orientation anchor — "what's live right now?"
- Table benefits from search-by-version, filter by "deployed to production only", and pagination.
- Diff viewer becomes essential — compare v18 to v15 to understand cumulative changes.
- Consider a "changelog" view: what changed in each version (auto-generated from YAML diff).

### Mobile layout

- Current Deployments cards stack vertically (full-width cards).
- Contract table becomes a card list: each card shows version, upload date, environment badges.
- Contract detail tabs stack — tab bar scrolls horizontally.
- YAML viewer uses smaller monospace font, horizontal scroll enabled.
- Deploy/Rollback dialogs are full-screen bottom sheets.
- Diff viewer switches to unified diff (not side-by-side) on mobile.

### Full composition model

The console must support edictum's multi-bundle composition. Environments don't just have "one version deployed" — they have a **composition stack**:

```
Production:
  Layer 1: org-base-contracts v3 (enforce)
  Layer 2: team-api-contracts v2 (enforce)
  Layer 3: candidate-pii v1 (observe_alongside) ← amber indicator, shadow
```

**Composition rules** (from edictum core):
- Same contract ID → later layer overrides earlier
- Unique contract IDs → concatenated
- `observe_alongside: true` bundles → shadow copies (evaluated but never enforce)
- Session limits → merged by taking more restrictive (lower) value

The UI must show:
- Composition stack per environment (which bundles, what order, enforce vs observe)
- `observe_alongside` bundles visually differentiated (amber/dashed border, "observe" badge)
- Override report: which contracts were replaced by which layer
- Shadow results in events (linkable from Events view)

### YAML editor (not upload-only)

The console includes a proper YAML editor for contracts, not just file upload:
- Syntax-highlighted YAML editor (CodeMirror or Monaco)
- Schema validation on edit (JSON Schema from edictum core)
- Contract-level diff between versions (not just line diff — show added/removed/modified contracts)
- Upload from file picker OR paste OR edit in-browser

### Playground (from edictum-hub)

Adapted from the edictum-hub playground — a Pyodide-powered in-browser contract testing tool:
- **Left pane:** Contract YAML editor
- **Right pane:** Python code editor (test tool calls against the contracts)
- **Bottom:** Output panel showing audit events as styled cards (green=allowed, red=denied, amber=warning)
- **Pre-built examples:** File Agent, Research Agent, DevOps Agent scenarios
- **No server needed:** Runs entirely in-browser via Pyodide + `edictum[yaml]`

The playground is integrated into the Contracts view (as a tab or mode), not a separate page. The workflow: write/edit contract → test in playground → upload to console → deploy to environment.

### CI/CD deployment

API-key-authenticated endpoints for CI/CD pipelines:
- `POST /api/v1/bundles` with API key auth (not just dashboard cookie) → upload from pipeline
- `POST /api/v1/bundles/{version}/deploy` with API key auth → deploy from pipeline
- GitOps integration (ArgoCD-style repo watching) is on the roadmap (P1) but not in first release

### Mockup variations

5 variations (real React when we build):

1. **Environment Matrix + Detail Tabs (the structured operator view)** — Top: Current Deployments cards per environment showing composition stack (layers with enforce/observe badges). Middle: Version table with env deployment dots. Detail view has tabs: YAML | Diff | Playground | Deploy History. The "structured" approach — everything has its place.

2. **Split Pane IDE (the developer view)** — Two-column always visible: contract list (compact, left), editor/viewer (right). Right pane switches between: YAML editor, diff view, playground, deploy dialog. Feels like VS Code or the hub playground. Best for operators who are also writing contracts.

3. **ArgoCD Sync Status (the ops view)** — Primary view is sync status per environment: "Production: in sync (v3)" / "Staging: out of sync (v3 deployed, v5 available)." Click an out-of-sync environment → see diff + deploy button. Composition stack visible per environment with observe-alongside indicators. Playground is a separate tab/route. Optimized for "deploy and monitor" workflow.

4. **Timeline + Composition Stack (the deployment-centric view)** — Primary view is a vertical deployment timeline (Vercel-inspired). Each environment section shows its composition stack (base + overrides + observe-alongside with amber treatment). Upload and playground accessible from the top action bar. Best for teams doing frequent deploys and composition changes.

5. **Tabbed Workbench (the all-in-one view)** — Top-level tabs: Bundles | Environments | Playground | Deploy History. Bundles tab: version list with upload and editor. Environments tab: per-env composition stacks with deploy actions. Playground tab: full Pyodide playground (YAML + Python + output, like hub). History tab: deployment timeline. Each tab is focused, tabs separate concerns that other variations combine.

---

## View 7: API Keys

**Status:** Design complete — ready for mockup build

### Design references

| Tool | Key Pattern | Adopted? |
|------|------------|----------|
| **Stripe** | Test/Live toggle with color coding; publishable/secret key types; "Roll key" rotation with scheduled expiry; restricted keys with per-resource permissions | Yes — color-coded environments; Yes — rotation concept; No — permissions grid (not needed) |
| **OpenAI** | Project-scoped keys; show-once modal; All/Restricted/ReadOnly permissions; service accounts for production | Yes — show-once modal pattern; Future — service accounts |
| **Twilio** | SID-based identification (always visible); secret shown once; friendly name for identification; three key types | Yes — prefix always visible; Yes — labels are primary identifiers |
| **GitHub** | Fine-grained PATs with repo scoping; mandatory expiration; last-used tracking + auto-cleanup; regeneration preserves settings; org approval flow | Yes — last-used tracking; Future — expiration; Yes — regeneration preserves label |
| **AWS IAM** | 2 keys max per user; deactivate-before-delete pattern; last used (date + region + service); security credentials tab | Yes — deactivate concept; Yes — detailed last-used; No — 2 key limit |
| **Vercel** | Simple creation modal; scope (user/team); flexible expiration (1d–1yr); identifiable prefix format | Yes — simple modal; Yes — identifiable prefix |
| **Supabase** | Publishable/secret separation; secret hidden behind reveal; multiple secret keys; inline documentation | Yes — prefix visibility; No — reveal pattern (we use show-once) |

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ API Keys                                      [Create Key]   │
├─────────────────────────────────────────────────────────────┤
│ Filter: [All ▾] [Production] [Staging] [Development]  □ Show revoked │
├─────────────────────────────────────────────────────────────┤
│ Label        │ Key Prefix       │ Env     │ Created  │ Last Used │ ⋯ │
│──────────────┼──────────────────┼─────────┼──────────┼───────────┼───│
│ prod-agent-1 │ edk_prod_a3b9... │ 🔴 prod │ 2d ago   │ 2h ago    │ ⋯ │
│ staging-test │ edk_stag_f7e2... │ 🟡 stag │ 5d ago   │ 1h ago    │ ⋯ │
│ dev-local    │ edk_dev_c1d4...  │ 🟢 dev  │ 1w ago   │ 30m ago   │ ⋯ │
│ old-agent    │ edk_prod_x9y8... │ 🔴 prod │ 30d ago  │ Never     │ ⋯ │
│              │                  │         │          │ ⚠ unused  │   │
├─────────────────────────────────────────────────────────────┤
│ Showing 4 of 4 active keys                                   │
└─────────────────────────────────────────────────────────────┘
```

**Create Key Modal:**
```
┌──────────────────────────────────────┐
│ Create API Key                    ✕  │
├──────────────────────────────────────┤
│ Label *                              │
│ ┌──────────────────────────────────┐ │
│ │ my-production-agent              │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Environment *                        │
│ ┌──────────────────────────────────┐ │
│ │ Production                    ▾  │ │
│ └──────────────────────────────────┘ │
│ ℹ Production keys are for deployed   │
│   agents. Use staging for testing.   │
│                                      │
│              [Cancel] [Create Key]   │
└──────────────────────────────────────┘
```

**Key Created (show-once):**
```
┌──────────────────────────────────────┐
│ API Key Created                   ✕  │
├──────────────────────────────────────┤
│ ⚠ Copy this key now. It won't be    │
│   shown again.                       │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ edk_prod_a3b9f2Kx7mNpQr...     📋│ │
│ └──────────────────────────────────┘ │
│ ✓ Copied to clipboard               │
│                                      │
│ Quick start:                         │
│ export EDICTUM_API_KEY=edk_prod_...  │
│                                      │
│                            [Done]    │
└──────────────────────────────────────┘
```

**Revoke Confirmation:**
```
┌──────────────────────────────────────┐
│ Revoke API Key                    ✕  │
├──────────────────────────────────────┤
│ Revoke "prod-agent-1"?              │
│                                      │
│ This key was last used 2 hours ago.  │
│ Revoking will immediately disconnect │
│ any agents using this key.           │
│                                      │
│ Type the key label to confirm:       │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│                                      │
│            [Cancel] [Revoke Key]     │
└──────────────────────────────────────┘
```

### Component breakdown

| Component | Purpose | shadcn/ui base |
|-----------|---------|---------------|
| `ApiKeysPage` | Page wrapper, data fetching, filter state | — |
| `KeyTable` | Sortable table of keys with env badges | DataTable (TanStack Table) |
| `EnvironmentBadge` | Colored badge: prod=red, staging=amber, dev=green | Badge |
| `KeyPrefixDisplay` | Monospace prefix with copy-on-hover | — (custom) |
| `LastUsedCell` | Relative time + "Never" warning for unused keys | — (custom) |
| `CreateKeyDialog` | Two-step modal: form → show-once secret | Dialog |
| `KeySecretDisplay` | Read-only input + copy button + checkmark feedback | Input, Button |
| `RevokeKeyDialog` | Confirmation with impact warning + typed confirmation | AlertDialog, Input |
| `KeyFilterBar` | Environment filter tabs + "Show revoked" toggle | Tabs, Switch |
| `EmptyState` | "Create your first API key" with illustration | — (custom) |

### Data flow

1. **List page** loads: `GET /api/v1/keys` → table of active keys (filtered client-side by env).
2. **Show revoked toggle**: `GET /api/v1/keys?include_revoked=true` → shows all keys, revoked ones greyed out.
3. **Create key**: Modal form → `POST /api/v1/keys` with `{ env, label }` → response includes full `key` (shown once) → modal transitions to show-once state.
4. **Copy action**: `navigator.clipboard.writeText(key)` → checkmark feedback.
5. **Revoke key**: `DELETE /api/v1/keys/{id}` → key row transitions to revoked state (grey, strikethrough).
6. **SSE**: Dashboard SSE stream could deliver key-related events (key created, key revoked) for multi-tab sync.

### Backend endpoints needed

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `POST /api/v1/keys` | POST | Exists | Create key (returns full key once) |
| `GET /api/v1/keys` | GET | Exists | List non-revoked keys |
| `DELETE /api/v1/keys/{id}` | DELETE | Exists | Revoke key |
| `GET /api/v1/keys` + `include_revoked` | GET | **Update** | Include revoked keys in list |
| `GET /api/v1/keys` + `env` filter | GET | **Update** | Server-side env filtering |
| `GET /api/v1/keys` + `last_used_at` | GET | **Update** | Return last-used timestamp per key |
| Track `last_used_at` on API key auth | — | **New** | Update `last_used_at` in `api_keys` table on each authenticated request |

### Scale scenarios

**1-5 keys (getting started):**
- Simple table, no filtering needed. All visible at once.
- Environment filter tabs are still useful for visual orientation.
- Empty state: friendly illustration + "Create your first API key" CTA + brief explanation of what keys connect agents to the console.

**5-20 keys (multi-environment):**
- Environment filter tabs with count badges: `Production (3) | Staging (5) | Development (4)`.
- Sort by "Last Used" surfaces stale keys. Unused keys get warning icon.
- Label search becomes useful — operators name keys after agents/services.

**20-50 keys (fleet scale):**
- Server-side pagination. Search by label.
- "Never used" and "Last used > 30 days ago" quick filters to identify cleanup candidates.
- Bulk revocation NOT in v1 — revocation should be deliberate, one at a time.
- Consider grouping by environment with collapsible sections.

### Mobile layout

- Table becomes card list: each card shows label, env badge, prefix, last used.
- Create Key modal becomes a full-screen bottom sheet.
- Show-once secret display has large touch-target copy button (48x48px minimum).
- Revoke confirmation is full-screen dialog.
- Filter tabs scroll horizontally.
- Key prefix truncated but env badge always visible.

### Mockup variations

5 variations (real React when we build):
1. **Filtered table with show-once modal** — as drafted above. Table with env badges, filter tabs, sort by last used. Two-step create modal (form → secret). Typed confirmation for production revocation.
2. **Card grid grouped by environment** — Three columns (or sections): Production, Staging, Development. Each key is a card within its environment group. Cards show label, prefix, last used, actions. Best at low key counts.
3. **Split view: key list + detail panel** — Left panel: compact key list. Right panel: selected key details (full metadata, usage stats, quick actions). Like a settings panel with preview.
4. **Stripe-inspired toggle view** — Top toggle: Production | Staging | Development (like Stripe's Test/Live). Switching toggles shows only keys for that environment. Keys displayed as simple rows with copy-prefix and revoke actions.
5. **Timeline-based creation history** — Vertical timeline showing key lifecycle: created → first used → last used → (revoked). Most recent at top. Each timeline entry is a key card. Groups naturally by recency. Best for audit-oriented operators.

---

## View 8: Settings

**Status:** Design complete — ready for mockup build

### Design references

| Tool | Key Pattern | Adopted? |
|------|------------|----------|
| **Sentry** | 3-level hierarchy (account/org/project); per-project alert rules + webhook integrations | No — too many levels; Yes — webhook integrations concept |
| **GitLab** | Full system info page (CPU/mem/disk); health checks at `/admin/health_check`; background jobs monitoring | Yes — system info is gold standard |
| **Grafana** | Contact Points (25+ integration types); test notification button; delivery status tracking; multi-destination contact points | Yes — Contact Points model for notification channels; Yes — test button is essential |
| **Mattermost** | 13 sidebar categories; env var override display; incoming/outgoing webhooks | No — too many categories; Yes — env var override indicators |
| **Chatwoot** | Role-based settings visibility; per-event notification toggles (email/push grid); feature flag gating for premium features | Yes — role-based visibility; Future — per-event notification preferences |
| **Plausible** | Flat single-page settings; dedicated danger zone (red, bottom); clear consequence descriptions | Yes — flat navigation model; Yes — danger zone is textbook |
| **Outline** | Minimal settings matching focused product; clean API key management; security section | Yes — minimal and focused |

### Layout

```
┌───────────┬─────────────────────────────────────────────────┐
│ Settings  │                                                  │
│           │ System                                           │
│ ● System  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│ ○ Notif.  │ │ Version     │ │ Auth        │ │ Uptime      ││
│ ○ Danger  │ │ v0.1.0      │ │ local       │ │ 3d 14h      ││
│           │ └─────────────┘ └─────────────┘ └─────────────┘│
│ ───────── │                                                  │
│ Future:   │ Service Health                                   │
│ ○ Users   │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│ ○ Secur.  │ │ 🟢 Postgres │ │ 🟢 Redis    │ │ 👥 Agents   ││
│ ○ Retent. │ │ Connected   │ │ Connected   │ │ 4 connected ││
│           │ │ 2ms latency │ │ <1ms        │ │ 2 envs      ││
│           │ └─────────────┘ └─────────────┘ └─────────────┘│
│           │                                                  │
│           │ Bootstrap Status                                 │
│           │ ✅ Admin created · ✅ Signing key generated      │
│           │ ✅ First API key created · ✅ First contract     │
│           │                                    [Refresh ↻]  │
└───────────┴─────────────────────────────────────────────────┘
```

**Notifications section:**
```
│ Notifications                                                │
│                                                              │
│ Notification Channels                        [Add Channel]   │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Name      │ Type     │ Status     │ Last Sent │ Actions│  │
│ │───────────┼──────────┼────────────┼───────────┼────────│  │
│ │ Ops Team  │ Telegram │ 🟢 Active  │ 2h ago    │ ⋯     │  │
│ │ Alerts    │ Webhook  │ 🔴 Failed  │ 1d ago    │ ⋯     │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ℹ Channels configured via environment variables are shown    │
│   as read-only.                                              │
│                                        [Set via EDICTUM_*]  │
```

**Danger Zone section:**
```
│ ⚠ Danger Zone                                               │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Rotate Signing Key                                     │  │
│ │ Generate a new signing key. All connected agents will  │  │
│ │ need to re-fetch contracts. Active deployments will    │  │
│ │ be re-signed with the new key.                         │  │
│ │                                        [Rotate Key]    │  │
│ ├────────────────────────────────────────────────────────┤  │
│ │ Purge Audit Events                                     │  │
│ │ Permanently delete all audit events older than N days. │  │
│ │ This action cannot be undone.                          │  │
│ │ Older than: [30 ▾] days                [Purge Events]  │  │
│ └────────────────────────────────────────────────────────┘  │
```

### Component breakdown

| Component | Purpose | shadcn/ui base |
|-----------|---------|---------------|
| `SettingsPage` | Page wrapper with sidebar navigation | — |
| `SettingsSidebar` | Left nav: System, Notifications, Danger Zone (+ future slots) | — (custom) |
| `SystemInfoSection` | Version, auth, uptime cards + service health | Card |
| `ServiceHealthCard` | Individual service status: green/red dot, latency, details | Card, Badge |
| `BootstrapChecklist` | Checklist of setup steps completed | — (custom) |
| `NotificationsSection` | Channel list table + add channel | DataTable |
| `AddChannelDialog` | Type selector → type-specific form → test → save | Dialog, Select |
| `ChannelTypeForm` | Dynamic form fields per channel type (Telegram, Webhook, Slack) | Input, Select |
| `TestConnectionButton` | Send test notification with inline spinner + result | Button |
| `DangerZoneSection` | Red-bordered section with destructive actions | Card (destructive variant) |
| `RotateKeyDialog` | Confirmation: type "rotate" to confirm | AlertDialog, Input |
| `PurgeEventsDialog` | Confirmation: select days + type "purge events" to confirm | AlertDialog, Input, Select |
| `EnvVarBadge` | "Set via EDICTUM_*" badge for env-controlled settings | Badge |

### Data flow

1. **System info** loads: `GET /api/v1/health` → version, auth_provider, bootstrap_status. Auto-refresh every 30s.
2. **Service health**: Part of health endpoint response or separate internal check. Shows Postgres connectivity, Redis connectivity, connected agent count.
3. **Notification channels**: `GET /api/v1/settings/notifications` → list of configured channels with status. **New endpoint needed.**
4. **Add channel**: `POST /api/v1/settings/notifications` with `{ type, name, config }` → creates channel.
5. **Test channel**: `POST /api/v1/settings/notifications/{id}/test` → sends test notification, returns success/failure.
6. **Rotate signing key**: `POST /api/v1/settings/rotate-signing-key` → generates new key, re-signs active deployments. **New endpoint needed.**
7. **Purge events**: `DELETE /api/v1/settings/purge-events?older_than_days=30` → deletes old events. **New endpoint needed.**
8. **Env var overrides**: Backend health endpoint already returns some config. Extend to indicate which settings are env-var-controlled.

### Backend endpoints needed

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `GET /api/v1/health` | GET | Exists | Version, auth_provider, bootstrap |
| `GET /api/v1/health` (extend) | GET | **Update** | Add DB/Redis latency, connected agents count, uptime |
| `GET /api/v1/settings/notifications` | GET | **New** | List notification channels + status |
| `POST /api/v1/settings/notifications` | POST | **New** | Add notification channel |
| `PUT /api/v1/settings/notifications/{id}` | PUT | **New** | Update channel config |
| `DELETE /api/v1/settings/notifications/{id}` | DELETE | **New** | Remove channel |
| `POST /api/v1/settings/notifications/{id}/test` | POST | **New** | Test notification delivery |
| `POST /api/v1/settings/rotate-signing-key` | POST | **New** | Rotate signing key pair |
| `DELETE /api/v1/settings/purge-events` | DELETE | **New** | Purge old audit events |

### Scale scenarios

**Solo operator (1 user, 1-3 agents):**
- System info is the primary value — "is everything healthy?"
- Bootstrap checklist helps complete initial setup.
- Notification channels may be just 1 Telegram chat.
- Danger zone rarely used.

**Team with multiple environments (5+ users, 20+ agents):**
- System info becomes a quick health dashboard before investigating issues.
- Multiple notification channels: Telegram for ops team, Webhook for PagerDuty integration, Slack for engineering.
- User management section becomes critical (post-first-release).
- Danger zone needs role gating — only admins see destructive actions.

### Mobile layout

- Sidebar collapses to horizontal tabs at top of page (System | Notifications | Danger Zone).
- System info cards stack vertically (full-width).
- Service health cards stack vertically.
- Notification channels table becomes card list.
- Add Channel dialog is full-screen bottom sheet.
- Danger Zone actions stack vertically with large touch targets for confirmation inputs.
- Test Connection button shows result as inline banner below the channel card.

### Mockup variations

5 variations (real React when we build):
1. **Sidebar sections + card grid** — as drafted above. Left sidebar nav, right content area. System info as card grid. Notifications as table. Danger zone at bottom with red border. Plausible-inspired simplicity.
2. **Single scrollable page (no sidebar)** — All sections stacked vertically with sticky section headers. System info → Notifications → Security (future) → Danger Zone. Simpler navigation, works well when there are few sections. Section anchors in a top breadcrumb.
3. **Tabbed layout** — Horizontal tabs at top: System | Notifications | Danger Zone. Each tab is a full page. Cleaner separation of concerns but requires more clicks to navigate between sections.
4. **Dashboard-style status wall** — System info and notifications merged into a monitoring dashboard. Large health status indicators, notification delivery graphs, real-time agent connection status. More operational, less settings-like. Inspired by Grafana server admin.
5. **Wizard/checklist first-run + standard settings** — First visit shows a setup wizard (connect database → create key → upload contract → configure notifications). After setup, transitions to standard settings view. Bootstrap checklist is the hero. Inspired by Chatwoot onboarding.

---

## Backend Endpoints Needed (New)

Endpoints required to support the dashboard that don't exist yet.

### Views 0-5 (Home, Events, Approvals, etc.)

| Endpoint | Method | Auth | Response | Purpose |
|----------|--------|------|----------|---------|
| `/api/v1/stats/overview` | GET | Cookie | `{ pending_approvals, active_agents, total_agents, events_24h, denials_24h }` | Summary bar on home. Cached 5-10s in Redis. |
| `/api/v1/agents` | GET | Cookie | `[{ agent_id, last_seen, status, event_count_24h, current_env, policy_version }]` | Agent list. Derived from events + SSE connections. |
| `/api/v1/agents/{agent_id}` | GET | Cookie | Single agent detail with event history | Agent detail drill-down |
| `/api/v1/activity` | GET | Cookie | Unified feed: events + approvals + deploys, sorted by time | Recent activity feed on home |
| `/api/v1/stream/dashboard` | GET | Cookie (SSE) | Same events as `/stream` but accepts cookie auth | Real-time updates for web UI |
| `/api/v1/setup` | POST | None (bootstrap only) | `{ message, user_id, tenant_id }` | Interactive bootstrap wizard |
| `/api/v1/events` (update) | GET | Cookie/Key | Add `offset` param for pagination | Enable event paging |
| `/api/v1/approvals` (update) | GET | Cookie/Key | Add `agent_id`, `env`, `since`, `until` filters | Better approval filtering |

### View 6: Contracts

| Endpoint | Method | Auth | Response | Purpose |
|----------|--------|------|----------|---------|
| `/api/v1/deployments` | GET | Cookie | `[{ id, env, bundle_version, deployed_by, created_at }]` | Deployment history timeline |
| `/api/v1/bundles` (update) | GET | Cookie | Add `limit`, `offset` pagination params | Scale bundle list beyond 20 versions |

### View 7: API Keys

| Endpoint | Method | Auth | Response | Purpose |
|----------|--------|------|----------|---------|
| `/api/v1/keys` (update) | GET | Cookie | Add `include_revoked` query param | Show revoked key history |
| `/api/v1/keys` (update) | GET | Cookie | Add `env` filter query param | Server-side env filtering |
| `/api/v1/keys` (update) | GET | Cookie | Add `last_used_at` to response | Track key usage freshness |
| API key auth middleware (update) | — | — | Update `last_used_at` on each authenticated request | Feed last-used data |

### View 8: Settings

| Endpoint | Method | Auth | Response | Purpose |
|----------|--------|------|----------|---------|
| `/api/v1/health` (update) | GET | None | Add `db_latency_ms`, `redis_latency_ms`, `connected_agents`, `uptime_seconds` | Richer system info for Settings |
| `GET /api/v1/settings/notifications` | GET | Cookie | `[{ id, name, type, config, enabled, last_sent_at, last_status }]` | List notification channels |
| `POST /api/v1/settings/notifications` | POST | Cookie | `{ id, name, type, ... }` | Add notification channel |
| `PUT /api/v1/settings/notifications/{id}` | PUT | Cookie | Updated channel | Update channel config |
| `DELETE /api/v1/settings/notifications/{id}` | DELETE | Cookie | 204 | Remove notification channel |
| `POST /api/v1/settings/notifications/{id}/test` | POST | Cookie | `{ success, message, delivered_at }` | Test notification delivery |
| `POST /api/v1/settings/rotate-signing-key` | POST | Cookie (admin) | `{ fingerprint, created_at }` | Rotate signing key pair |
| `DELETE /api/v1/settings/purge-events` | DELETE | Cookie (admin) | `{ deleted_count }` | Purge old audit events |

---

## Skills (Build Alongside Code)

Skills (`.claude/` slash commands or agent configs) that evolve with the codebase.
These ensure every session and every agent follows the same conventions.

| Skill | Purpose | Knows About |
|-------|---------|-------------|
| **frontend** | Build UI components following project patterns | Component library (shadcn/ui), API client patterns, routing, Tailwind tokens, dark/light mode, state management, SSE integration |
| **backend** | Build API endpoints following project patterns | DDD layers (service/route/schema), auth dependencies, tenant scoping, Pydantic v2, SQLAlchemy 2.0 async, testing discipline |
| **docs** | Keep documentation in sync with code changes | API reference (auto-generated from routes), user guides, configuration reference, deployment guide. Quality bar: match edictum core docs |

**Docs quality bar:** The edictum core library has excellent docs (MkDocs Material, deep purple + amber theme). Console docs must match that standard — always current, never stale. The docs skill should be triggered after any API or UI change to update the relevant documentation.

**Implementation:** Later, when we start building. Captured here so we don't forget.

---

## Roadmap (Post-First Push)

Features identified during planning, not in v1.

| Feature | Priority | Notes |
|---------|----------|-------|
| Governance Intelligence | P1 | PointFive-style detect→recommend→remediate. Pattern detection on events, contract suggestions, security flags. Separate planning needed. |
| Event streaming pipeline | P2 | Redis Streams as stepping stone, Kafka when scale demands. For Governance Intelligence (real-time pattern detection), not for replacing Postgres storage. Events dual-write: always Postgres (console UI) + optional stream for ML/analytics. |
| EventSink protocol + OTLP export | P1 | Dual-write: Postgres (always, for console UI) + customer's observability stack (OTLP, S3, Elastic). EventSink ABC when second sink is needed. Decouples "where events go" from ingestion. |
| Event retention + TTL | P0 | `EDICTUM_EVENT_RETENTION_DAYS` (default 90). Auto-drop partitions past TTL. Add composite indexes for dashboard queries. Keep Postgres bounded. |
| ClickHouse option | P3 | `EDICTUM_EVENT_STORE=clickhouse` + `docker compose --profile analytics`. For 1000+ agent fleets needing analytics over 100M+ rows. |
| User management CRUD | P2 | List, create, update, delete users beyond bootstrap |
| Environment overview page | P2 | List environments with status, current contract, connected agents |
| Signing key management UI | P2 | View, rotate signing keys |
| Custom dashboards / widgets | P3 | Enterprise feature. Widget builder, saved layouts. |
| Notification channels UI | P2 | Configure Telegram, Slack (when implemented) from Settings |
| Audit log export | P2 | CSV/JSON export of events |
| OIDC auth provider | P2 | AuthProvider protocol ready, needs implementation |
| Slack notification channel | P2 | NotificationChannel protocol ready, needs implementation |
| ObservabilitySink protocol | P3 | Add when OTLP integration is actually planned |
| Agent labels/tags | P1 | Grouping and filtering agents by custom tags |
| Contract diff viewer | P2 | Compare contract versions side by side |
| Approval delegation rules | P3 | Auto-approve based on tool/agent/args patterns |
| GitOps contract deployment | P1 | ArgoCD-style: connect Git repo → watch branch → auto-deploy contract bundles on push. Reference implementation: ArgoCD's app-of-apps pattern, repo polling + webhook receiver, sync status UI, auto-sync vs manual sync toggle. API endpoint (`POST /api/v1/bundles` with API key auth) ships first as foundation. |
