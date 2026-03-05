# Roadmap

This page tracks what Edictum Console has shipped and what is planned. Items move through three stages: [Shipped], [In Progress], and [Planned].

---

## [Shipped] v0.1.0

The first public release. Self-hostable operations console for governed AI agents.

**Authentication and Security:**

- Local auth provider (email/password, bcrypt, HttpOnly cookies, Redis sessions with sliding TTL)
- AuthProvider protocol for future OIDC integration
- API key management (environment-scoped, bcrypt hashed, revocable, prefix-indexed)
- CSRF protection (X-Requested-With header on cookie-auth mutating requests)
- Rate limiting on login (per-IP sliding window) and approval creation (per tenant+agent)
- User enumeration prevention (constant-time response for wrong email/password)
- Adversarial test suite (43+ tests across 8 security boundaries)

**Contract Management:**

- Contract library with versioning (each update creates a new version, old versions preserved)
- Import existing YAML bundles to decompose into individual library contracts
- Composable contracts: three-level model (Contract → Composition → Bundle)
- Compositions with per-contract mode overrides (enforce/observe), position ordering, enable/disable
- Bundle upload from raw YAML or assembly from compositions
- Bundle versioning with SHA-256 revision hash for drift detection
- Ed25519 bundle signing with private keys encrypted at rest (NaCl SecretBox)
- YAML diff viewer between any two bundle versions
- Evaluation playground (test contracts against tool calls without deploying)
- AI contract assistant (streaming chat, knows full contract schema)
  - Providers: Anthropic (Claude), OpenAI (GPT), OpenRouter (any model), Ollama (local)
  - Per-tenant config with encrypted API keys and usage tracking

**Live Hot-Reload:**

- SSE push to agents on bundle deployment (`contract_update` event with signed YAML)
- Bundle-filtered streams (agents only receive updates for their assigned bundle)
- Ed25519 signature + public key included in SSE event payload
- Signing key rotation (re-signs all active deployments)
- Agent auto-reconnect with exponential backoff (1s initial, 60s max)

**Human-in-the-Loop Approvals:**

- Dashboard approval queue with auto-switching card/table view
- Timer badges (green → amber → red) showing urgency
- Bulk approve/deny with checkbox selection, deny-with-reason dialog
- Configurable timeout per approval + timeout effect (deny or allow)
- Background worker (10s interval) expires overdue approvals
- Decision tracking (who, when, via which channel, reason)
- Rate limited (10 approval requests per 60 seconds per agent)

**Notification Channels:**

- 6 channel types: Telegram, Slack App, Slack Webhook, Discord, Webhook, Email
- Interactive approve/deny buttons in Telegram (inline keyboard), Slack (Block Kit), Discord (component buttons)
- Routing filters per channel (environments, agent patterns, contract names — AND logic)
- Secrets encrypted at rest with NaCl SecretBox, masked in API responses
- Test button per channel
- No env vars required — all channel config from dashboard

**Audit Event Feed:**

- Batch ingestion from agents (50 events / 5s flush, 10K buffer, dedup by call_id)
- Three-panel dashboard (faceted filters + event list with histogram + detail panel)
- URL-driven filters (shareable links)
- PostgreSQL partitioned by month, background partition worker
- Event purge (30/60/90 days) from settings danger zone

**Fleet Monitoring:**

- Live connected agents with environment, bundle, policy version, timestamp
- Drift detection (per-agent comparison against deployed bundle)
- Coverage analysis (per-agent and fleet-level: enforced/observed/ungoverned tools)
- Agent auto-registration on first SSE connection
- Agent detail page (coverage tab, analytics tab, history tab)
- Ungoverned tools sidebar on fleet page

**Agent Assignment System:**

- Three-level bundle resolution (explicit assignment → rule match → agent-provided)
- Assignment rules: priority-ordered, glob patterns on agent_id, optional tag match
- Bulk assignment (one bundle to multiple agents, pushes SSE events)
- Dry-run resolution endpoint (preview which bundle an agent would receive)

**Dashboard:**

- React SPA served by FastAPI at `/dashboard`
- Dark and light mode with theme toggle
- Real-time updates via SSE on every page
- 7 main pages: Home, Events, Approvals, Contracts, Agents, API Keys, Settings
- Getting-started wizard for first-time users

**Deployment:**

- Single Docker image (multi-stage: pnpm build → python build → slim runtime)
- Docker Compose (Postgres 16 + Redis 7 + server)
- Railway deployment config (`railway.toml`)
- Render deployment config (`render.yaml`)

---

## [Planned] OIDC Auth Provider

The `AuthProvider` protocol is already defined. A second implementation for OIDC/SSO will enable:

- Okta, Azure AD, Google Workspace, and other OIDC-compliant identity providers
- JWT verification instead of session cookies for API access
- Automatic user provisioning from identity provider claims
- Single sign-on across organization tools

---

## [Planned] Multi-Tenant Management UI

The backend is fully multi-tenant — every table has `tenant_id`, every query filters by it. The frontend currently assumes single-tenant (one admin, one team). Adding multi-tenant UI includes:

- Team/organization management
- Tenant selector/switcher in the dashboard
- Invitation flow for new team members
- Per-tenant settings and billing
- Role-based access control within tenants

---

## [Planned] Role-Based Access Control

Currently all dashboard users are admins within their tenant. RBAC would add:

- Predefined roles (admin, operator, viewer)
- Per-role permissions (who can deploy, who can approve, who can view only)
- Role assignment in the dashboard
- Audit trail for permission changes

---

## [Planned] Per-User Notification Subscriptions

Currently notification channels are team-wide — an admin configures channels for the entire tenant. Per-user subscriptions would allow:

- Individual users subscribing to specific environments, agents, or contract types
- Personal notification preferences (email digest vs. real-time)
- Mute/snooze per channel

---

## [Planned] Bundle Signature Verification in SDK

Ed25519 signatures are included in every `contract_update` SSE event. The SDK currently stores but does not verify them. A future `edictum[verified]` extra would:

- Verify bundle signatures before applying contract updates
- Reject tampered bundles at the agent level
- Pin public keys for additional security
- Provide signature verification CLI command

---

## [Planned] Observability Export

Audit events currently live in PostgreSQL. Production deployments need data flowing to existing infrastructure:

- OTLP/Prometheus metrics export (denial rates, latency, contract coverage)
- Webhook/Splunk HEC/Datadog audit sink integration
- Grafana dashboard templates
- `ObservabilitySink` protocol when ready (no premature abstraction)
