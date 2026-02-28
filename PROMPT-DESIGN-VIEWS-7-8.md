# Prompt: Design Views 7-8 — Mockup Build + User Selection

> Continue the design process for Views 7 (API Keys) and 8 (Settings).
> Research is done. Designs are drafted in DASHBOARD.md. Now: discuss with user, refine, build 5 mockups each, user picks.

## Required Reading (in this order)

1. `CONTEXT.md` — **Read first.** Alignment document. What edictum is, features, terminology, workflows, status.
2. `CLAUDE.md` — Project rules, architecture, coding standards.
3. `.docs-style-guide.md` — Terminology guide (binding).
4. `DASHBOARD.md` — All view designs. Views 7-8 have full designs with 5 mockup variation descriptions each.
5. `DEV-NOTES.md` — Dev workflow.

## How We Work (Established Process)

We design **one view at a time, in order of the flow.** For each view:

1. **Present the research findings** to the user — what the investigation found, key patterns from other tools
2. **Discuss** — user shares their vision, preferences, requirements. We align on the approach together.
3. **Refine the design** based on discussion — update DASHBOARD.md
4. **Build 5 real React mockup components** — hardcoded data, visual comparison
5. **User picks** — selects a variation or mixes elements from multiple
6. **Move to next view**

**Do NOT design autonomously.** Present findings, discuss, get direction, then build. The user drives the decisions.

## Current Status

- **View 6 (Contracts):** Fully designed with composition model, playground, editor, diff viewer. 5 mockup variations defined. Ready to build mockups (separate session using PROMPT-BUILD-VIEW6-MOCKUPS.md).
- **View 7 (API Keys):** Research complete (Stripe, OpenAI, Twilio, GitHub, AWS IAM, Vercel, Supabase). Design drafted in DASHBOARD.md. 5 mockup variations described. **Needs: discussion with user → refinement → build mockups.**
- **View 8 (Settings):** Research complete (Sentry, GitLab, Grafana, Mattermost, Chatwoot, Plausible, Outline). Design drafted in DASHBOARD.md. 5 mockup variations described. **Needs: discussion with user → refinement → build mockups.**

## View 7: API Keys — Discussion Points

Research found these key patterns across 7 tools. Present to user:

