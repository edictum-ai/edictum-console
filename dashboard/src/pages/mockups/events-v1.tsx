import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Copy,
  ExternalLink,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

// ── Types ──────────────────────────────────────────────────────────────

type Verdict = "allowed" | "denied" | "pending"
type Mode = "enforce" | "observe"
type Environment = "production" | "staging" | "dev"

interface Event {
  id: string
  timestamp: string
  agent: string
  tool: string
  toolArgs: string
  toolArgsStructured: Record<string, unknown>
  verdict: Verdict
  mode: Mode
  environment: Environment
  contractId: string
  contractRule: string
  decisionContext: string
  durationMs: number
  traceId: string
}

// ── Mock Data ──────────────────────────────────────────────────────────

const MOCK_EVENTS: Event[] = [
  {
    id: "evt_001",
    timestamp: "2026-02-27T14:32:07Z",
    agent: "deploy-bot",
    tool: "shell_exec",
    toolArgs: 'exec("rm -rf /tmp/build-cache")',
    toolArgsStructured: {
      command: "rm -rf /tmp/build-cache",
      working_dir: "/app",
      timeout_seconds: 30,
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_deploy_v3",
    contractRule: "allow_temp_cleanup",
    decisionContext:
      "Path /tmp/* matched allowlist. Command rm with -rf flag permitted for /tmp paths only.",
    durationMs: 2,
    traceId: "trace_a1b2c3d4",
  },
  {
    id: "evt_002",
    timestamp: "2026-02-27T14:31:55Z",
    agent: "data-analyst",
    tool: "sql_query",
    toolArgs: 'query("SELECT * FROM users WHERE role = \'admin\'")',
    toolArgsStructured: {
      query: "SELECT * FROM users WHERE role = 'admin'",
      database: "analytics_prod",
      read_only: true,
    },
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contractId: "contract_analyst_v2",
    contractRule: "deny_pii_tables",
    decisionContext:
      "Table 'users' is classified as PII. Read access denied under data governance policy. Agent should use anonymized_users view.",
    durationMs: 1,
    traceId: "trace_e5f6g7h8",
  },
  {
    id: "evt_003",
    timestamp: "2026-02-27T14:31:42Z",
    agent: "code-review-bot",
    tool: "file_read",
    toolArgs: 'read("/src/auth/credentials.py")',
    toolArgsStructured: {
      path: "/src/auth/credentials.py",
      encoding: "utf-8",
    },
    verdict: "denied",
    mode: "enforce",
    environment: "staging",
    contractId: "contract_review_v1",
    contractRule: "deny_secrets_files",
    decisionContext:
      "File path matched secrets pattern: **/credentials.*. Access denied to prevent credential exposure in review output.",
    durationMs: 1,
    traceId: "trace_i9j0k1l2",
  },
  {
    id: "evt_004",
    timestamp: "2026-02-27T14:31:30Z",
    agent: "deploy-bot",
    tool: "shell_exec",
    toolArgs: 'exec("kubectl rollout restart deployment/api")',
    toolArgsStructured: {
      command: "kubectl rollout restart deployment/api",
      working_dir: "/app",
      timeout_seconds: 120,
      env: { KUBECONFIG: "/etc/kube/config" },
    },
    verdict: "pending",
    mode: "enforce",
    environment: "production",
    contractId: "contract_deploy_v3",
    contractRule: "require_approval_k8s_mutations",
    decisionContext:
      "kubectl mutating command requires human approval. Approval request sent to #ops-approvals channel.",
    durationMs: 0,
    traceId: "trace_m3n4o5p6",
  },
  {
    id: "evt_005",
    timestamp: "2026-02-27T14:31:18Z",
    agent: "research-agent",
    tool: "mcp_call",
    toolArgs: 'mcp("brave_search", { query: "CVE-2026-1234 exploit" })',
    toolArgsStructured: {
      server: "brave_search",
      method: "search",
      params: { query: "CVE-2026-1234 exploit", count: 10 },
    },
    verdict: "allowed",
    mode: "observe",
    environment: "dev",
    contractId: "contract_research_v1",
    contractRule: "allow_web_search",
    decisionContext:
      "Web search allowed in observe mode. Query logged for audit. No sensitive terms detected.",
    durationMs: 3,
    traceId: "trace_q7r8s9t0",
  },
  {
    id: "evt_006",
    timestamp: "2026-02-27T14:31:05Z",
    agent: "data-analyst",
    tool: "sql_query",
    toolArgs: 'query("DROP TABLE analytics_staging.temp_results")',
    toolArgsStructured: {
      query: "DROP TABLE analytics_staging.temp_results",
      database: "analytics_prod",
      read_only: false,
    },
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contractId: "contract_analyst_v2",
    contractRule: "deny_ddl_statements",
    decisionContext:
      "DDL statement (DROP TABLE) blocked. Analyst agents have read-only access. DDL requires ops-level approval.",
    durationMs: 1,
    traceId: "trace_u1v2w3x4",
  },
  {
    id: "evt_007",
    timestamp: "2026-02-27T14:30:52Z",
    agent: "support-bot",
    tool: "http_request",
    toolArgs: 'fetch("https://api.stripe.com/v1/charges", { method: "POST" })',
    toolArgsStructured: {
      url: "https://api.stripe.com/v1/charges",
      method: "POST",
      headers: { Authorization: "Bearer sk_live_***" },
      body: { amount: 5000, currency: "usd" },
    },
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contractId: "contract_support_v2",
    contractRule: "deny_financial_mutations",
    decisionContext:
      "POST to payment API blocked. Support agents cannot initiate charges. Escalate to billing team.",
    durationMs: 1,
    traceId: "trace_y5z6a7b8",
  },
  {
    id: "evt_008",
    timestamp: "2026-02-27T14:30:40Z",
    agent: "deploy-bot",
    tool: "file_write",
    toolArgs: 'write("/etc/nginx/conf.d/api.conf", "server { ... }")',
    toolArgsStructured: {
      path: "/etc/nginx/conf.d/api.conf",
      content: "server { listen 80; location /api { proxy_pass http://localhost:3000; } }",
      mode: "overwrite",
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "staging",
    contractId: "contract_deploy_v3",
    contractRule: "allow_config_writes_staging",
    decisionContext:
      "Config file write allowed in staging. Path /etc/nginx/conf.d/* is in the deploy allowlist for non-production environments.",
    durationMs: 4,
    traceId: "trace_c9d0e1f2",
  },
  {
    id: "evt_009",
    timestamp: "2026-02-27T14:30:28Z",
    agent: "research-agent",
    tool: "mcp_call",
    toolArgs: 'mcp("github", { action: "create_issue", repo: "acme/api" })',
    toolArgsStructured: {
      server: "github",
      method: "create_issue",
      params: {
        repo: "acme/api",
        title: "Security: Update openssl to 3.2.1",
        labels: ["security", "dependencies"],
      },
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "dev",
    contractId: "contract_research_v1",
    contractRule: "allow_github_issues",
    decisionContext:
      "GitHub issue creation allowed. Research agents can create issues tagged 'security' or 'dependencies'.",
    durationMs: 145,
    traceId: "trace_g3h4i5j6",
  },
  {
    id: "evt_010",
    timestamp: "2026-02-27T14:30:15Z",
    agent: "code-review-bot",
    tool: "file_read",
    toolArgs: 'read("/src/api/handlers/users.py")',
    toolArgsStructured: {
      path: "/src/api/handlers/users.py",
      encoding: "utf-8",
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "staging",
    contractId: "contract_review_v1",
    contractRule: "allow_source_read",
    decisionContext:
      "Source file read allowed. Path matches /src/** allowlist for review agents.",
    durationMs: 2,
    traceId: "trace_k7l8m9n0",
  },
  {
    id: "evt_011",
    timestamp: "2026-02-27T14:30:02Z",
    agent: "support-bot",
    tool: "http_request",
    toolArgs: 'fetch("https://api.internal/users/u_123", { method: "GET" })',
    toolArgsStructured: {
      url: "https://api.internal/users/u_123",
      method: "GET",
      headers: { "X-Service-Token": "svc_***" },
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_support_v2",
    contractRule: "allow_user_lookup",
    decisionContext:
      "GET on user API allowed. Support agents can read user profiles for ticket resolution.",
    durationMs: 89,
    traceId: "trace_o1p2q3r4",
  },
  {
    id: "evt_012",
    timestamp: "2026-02-27T14:29:50Z",
    agent: "deploy-bot",
    tool: "shell_exec",
    toolArgs: 'exec("docker push registry.acme.io/api:v2.4.1")',
    toolArgsStructured: {
      command: "docker push registry.acme.io/api:v2.4.1",
      working_dir: "/app",
      timeout_seconds: 300,
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_deploy_v3",
    contractRule: "allow_registry_push",
    decisionContext:
      "Docker push to approved registry allowed. Image tag v2.4.1 matches semver pattern.",
    durationMs: 12400,
    traceId: "trace_s5t6u7v8",
  },
  {
    id: "evt_013",
    timestamp: "2026-02-27T14:29:38Z",
    agent: "data-analyst",
    tool: "sql_query",
    toolArgs: 'query("SELECT date, COUNT(*) FROM orders GROUP BY date")',
    toolArgsStructured: {
      query: "SELECT date, COUNT(*) FROM orders GROUP BY date ORDER BY date DESC LIMIT 30",
      database: "analytics_prod",
      read_only: true,
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_analyst_v2",
    contractRule: "allow_aggregate_queries",
    decisionContext:
      "Aggregate query on non-PII table allowed. 'orders' table is classified as business data.",
    durationMs: 234,
    traceId: "trace_w9x0y1z2",
  },
  {
    id: "evt_014",
    timestamp: "2026-02-27T14:29:25Z",
    agent: "research-agent",
    tool: "file_write",
    toolArgs: 'write("/tmp/research/cve-report.md", "# CVE Analysis...")',
    toolArgsStructured: {
      path: "/tmp/research/cve-report.md",
      content: "# CVE-2026-1234 Analysis\n\n## Impact: HIGH\n...",
      mode: "create",
    },
    verdict: "allowed",
    mode: "observe",
    environment: "dev",
    contractId: "contract_research_v1",
    contractRule: "allow_tmp_writes",
    decisionContext:
      "File write to /tmp allowed in observe mode. Research output paths restricted to /tmp/research/**.",
    durationMs: 3,
    traceId: "trace_a3b4c5d6",
  },
  {
    id: "evt_015",
    timestamp: "2026-02-27T14:29:12Z",
    agent: "support-bot",
    tool: "http_request",
    toolArgs: 'fetch("https://api.internal/admin/config", { method: "PUT" })',
    toolArgsStructured: {
      url: "https://api.internal/admin/config",
      method: "PUT",
      headers: { "X-Service-Token": "svc_***" },
      body: { maintenance_mode: true },
    },
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contractId: "contract_support_v2",
    contractRule: "deny_admin_endpoints",
    decisionContext:
      "PUT to /admin/* blocked. Support agents cannot modify system configuration. Requires ops-level access.",
    durationMs: 1,
    traceId: "trace_e7f8g9h0",
  },
  {
    id: "evt_016",
    timestamp: "2026-02-27T14:29:00Z",
    agent: "code-review-bot",
    tool: "shell_exec",
    toolArgs: 'exec("git diff HEAD~1 --stat")',
    toolArgsStructured: {
      command: "git diff HEAD~1 --stat",
      working_dir: "/repo",
      timeout_seconds: 10,
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "staging",
    contractId: "contract_review_v1",
    contractRule: "allow_git_read_commands",
    decisionContext:
      "Git read-only command allowed. 'git diff' is in the safe-list for review agents.",
    durationMs: 45,
    traceId: "trace_i1j2k3l4",
  },
  {
    id: "evt_017",
    timestamp: "2026-02-27T14:28:48Z",
    agent: "deploy-bot",
    tool: "shell_exec",
    toolArgs: 'exec("curl -X DELETE https://api.acme.io/cache")',
    toolArgsStructured: {
      command: "curl -X DELETE https://api.acme.io/cache",
      working_dir: "/app",
      timeout_seconds: 15,
    },
    verdict: "pending",
    mode: "enforce",
    environment: "production",
    contractId: "contract_deploy_v3",
    contractRule: "require_approval_cache_purge",
    decisionContext:
      "Cache purge via DELETE requires human approval. Request queued in #ops-approvals.",
    durationMs: 0,
    traceId: "trace_m5n6o7p8",
  },
  {
    id: "evt_018",
    timestamp: "2026-02-27T14:28:35Z",
    agent: "data-analyst",
    tool: "mcp_call",
    toolArgs: 'mcp("snowflake", { query: "SELECT ... FROM raw.events" })',
    toolArgsStructured: {
      server: "snowflake",
      method: "execute_query",
      params: {
        query: "SELECT event_type, COUNT(*) as cnt FROM raw.events WHERE date > '2026-02-20' GROUP BY event_type ORDER BY cnt DESC LIMIT 50",
        warehouse: "ANALYTICS_WH",
      },
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_analyst_v2",
    contractRule: "allow_snowflake_read",
    decisionContext:
      "Snowflake read query allowed. Warehouse ANALYTICS_WH is in the permitted list. Query is aggregate-only.",
    durationMs: 1890,
    traceId: "trace_q9r0s1t2",
  },
  {
    id: "evt_019",
    timestamp: "2026-02-27T14:28:22Z",
    agent: "support-bot",
    tool: "http_request",
    toolArgs: 'fetch("https://hooks.slack.com/...", { method: "POST" })',
    toolArgsStructured: {
      url: "https://hooks.slack.com/services/T00/B00/xxx",
      method: "POST",
      body: {
        text: "Ticket #4521 escalated to engineering",
        channel: "#support-escalations",
      },
    },
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contractId: "contract_support_v2",
    contractRule: "allow_slack_notifications",
    decisionContext:
      "Slack webhook POST allowed. Channel #support-escalations is in the approved notification channels.",
    durationMs: 312,
    traceId: "trace_u3v4w5x6",
  },
  {
    id: "evt_020",
    timestamp: "2026-02-27T14:28:10Z",
    agent: "code-review-bot",
    tool: "file_read",
    toolArgs: 'read("/home/deploy/.ssh/id_rsa")',
    toolArgsStructured: {
      path: "/home/deploy/.ssh/id_rsa",
      encoding: "utf-8",
    },
    verdict: "denied",
    mode: "enforce",
    environment: "staging",
    contractId: "contract_review_v1",
    contractRule: "deny_secrets_files",
    decisionContext:
      "SSH private key access blocked. Path **.ssh/** matches secrets pattern. Review agents cannot read credential files.",
    durationMs: 1,
    traceId: "trace_y7z8a9b0",
  },
  {
    id: "evt_021",
    timestamp: "2026-02-27T14:27:58Z",
    agent: "research-agent",
    tool: "mcp_call",
    toolArgs: 'mcp("firecrawl", { url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1234" })',
    toolArgsStructured: {
      server: "firecrawl",
      method: "scrape",
      params: {
        url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1234",
        formats: ["markdown"],
      },
    },
    verdict: "allowed",
    mode: "observe",
    environment: "dev",
    contractId: "contract_research_v1",
    contractRule: "allow_web_scrape_gov",
    decisionContext:
      "Web scrape of .gov domain allowed. Research agents can access government vulnerability databases.",
    durationMs: 2340,
    traceId: "trace_c1d2e3f4",
  },
  {
    id: "evt_022",
    timestamp: "2026-02-27T14:27:45Z",
    agent: "deploy-bot",
    tool: "shell_exec",
    toolArgs: 'exec("rm -rf /")',
    toolArgsStructured: {
      command: "rm -rf /",
      working_dir: "/app",
      timeout_seconds: 30,
    },
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contractId: "contract_deploy_v3",
    contractRule: "deny_destructive_root",
    decisionContext:
      "Catastrophic command blocked. rm -rf on root path / is unconditionally denied. This is a hardcoded safety rule.",
    durationMs: 0,
    traceId: "trace_g5h6i7j8",
  },
]

// ── Histogram data ─────────────────────────────────────────────────────

const HISTOGRAM_DATA = [
  { time: "14:20", allowed: 8, denied: 1, pending: 0 },
  { time: "14:22", allowed: 5, denied: 3, pending: 1 },
  { time: "14:24", allowed: 12, denied: 2, pending: 0 },
  { time: "14:26", allowed: 6, denied: 4, pending: 1 },
  { time: "14:28", allowed: 7, denied: 2, pending: 1 },
  { time: "14:30", allowed: 9, denied: 3, pending: 0 },
  { time: "14:32", allowed: 4, denied: 1, pending: 1 },
]

// ── Facet definitions ──────────────────────────────────────────────────

interface FacetValue {
  label: string
  count: number
  key: string
}

interface Facet {
  name: string
  field: keyof Event
  values: FacetValue[]
}

function buildFacets(events: Event[]): Facet[] {
  const count = (field: keyof Event, value: string) =>
    events.filter((e) => e[field] === value).length

  return [
    {
      name: "Agent",
      field: "agent",
      values: [
        { label: "deploy-bot", key: "deploy-bot", count: count("agent", "deploy-bot") },
        { label: "data-analyst", key: "data-analyst", count: count("agent", "data-analyst") },
        { label: "code-review-bot", key: "code-review-bot", count: count("agent", "code-review-bot") },
        { label: "research-agent", key: "research-agent", count: count("agent", "research-agent") },
        { label: "support-bot", key: "support-bot", count: count("agent", "support-bot") },
      ],
    },
    {
      name: "Tool",
      field: "tool",
      values: [
        { label: "shell_exec", key: "shell_exec", count: count("tool", "shell_exec") },
        { label: "sql_query", key: "sql_query", count: count("tool", "sql_query") },
        { label: "file_read", key: "file_read", count: count("tool", "file_read") },
        { label: "file_write", key: "file_write", count: count("tool", "file_write") },
        { label: "http_request", key: "http_request", count: count("tool", "http_request") },
        { label: "mcp_call", key: "mcp_call", count: count("tool", "mcp_call") },
      ],
    },
    {
      name: "Verdict",
      field: "verdict",
      values: [
        { label: "allowed", key: "allowed", count: count("verdict", "allowed") },
        { label: "denied", key: "denied", count: count("verdict", "denied") },
        { label: "pending", key: "pending", count: count("verdict", "pending") },
      ],
    },
    {
      name: "Mode",
      field: "mode",
      values: [
        { label: "enforce", key: "enforce", count: count("mode", "enforce") },
        { label: "observe", key: "observe", count: count("mode", "observe") },
      ],
    },
    {
      name: "Environment",
      field: "environment",
      values: [
        { label: "production", key: "production", count: count("environment", "production") },
        { label: "staging", key: "staging", count: count("environment", "staging") },
        { label: "dev", key: "dev", count: count("environment", "dev") },
      ],
    },
  ]
}

// ── Helpers ─────────────────────────────────────────────────────────────

function verdictColor(v: Verdict) {
  switch (v) {
    case "allowed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "denied":
      return "bg-red-500/15 text-red-400 border-red-500/30"
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30"
  }
}

function verdictDot(v: Verdict) {
  switch (v) {
    case "allowed":
      return "bg-emerald-400"
    case "denied":
      return "bg-red-400"
    case "pending":
      return "bg-amber-400"
  }
}

function VerdictIcon({ verdict }: { verdict: Verdict }) {
  const cls = "h-3.5 w-3.5"
  switch (verdict) {
    case "allowed":
      return <ShieldCheck className={`${cls} text-emerald-400`} />
    case "denied":
      return <ShieldAlert className={`${cls} text-red-400`} />
    case "pending":
      return <ShieldQuestion className={`${cls} text-amber-400`} />
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

// ── Component ──────────────────────────────────────────────────────────

export default function EventsV1() {
  const [activeFilters, setActiveFilters] = useState<
    Record<string, Set<string>>
  >({})
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    "evt_002",
  )
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(
    new Set(),
  )
  const [jsonExpanded, setJsonExpanded] = useState(false)

  // Filter events
  const filteredEvents = useMemo(() => {
    return MOCK_EVENTS.filter((event) => {
      for (const [field, values] of Object.entries(activeFilters)) {
        if (values.size > 0 && !values.has(event[field as keyof Event] as string)) {
          return false
        }
      }
      return true
    })
  }, [activeFilters])

  const selectedEvent = MOCK_EVENTS.find((e) => e.id === selectedEventId)
  const facets = buildFacets(MOCK_EVENTS)

  const toggleFilter = (field: string, value: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      const current = new Set(next[field] || [])
      if (current.has(value)) {
        current.delete(value)
      } else {
        current.add(value)
      }
      next[field] = current
      return next
    })
  }

  const toggleFacetCollapse = (name: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const activeFilterCount = Object.values(activeFilters).reduce(
    (sum, set) => sum + set.size,
    0,
  )

  const clearAllFilters = () => setActiveFilters({})

  return (
    <div className="flex h-full">
      {/* ── Left Panel: Faceted Filters ──────────────────────────── */}
      <div className="w-[220px] shrink-0 border-r border-border bg-card/50">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </span>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear ({activeFilterCount})
            </Button>
          )}
        </div>

        <ScrollArea className="h-[calc(100%-41px)]">
          <div className="p-2">
            {facets.map((facet) => {
              const isCollapsed = collapsedFacets.has(facet.name)
              const activeSet = activeFilters[facet.field] || new Set()

              return (
                <div key={facet.name} className="mb-1">
                  <button
                    onClick={() => toggleFacetCollapse(facet.name)}
                    className="flex w-full items-center gap-1 rounded px-1.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                    {facet.name}
                  </button>

                  {!isCollapsed && (
                    <div className="ml-1 space-y-0.5 pb-2">
                      {facet.values
                        .filter((v) => v.count > 0)
                        .sort((a, b) => b.count - a.count)
                        .map((value) => {
                          const isActive = activeSet.has(value.key)
                          return (
                            <button
                              key={value.key}
                              onClick={() =>
                                toggleFilter(facet.field, value.key)
                              }
                              className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors ${
                                isActive
                                  ? "bg-primary/15 text-primary"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                {facet.field === "verdict" && (
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${verdictDot(value.key as Verdict)}`}
                                  />
                                )}
                                <span className="truncate">{value.label}</span>
                              </span>
                              <span
                                className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  isActive
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {value.count}
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Center Panel: Histogram + Event List ─────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder='Search events... (e.g. "rm -rf", agent:deploy-bot, tool:sql_query)'
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">
            {filteredEvents.length} events
          </span>
        </div>

        {/* Histogram */}
        <Card className="mx-3 mt-3 border-border bg-card/50 py-0 rounded-lg">
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Verdict Distribution
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
                  Allowed
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
                  Denied
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                  Pending
                </span>
              </div>
            </div>
          </div>
          <div className="h-[100px] px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={HISTOGRAM_DATA} barGap={1}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Bar
                  dataKey="allowed"
                  stackId="a"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="denied"
                  stackId="a"
                  fill="#ef4444"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="pending"
                  stackId="a"
                  fill="#f59e0b"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Event List */}
        <ScrollArea className="flex-1 px-3 pt-2">
          <div className="space-y-px pb-3">
            {filteredEvents.map((event) => {
              const isSelected = event.id === selectedEventId
              return (
                <button
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <VerdictIcon verdict={event.verdict} />

                  <span className="w-[72px] shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatTime(event.timestamp)}
                  </span>

                  <span className="w-[110px] shrink-0 truncate text-xs font-medium text-foreground">
                    {event.agent}
                  </span>

                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal"
                  >
                    {event.tool}
                  </Badge>

                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {event.toolArgs}
                  </span>

                  <Badge
                    variant="outline"
                    className={`h-5 shrink-0 rounded border px-1.5 text-[10px] font-medium ${verdictColor(event.verdict)}`}
                  >
                    {event.verdict}
                  </Badge>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right Panel: Event Detail ────────────────────────────── */}
      {selectedEvent ? (
        <div className="w-[340px] shrink-0 border-l border-border bg-card/50">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold text-foreground">
              Event Detail
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEventId(null)}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100%-41px)]">
            <div className="space-y-4 p-3">
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`rounded border px-2 py-0.5 text-xs font-medium ${verdictColor(selectedEvent.verdict)}`}
                  >
                    <VerdictIcon verdict={selectedEvent.verdict} />
                    <span className="ml-1 capitalize">
                      {selectedEvent.verdict}
                    </span>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded text-[10px] font-normal"
                  >
                    {selectedEvent.mode}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded text-[10px] font-normal"
                  >
                    {selectedEvent.environment}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(selectedEvent.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Agent & Tool */}
              <div className="space-y-1.5">
                <DetailRow label="Agent" value={selectedEvent.agent} />
                <DetailRow label="Tool" value={selectedEvent.tool} mono />
                <DetailRow label="Event ID" value={selectedEvent.id} mono />
                <DetailRow
                  label="Duration"
                  value={
                    selectedEvent.durationMs === 0
                      ? "< 1ms"
                      : `${selectedEvent.durationMs}ms`
                  }
                />
                <DetailRow
                  label="Trace ID"
                  value={selectedEvent.traceId}
                  mono
                />
              </div>

              {/* Tool Arguments — THE STAR */}
              <Card className="border-border bg-background/50 p-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">
                    Tool Arguments
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    <span className="text-[10px]">Copy</span>
                  </Button>
                </div>
                <div className="space-y-1.5 p-3">
                  {Object.entries(selectedEvent.toolArgsStructured).map(
                    ([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {key}:
                        </span>
                        <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
                {/* Raw invocation */}
                <div className="border-t border-border px-3 py-2">
                  <span className="block font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {selectedEvent.toolArgs}
                  </span>
                </div>
              </Card>

              {/* Decision Context */}
              <Card className="border-border bg-background/50 p-0">
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Decision Context
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <DetailRow
                    label="Contract"
                    value={selectedEvent.contractId}
                    mono
                  />
                  <DetailRow
                    label="Rule"
                    value={selectedEvent.contractRule}
                    mono
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {selectedEvent.decisionContext}
                  </p>
                </div>
              </Card>

              {/* Raw JSON */}
              <div>
                <button
                  onClick={() => setJsonExpanded(!jsonExpanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {jsonExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Raw JSON
                  <ExternalLink className="ml-1 h-3 w-3" />
                </button>
                {jsonExpanded && (
                  <pre className="mt-2 max-h-[300px] overflow-auto rounded-md bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(selectedEvent, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex w-[340px] shrink-0 items-center justify-center border-l border-border bg-card/50">
          <p className="text-sm text-muted-foreground">
            Select an event to view details
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
