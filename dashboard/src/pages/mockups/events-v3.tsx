import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Filter,
  ArrowUp,
  X,
  Search,
  Pause,
  Play,
  BarChart3,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Event {
  id: string
  timestamp: string
  agent: string
  tool: string
  tool_args: Record<string, unknown>
  verdict: "allowed" | "denied" | "escalated"
  mode: "enforce" | "monitor" | "dry-run"
  env: string
  contract: string
  latency_ms: number
  decision_reason?: string
  raw_payload?: Record<string, unknown>
}

const MOCK_EVENTS: Event[] = [
  {
    id: "evt_01",
    timestamp: "14:32:07.841",
    agent: "order-bot",
    tool: "refund_order",
    tool_args: { order_id: "ORD-9182", amount: 249.99, reason: "damaged_item", customer_id: "C-4821" },
    verdict: "denied",
    mode: "enforce",
    env: "production",
    contract: "refund-limits-v3",
    latency_ms: 2,
    decision_reason: "Amount $249.99 exceeds $200 auto-refund limit. Requires manager approval per refund-limits-v3 clause 2.1.",
    raw_payload: {
      event_type: "tool_call",
      agent_id: "order-bot",
      session_id: "sess_8a2f",
      tool_name: "refund_order",
      tool_args: { order_id: "ORD-9182", amount: 249.99, reason: "damaged_item", customer_id: "C-4821" },
      contract_id: "refund-limits-v3",
      contract_version: 3,
      evaluation: { verdict: "denied", clauses_checked: 4, clause_failed: "2.1", reason: "amount_exceeds_limit" },
      metadata: { region: "us-east-1", deployment: "prod-v2.4.1" },
    },
  },
  {
    id: "evt_02",
    timestamp: "14:32:06.220",
    agent: "support-agent",
    tool: "send_email",
    tool_args: { to: "user@example.com", subject: "Ticket #4812 resolved", template: "resolution_v2" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "comms-policy-v1",
    latency_ms: 1,
  },
  {
    id: "evt_03",
    timestamp: "14:32:05.918",
    agent: "data-pipeline",
    tool: "delete_records",
    tool_args: { table: "user_sessions", where: "created_at < '2025-01-01'", limit: 50000 },
    verdict: "denied",
    mode: "enforce",
    env: "production",
    contract: "data-retention-v2",
    latency_ms: 3,
    decision_reason: "Bulk delete of 50,000 records requires HITL approval.",
  },
  {
    id: "evt_04",
    timestamp: "14:32:05.112",
    agent: "order-bot",
    tool: "apply_discount",
    tool_args: { order_id: "ORD-9180", percent: 15, code: "SUMMER15" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "discount-rules-v1",
    latency_ms: 1,
  },
  {
    id: "evt_05",
    timestamp: "14:32:04.667",
    agent: "research-bot",
    tool: "web_search",
    tool_args: { query: "competitor pricing Q1 2026", max_results: 10 },
    verdict: "allowed",
    mode: "monitor",
    env: "staging",
    contract: "search-policy-v1",
    latency_ms: 1,
  },
  {
    id: "evt_06",
    timestamp: "14:32:03.891",
    agent: "deploy-agent",
    tool: "kubectl_apply",
    tool_args: { manifest: "deployment.yaml", namespace: "prod", cluster: "us-east-1" },
    verdict: "escalated",
    mode: "enforce",
    env: "production",
    contract: "deploy-gates-v2",
    latency_ms: 2,
    decision_reason: "Production deployment requires approval from on-call engineer.",
  },
  {
    id: "evt_07",
    timestamp: "14:32:03.440",
    agent: "support-agent",
    tool: "lookup_customer",
    tool_args: { email: "jane.doe@company.com" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "pii-access-v1",
    latency_ms: 1,
  },
  {
    id: "evt_08",
    timestamp: "14:32:02.112",
    agent: "data-pipeline",
    tool: "export_csv",
    tool_args: { dataset: "monthly_revenue", format: "csv", rows: 12400 },
    verdict: "allowed",
    mode: "monitor",
    env: "staging",
    contract: "export-policy-v1",
    latency_ms: 2,
  },
  {
    id: "evt_09",
    timestamp: "14:32:01.556",
    agent: "order-bot",
    tool: "cancel_order",
    tool_args: { order_id: "ORD-9178", reason: "customer_request" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "cancellation-v2",
    latency_ms: 1,
  },
  {
    id: "evt_10",
    timestamp: "14:32:00.210",
    agent: "research-bot",
    tool: "scrape_page",
    tool_args: { url: "https://competitor.com/pricing", selector: ".plan-card" },
    verdict: "denied",
    mode: "enforce",
    env: "production",
    contract: "scraping-rules-v1",
    latency_ms: 2,
    decision_reason: "Domain competitor.com is on the restricted scraping list.",
  },
  {
    id: "evt_11",
    timestamp: "14:31:59.801",
    agent: "support-agent",
    tool: "create_ticket",
    tool_args: { title: "Billing discrepancy", priority: "high", assignee: "billing-team" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "ticket-policy-v1",
    latency_ms: 1,
  },
  {
    id: "evt_12",
    timestamp: "14:31:58.443",
    agent: "deploy-agent",
    tool: "rollback_deploy",
    tool_args: { deployment: "api-server", revision: "v2.3.9", namespace: "prod" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "deploy-gates-v2",
    latency_ms: 1,
  },
  {
    id: "evt_13",
    timestamp: "14:31:57.110",
    agent: "order-bot",
    tool: "refund_order",
    tool_args: { order_id: "ORD-9175", amount: 42.50, reason: "wrong_item" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "refund-limits-v3",
    latency_ms: 1,
  },
  {
    id: "evt_14",
    timestamp: "14:31:56.882",
    agent: "data-pipeline",
    tool: "run_query",
    tool_args: { sql: "SELECT COUNT(*) FROM orders WHERE status='pending'", db: "analytics" },
    verdict: "allowed",
    mode: "monitor",
    env: "staging",
    contract: "query-policy-v1",
    latency_ms: 1,
  },
  {
    id: "evt_15",
    timestamp: "14:31:55.204",
    agent: "research-bot",
    tool: "generate_report",
    tool_args: { type: "market_analysis", period: "Q4-2025", format: "pdf" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "reporting-v1",
    latency_ms: 2,
  },
  {
    id: "evt_16",
    timestamp: "14:31:54.610",
    agent: "support-agent",
    tool: "escalate_ticket",
    tool_args: { ticket_id: "TK-2918", level: "L3", reason: "repeated_issue" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "escalation-v1",
    latency_ms: 1,
  },
  {
    id: "evt_17",
    timestamp: "14:31:53.001",
    agent: "deploy-agent",
    tool: "scale_replicas",
    tool_args: { deployment: "worker-pool", replicas: 20, namespace: "prod" },
    verdict: "escalated",
    mode: "enforce",
    env: "production",
    contract: "scaling-policy-v1",
    latency_ms: 2,
    decision_reason: "Scaling above 10 replicas requires capacity review.",
  },
  {
    id: "evt_18",
    timestamp: "14:31:52.440",
    agent: "order-bot",
    tool: "update_shipping",
    tool_args: { order_id: "ORD-9172", carrier: "fedex", priority: "overnight" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "shipping-v1",
    latency_ms: 1,
  },
  {
    id: "evt_19",
    timestamp: "14:31:51.112",
    agent: "data-pipeline",
    tool: "drop_table",
    tool_args: { table: "tmp_migration_2025", database: "analytics" },
    verdict: "denied",
    mode: "enforce",
    env: "production",
    contract: "schema-protection-v1",
    latency_ms: 2,
    decision_reason: "DROP TABLE operations are blocked in production. Use staging.",
  },
  {
    id: "evt_20",
    timestamp: "14:31:50.880",
    agent: "research-bot",
    tool: "summarize_doc",
    tool_args: { doc_id: "DOC-8812", max_tokens: 500 },
    verdict: "allowed",
    mode: "monitor",
    env: "staging",
    contract: "summarization-v1",
    latency_ms: 1,
  },
  {
    id: "evt_21",
    timestamp: "14:31:49.220",
    agent: "support-agent",
    tool: "close_ticket",
    tool_args: { ticket_id: "TK-2910", resolution: "resolved", satisfaction: "positive" },
    verdict: "allowed",
    mode: "enforce",
    env: "production",
    contract: "ticket-policy-v1",
    latency_ms: 1,
  },
  {
    id: "evt_22",
    timestamp: "14:31:48.001",
    agent: "deploy-agent",
    tool: "run_migration",
    tool_args: { migration: "20260227_add_index", database: "primary", direction: "up" },
    verdict: "escalated",
    mode: "enforce",
    env: "production",
    contract: "migration-gates-v1",
    latency_ms: 3,
    decision_reason: "Database migration in production requires DBA approval.",
  },
]

interface HistogramBucket {
  label: string
  allowed: number
  denied: number
  escalated: number
}

const HISTOGRAM_DATA: HistogramBucket[] = [
  { label: "14:20", allowed: 18, denied: 2, escalated: 1 },
  { label: "14:21", allowed: 22, denied: 4, escalated: 0 },
  { label: "14:22", allowed: 15, denied: 1, escalated: 2 },
  { label: "14:23", allowed: 30, denied: 6, escalated: 1 },
  { label: "14:24", allowed: 25, denied: 3, escalated: 3 },
  { label: "14:25", allowed: 12, denied: 0, escalated: 0 },
  { label: "14:26", allowed: 28, denied: 5, escalated: 2 },
  { label: "14:27", allowed: 35, denied: 8, escalated: 1 },
  { label: "14:28", allowed: 20, denied: 2, escalated: 0 },
  { label: "14:29", allowed: 27, denied: 4, escalated: 2 },
  { label: "14:30", allowed: 32, denied: 7, escalated: 3 },
  { label: "14:31", allowed: 24, denied: 5, escalated: 4 },
]

// ---------------------------------------------------------------------------
// Verdict colors
// ---------------------------------------------------------------------------

function verdictBadge(verdict: Event["verdict"]) {
  switch (verdict) {
    case "allowed":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">allowed</Badge>
    case "denied":
      return <Badge className="bg-red-500/15 text-red-400 border-red-500/25">denied</Badge>
    case "escalated":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25">escalated</Badge>
  }
}

function modeBadge(mode: Event["mode"]) {
  switch (mode) {
    case "enforce":
      return <Badge variant="outline" className="text-foreground/70">enforce</Badge>
    case "monitor":
      return <Badge variant="outline" className="text-blue-400 border-blue-500/30">monitor</Badge>
    case "dry-run":
      return <Badge variant="outline" className="text-purple-400 border-purple-500/30">dry-run</Badge>
  }
}

function envBadge(env: string) {
  if (env === "production") {
    return <Badge variant="outline" className="text-orange-400 border-orange-500/30 text-[11px]">prod</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground text-[11px]">{env}</Badge>
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

function Histogram({ data, visible }: { data: HistogramBucket[]; visible: boolean }) {
  if (!visible) return null

  const maxTotal = Math.max(...data.map((b) => b.allowed + b.denied + b.escalated))

  return (
    <Card className="py-3 gap-3">
      <CardContent className="px-4">
        <div className="flex items-end gap-1.5 h-20">
          {data.map((bucket) => {
            const total = bucket.allowed + bucket.denied + bucket.escalated
            const heightPct = (total / maxTotal) * 100
            const allowedPct = total > 0 ? (bucket.allowed / total) * 100 : 0
            const deniedPct = total > 0 ? (bucket.denied / total) * 100 : 0
            const escalatedPct = total > 0 ? (bucket.escalated / total) * 100 : 0

            return (
              <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm overflow-hidden flex flex-col-reverse"
                  style={{ height: `${heightPct}%`, minHeight: 4 }}
                >
                  <div
                    className="bg-emerald-500/70"
                    style={{ height: `${allowedPct}%` }}
                  />
                  <div
                    className="bg-red-500/70"
                    style={{ height: `${deniedPct}%` }}
                  />
                  <div
                    className="bg-amber-500/70"
                    style={{ height: `${escalatedPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{bucket.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/70" /> allowed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500/70" /> denied
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/70" /> escalated
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Filter Drawer
// ---------------------------------------------------------------------------

function FilterDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="border border-border rounded-lg bg-card p-4 mb-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">Filters</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Verdict</label>
          <div className="flex flex-wrap gap-1">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 cursor-pointer">allowed</Badge>
            <Badge className="bg-red-500/15 text-red-400 border-red-500/25 cursor-pointer ring-2 ring-red-500/40">denied</Badge>
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 cursor-pointer">escalated</Badge>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Agent</label>
          <div className="flex flex-wrap gap-1">
            {["order-bot", "support-agent", "data-pipeline", "deploy-agent"].map((a) => (
              <Badge key={a} variant="outline" className="cursor-pointer text-[11px]">
                {a}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Environment</label>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="cursor-pointer text-orange-400 border-orange-500/30 text-[11px] ring-2 ring-orange-500/30">prod</Badge>
            <Badge variant="outline" className="cursor-pointer text-muted-foreground text-[11px]">staging</Badge>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Search</label>
          <div className="flex items-center gap-1 border border-border rounded-md px-2 py-1 bg-background">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="tool, agent, args..."
              className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expanded Row Detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ event }: { event: Event }) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={7} className="p-0">
        <div className="px-4 py-3 space-y-3 border-l-2 border-primary/50 ml-2">
          {/* Tool Arguments — THE most important data */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool Arguments</span>
            <pre className="mt-1 text-sm font-mono bg-background/60 rounded-md p-3 text-foreground overflow-x-auto border border-border/50">
              {JSON.stringify(event.tool_args, null, 2)}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Decision Context */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Decision</span>
              <div className="mt-1 text-sm text-foreground/90 bg-background/60 rounded-md p-3 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  {verdictBadge(event.verdict)}
                  <span className="text-xs text-muted-foreground">via {event.contract}</span>
                </div>
                {event.decision_reason && (
                  <p className="text-xs text-muted-foreground mt-1">{event.decision_reason}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Latency: {event.latency_ms}ms</p>
              </div>
            </div>

            {/* Metadata */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metadata</span>
              <div className="mt-1 text-sm bg-background/60 rounded-md p-3 border border-border/50 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Event ID</span>
                  <span className="font-mono text-foreground/80">{event.id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="text-foreground/80">{event.agent}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="text-foreground/80">{event.mode}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Environment</span>
                  <span className="text-foreground/80">{event.env}</span>
                </div>
              </div>
            </div>

            {/* Raw Payload */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Raw Payload</span>
              {event.raw_payload ? (
                <pre className="mt-1 text-[11px] font-mono bg-background/60 rounded-md p-3 text-foreground/70 overflow-x-auto border border-border/50 max-h-40 overflow-y-auto">
                  {JSON.stringify(event.raw_payload, null, 2)}
                </pre>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground bg-background/60 rounded-md p-3 border border-border/50">
                  No raw payload captured
                </div>
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Format tool args for the condensed row
// ---------------------------------------------------------------------------

function formatToolArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(args)) {
    const v = typeof val === "string" ? val : JSON.stringify(val)
    parts.push(`${key}=${v}`)
  }
  const joined = parts.join(", ")
  return joined.length > 80 ? joined.slice(0, 77) + "..." : joined
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EventsV3() {
  const [histogramVisible, setHistogramVisible] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>("evt_01")
  const [streaming, setStreaming] = useState(true)
  const [newEventsCount] = useState(5)

  const totalEvents = 1_847
  const eventsPerSecond = 4.2

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Events Feed
          </h1>
          <span className="text-xs text-muted-foreground">
            {totalEvents.toLocaleString()} events
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            {eventsPerSecond} evt/s
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {newEventsCount > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-primary border-primary/30">
              <ArrowUp className="h-3 w-3" />
              Show {newEventsCount} New Events
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setStreaming(!streaming)}
            title={streaming ? "Pause live stream" : "Resume live stream"}
          >
            {streaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant={histogramVisible ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setHistogramVisible(!histogramVisible)}
            title="Toggle histogram"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={filterOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setFilterOpen(!filterOpen)}
            title="Toggle filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Histogram (collapsible) ── */}
      <div className="px-4 pt-2 shrink-0">
        <Histogram data={HISTOGRAM_DATA} visible={histogramVisible} />
      </div>

      {/* ── Filter Drawer (collapsible) ── */}
      <div className="px-4 shrink-0">
        <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} />
      </div>

      {/* ── Full-Width Event Table ── */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead className="w-28">Timestamp</TableHead>
              <TableHead className="w-32">Agent</TableHead>
              <TableHead>Tool + Args</TableHead>
              <TableHead className="w-24">Verdict</TableHead>
              <TableHead className="w-20">Mode</TableHead>
              <TableHead className="w-16">Env</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_EVENTS.map((event) => {
              const isExpanded = expandedId === event.id
              return (
                <>
                  <TableRow
                    key={event.id}
                    className={`cursor-pointer ${isExpanded ? "bg-muted/40 hover:bg-muted/40 border-b-0" : ""} ${
                      event.verdict === "denied"
                        ? "border-l-2 border-l-red-500/50"
                        : event.verdict === "escalated"
                          ? "border-l-2 border-l-amber-500/50"
                          : ""
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  >
                    <TableCell className="w-8 pr-0">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.timestamp}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {event.agent}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-primary font-medium">{event.tool}</span>
                      <span className="text-muted-foreground ml-1.5">
                        {formatToolArgs(event.tool_args)}
                      </span>
                    </TableCell>
                    <TableCell>{verdictBadge(event.verdict)}</TableCell>
                    <TableCell>{modeBadge(event.mode)}</TableCell>
                    <TableCell>{envBadge(event.env)}</TableCell>
                  </TableRow>
                  {isExpanded && <ExpandedDetail key={`${event.id}-detail`} event={event} />}
                </>
              )
            })}
          </TableBody>
        </Table>

        {/* ── Load More ── */}
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" className="text-xs text-muted-foreground">
            <ChevronDown className="h-3 w-3 mr-1" />
            Load older events
          </Button>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card/50 text-[11px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>Showing 22 of {totalEvents.toLocaleString()}</span>
          <span>Time range: 14:20 — 14:32</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <ChevronUp className="h-3 w-3 text-emerald-400" />
            {HISTOGRAM_DATA.reduce((s, b) => s + b.allowed, 0)} allowed
          </span>
          <span className="flex items-center gap-1">
            <X className="h-3 w-3 text-red-400" />
            {HISTOGRAM_DATA.reduce((s, b) => s + b.denied, 0)} denied
          </span>
          <span>{streaming ? "Streaming" : "Paused"}</span>
        </div>
      </div>
    </div>
  )
}