**Strongest patterns:**
- Show-once modal for secret (universal — Stripe, OpenAI, Twilio, GitHub, AWS, Vercel)
- Visible key prefix as identifier (`edk_prod_a3b9...` always shown, secret never retrievable)
- Environment color coding (Stripe's Test/Live toggle is gold standard)
- Last-used tracking (AWS shows date + region + service, GitHub auto-cleans unused)
- Graceful rotation > hard revoke (Stripe's "Roll key" with overlap period)
- Typed confirmation for production key revocation (GitHub pattern)

**Questions to align on with user:**
- Should label be required at creation? (Research says yes — "my-staging-agent" >> "SK3a4b...")
- Revoked keys: show in same list with toggle, or separate tab?
- Key expiration dates — include in v1 or defer?
- Last-used tracking — requires backend middleware change. Worth it for v1?
- The "I forgot to copy" scenario — guidance text only, or "create replacement" shortcut?
- Should we show which agents are currently connected with each key?

**Backend already has:** POST create (returns key once), GET list (non-revoked), DELETE revoke.
**Backend gaps:** `include_revoked` param, `env` filter, `last_used_at` tracking.

**5 draft mockup variations:**
1. Filtered table + show-once modal (structured, most tools use this)
2. Card grid grouped by environment (visual, good at low counts)
3. Split view: key list + detail panel (like settings with preview)
4. Stripe-inspired environment toggle (switch between envs)
5. Timeline-based creation history (audit-oriented)

## View 8: Settings — Discussion Points

Research found these key patterns across 7 tools. Present to user:

**Strongest patterns:**
- Flat/shallow navigation (Plausible model — avoid Mattermost's 13-category maze)
- Grafana Contact Points for notification channels (type selector, config form, test button, delivery status)
- Dedicated danger zone at page bottom (Plausible/GitHub — red border, consequence descriptions, typed confirmation)
- System info section (GitLab model — version, uptime, DB/Redis status, connected agents)
- Test connection button (only Grafana has this — it's the most requested feature for webhooks)
- Env var override indicators (Mattermost — show which settings are controlled by environment variables)

**Questions to align on with user:**
- Settings sidebar vs single scrollable page vs tabs? (Plausible uses flat, Grafana uses sidebar)
- How much system info? Just version + health, or CPU/memory/disk like GitLab?
- Notification channels: Grafana's Contact Points model, or simpler list?
- Danger zone actions for v1: rotate signing key + purge events. Others?
- User management section: reserve the slot but leave empty, or hide entirely?
- Should settings that require container restart be indicated?

**Backend partially exists:** Health endpoint (version, auth_provider, bootstrap). Telegram via env vars.
**Backend gaps:** Notification CRUD, test endpoint, rotate key, purge events, health extension.

**5 draft mockup variations:**
1. Sidebar sections + card grid (Plausible-inspired simplicity)
2. Single scrollable page, no sidebar (fewer sections = simpler)
3. Tabbed layout (horizontal tabs per section)
4. Dashboard-style status wall (Grafana admin feel)
5. Wizard/checklist first-run + standard settings (Chatwoot onboarding)

## Mockup Build Pattern

Same pattern as Views 3-5 mockups in `dashboard/src/pages/mockups/`:
- Self-contained page component, no API calls, hardcoded data
- Project design system (Tailwind, shadcn/ui, Venture palette)
- Dark and light theme support
- Registered in App.tsx under `/dashboard/mockups/`
- Lazy-loaded
- File naming: `apikeys-v1.tsx` through `apikeys-v5.tsx`, `settings-v1.tsx` through `settings-v5.tsx`

## Hardcoded Mock Data for View 7

```typescript
const MOCK_KEYS = [
  { id: "k1", prefix: "edk_prod_a3b9f2", env: "production", label: "prod-fleet-agent", created_at: "2026-02-25T10:00:00Z", last_used_at: "2026-02-27T06:30:00Z", revoked_at: null },
  { id: "k2", prefix: "edk_stag_f7e2c1", env: "staging", label: "staging-test", created_at: "2026-02-22T14:00:00Z", last_used_at: "2026-02-27T07:45:00Z", revoked_at: null },
  { id: "k3", prefix: "edk_dev_c1d4e5", env: "development", label: "dev-local", created_at: "2026-02-20T09:00:00Z", last_used_at: "2026-02-27T08:00:00Z", revoked_at: null },
  { id: "k4", prefix: "edk_prod_x9y8z7", env: "production", label: "old-prod-agent", created_at: "2026-01-28T10:00:00Z", last_used_at: null, revoked_at: null },
  { id: "k5", prefix: "edk_stag_m5n6o7", env: "staging", label: "deprecated-staging", created_at: "2026-01-15T10:00:00Z", last_used_at: "2026-02-01T12:00:00Z", revoked_at: "2026-02-10T09:00:00Z" },
];
```

## Hardcoded Mock Data for View 8

```typescript
const MOCK_HEALTH = {
  version: "0.1.0",
  auth_provider: "local",
  bootstrap_complete: true,
  uptime_seconds: 302400, // 3.5 days
  db_latency_ms: 2,
  redis_latency_ms: 0.5,
  connected_agents: 4,
  environments_active: ["production", "staging", "development"],
};

const MOCK_CHANNELS = [
  { id: "ch1", name: "Ops Team", type: "telegram", enabled: true, last_sent_at: "2026-02-27T06:00:00Z", last_status: "delivered", config: { chat_id: "-1001234567890" } },
  { id: "ch2", name: "PagerDuty Alerts", type: "webhook", enabled: true, last_sent_at: "2026-02-26T08:00:00Z", last_status: "failed", config: { url: "https://events.pagerduty.com/v2/enqueue" } },
  { id: "ch3", name: "Engineering", type: "slack", enabled: false, last_sent_at: null, last_status: null, config: { webhook_url: "https://hooks.slack.com/..." } },
];

const MOCK_BOOTSTRAP_STEPS = [
  { label: "Admin created", complete: true },
  { label: "Signing key generated", complete: true },
  { label: "First API key created", complete: true },
  { label: "First contract bundle uploaded", complete: true },
  { label: "First agent connected", complete: true },
  { label: "Notification channel configured", complete: false },
];
```

## Rules

- **One view at a time.** Finish View 7 discussion + mockups before starting View 8.
- **Present research, don't decide.** Show the user what was found, let them drive.
- **Follow established terminology.** Check `.docs-style-guide.md` before writing any text.
- pnpm always. No claude code mentions in commits.
- React 19 + TypeScript strict. shadcn/ui + Tailwind. Components < 200 lines.
- Update DASHBOARD.md with any design refinements from the discussion.
