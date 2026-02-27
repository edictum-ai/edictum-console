import { useState } from "react"
// Card/CardContent unused in this mockup variant
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  Gavel,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Upload,
  WifiOff,
  X,
  XCircle,
  Zap,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = "allowed" | "denied" | "pending" | "timeout"
type AlertKind = "pending_approval" | "agent_offline" | "denial_spike"

interface FloatingAlert {
  id: string
  kind: AlertKind
  title: string
  description: string
  agent: string
  tool?: string
  args?: string
  elapsed?: string
  ttl?: string
  timestamp: string
}

interface FeedItem {
  id: string
  type:
    | "tool_call"
    | "approval_resolved"
    | "contract_deployed"
    | "agent_connected"
    | "agent_disconnected"
    | "denial"
    | "approval_requested"
    | "bundle_uploaded"
  agent: string
  timestamp: string
  verdict?: Verdict
  tool?: string
  args?: string
  detail?: string
  version?: string
  user?: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const STATS = {
  pending: 3,
  agentsOnline: 8,
  agentsTotal: 10,
  events24h: 1_502,
  denials24h: 18,
}

const FLOATING_ALERTS: FloatingAlert[] = [
  {
    id: "fa-1",
    kind: "pending_approval",
    title: "Approval Needed",
    description: "send_email requested by research-agent",
    agent: "research-agent",
    tool: "send_email",
    args: '{"to": "ceo@acme.co", "subject": "Q4 Report", "body": "..."}',
    elapsed: "2m 14s",
    ttl: "4m 46s remaining",
    timestamp: "12s ago",
  },
  {
    id: "fa-2",
    kind: "pending_approval",
    title: "Approval Needed",
    description: "delete_records requested by cleanup-agent",
    agent: "cleanup-agent",
    tool: "delete_records",
    args: '{"table": "user_sessions", "where": "age > 90d", "count": 12480}',
    elapsed: "5m 02s",
    ttl: "1m 58s remaining",
    timestamp: "47s ago",
  },
  {
    id: "fa-3",
    kind: "agent_offline",
    title: "Agent Offline",
    description: "billing-agent lost connection",
    agent: "billing-agent",
    elapsed: "8m 31s",
    timestamp: "8m ago",
  },
]

const FEED_ITEMS: FeedItem[] = [
  { id: "f-01", type: "tool_call", agent: "research-agent", tool: "web_search", args: '{"query": "Q4 earnings ACME"}', verdict: "allowed", timestamp: "5s ago" },
  { id: "f-02", type: "approval_requested", agent: "research-agent", tool: "send_email", args: '{"to": "ceo@acme.co"}', verdict: "pending", timestamp: "12s ago" },
  { id: "f-03", type: "tool_call", agent: "ops-agent", tool: "read_file", args: '{"path": "/config/deploy.yml"}', verdict: "allowed", timestamp: "18s ago" },
  { id: "f-04", type: "denial", agent: "intern-agent", tool: "execute_sql", args: '{"query": "DROP TABLE users"}', verdict: "denied", timestamp: "34s ago" },
  { id: "f-05", type: "tool_call", agent: "data-agent", tool: "query_db", args: '{"sql": "SELECT count(*) FROM orders WHERE status=pending"}', verdict: "allowed", timestamp: "41s ago" },
  { id: "f-06", type: "approval_resolved", agent: "ops-agent", tool: "deploy_service", args: '{"service": "api-gateway", "version": "2.4.1"}', verdict: "allowed", detail: "Approved by admin@edictum.dev", user: "admin@edictum.dev", timestamp: "1m ago" },
  { id: "f-07", type: "contract_deployed", agent: "fleet", version: "v3.2.0", detail: "Updated production contracts", timestamp: "2m ago" },
  { id: "f-08", type: "tool_call", agent: "research-agent", tool: "web_search", args: '{"query": "competitor analysis 2026"}', verdict: "allowed", timestamp: "2m ago" },
  { id: "f-09", type: "agent_disconnected", agent: "billing-agent", detail: "Connection lost — timeout after 30s", timestamp: "8m ago" },
  { id: "f-10", type: "tool_call", agent: "support-agent", tool: "send_slack", args: '{"channel": "#support", "msg": "Ticket #4821 resolved"}', verdict: "allowed", timestamp: "9m ago" },
  { id: "f-11", type: "denial", agent: "intern-agent", tool: "write_file", args: '{"path": "/etc/passwd", "content": "..."}', verdict: "denied", timestamp: "11m ago" },
  { id: "f-12", type: "approval_resolved", agent: "cleanup-agent", tool: "purge_cache", args: '{"scope": "global"}', verdict: "denied", detail: "Denied by admin@edictum.dev", user: "admin@edictum.dev", timestamp: "14m ago" },
  { id: "f-13", type: "tool_call", agent: "data-agent", tool: "generate_report", args: '{"type": "weekly_summary"}', verdict: "allowed", timestamp: "15m ago" },
  { id: "f-14", type: "agent_connected", agent: "monitoring-agent", detail: "Reconnected after 45s downtime", timestamp: "18m ago" },
  { id: "f-15", type: "bundle_uploaded", agent: "fleet", version: "v3.2.0", detail: "12 contracts, 4 updated", user: "admin@edictum.dev", timestamp: "20m ago" },
  { id: "f-16", type: "tool_call", agent: "ops-agent", tool: "restart_service", args: '{"service": "worker-3"}', verdict: "allowed", timestamp: "22m ago" },
  { id: "f-17", type: "denial", agent: "research-agent", tool: "send_email", args: '{"to": "all@company.co", "subject": "URGENT"}', verdict: "denied", timestamp: "25m ago" },
  { id: "f-18", type: "tool_call", agent: "support-agent", tool: "lookup_user", args: '{"email": "jane@customer.io"}', verdict: "allowed", timestamp: "28m ago" },
  { id: "f-19", type: "approval_requested", agent: "cleanup-agent", tool: "delete_records", args: '{"table": "user_sessions"}', verdict: "pending", timestamp: "47s ago" },
  { id: "f-20", type: "tool_call", agent: "monitoring-agent", tool: "check_health", args: '{"targets": ["api","db","redis"]}', verdict: "allowed", timestamp: "30m ago" },
  { id: "f-21", type: "denial", agent: "intern-agent", tool: "shell_exec", args: '{"cmd": "rm -rf /tmp/*"}', verdict: "denied", timestamp: "35m ago" },
  { id: "f-22", type: "tool_call", agent: "data-agent", tool: "export_csv", args: '{"table": "orders", "limit": 10000}', verdict: "allowed", timestamp: "40m ago" },
]

// ---------------------------------------------------------------------------
// Verdict / type styling
// ---------------------------------------------------------------------------

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string; label: string }> = {
  allowed: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Allowed" },
  denied: { bg: "bg-red-500/15", text: "text-red-400", label: "Denied" },
  pending: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Pending" },
  timeout: { bg: "bg-zinc-500/15", text: "text-zinc-400", label: "Timeout" },
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLES[verdict]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {verdict === "allowed" && <CheckCircle className="h-3 w-3" />}
      {verdict === "denied" && <XCircle className="h-3 w-3" />}
      {verdict === "pending" && <Clock className="h-3 w-3" />}
      {verdict === "timeout" && <Timer className="h-3 w-3" />}
      {s.label}
    </span>
  )
}

function feedIcon(type: FeedItem["type"]) {
  switch (type) {
    case "tool_call":
      return <Zap className="h-4 w-4 text-blue-400" />
    case "approval_resolved":
      return <Gavel className="h-4 w-4 text-violet-400" />
    case "approval_requested":
      return <Shield className="h-4 w-4 text-amber-400" />
    case "contract_deployed":
      return <Upload className="h-4 w-4 text-emerald-400" />
    case "agent_connected":
      return <Bot className="h-4 w-4 text-emerald-400" />
    case "agent_disconnected":
      return <WifiOff className="h-4 w-4 text-red-400" />
    case "denial":
      return <ShieldAlert className="h-4 w-4 text-red-400" />
    case "bundle_uploaded":
      return <FileText className="h-4 w-4 text-sky-400" />
  }
}

function feedLabel(type: FeedItem["type"]) {
  switch (type) {
    case "tool_call":
      return "Tool Call"
    case "approval_resolved":
      return "Approval Resolved"
    case "approval_requested":
      return "Approval Requested"
    case "contract_deployed":
      return "Contract Deployed"
    case "agent_connected":
      return "Agent Connected"
    case "agent_disconnected":
      return "Agent Disconnected"
    case "denial":
      return "Denied"
    case "bundle_uploaded":
      return "Bundle Uploaded"
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatsBar() {
  const stats = [
    {
      label: "Pending Approvals",
      value: STATS.pending,
      icon: <Clock className="h-4 w-4 text-amber-400" />,
      accent: STATS.pending > 0 ? "text-amber-400" : "text-foreground",
    },
    {
      label: "Agents Online",
      value: `${STATS.agentsOnline}/${STATS.agentsTotal}`,
      icon: <Bot className="h-4 w-4 text-emerald-400" />,
      accent: "text-foreground",
    },
    {
      label: "Events (24h)",
      value: STATS.events24h.toLocaleString(),
      icon: <Activity className="h-4 w-4 text-blue-400" />,
      accent: "text-foreground",
    },
    {
      label: "Denials (24h)",
      value: STATS.denials24h,
      icon: <ShieldCheck className="h-4 w-4 text-red-400" />,
      accent: STATS.denials24h > 10 ? "text-red-400" : "text-foreground",
    },
  ]

  return (
    <div className="flex items-center gap-6 border-b border-border bg-card/50 px-6 py-3">
      <h1 className="text-sm font-semibold text-foreground">Dashboard</h1>
      <div className="mx-2 h-4 w-px bg-border" />
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-sm">
          {s.icon}
          <span className="text-muted-foreground">{s.label}</span>
          <span className={`font-semibold tabular-nums ${s.accent}`}>{s.value}</span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        Live
      </div>
    </div>
  )
}

function FloatingAlertCard({
  alert,
  onDismiss,
}: {
  alert: FloatingAlert
  onDismiss: (id: string) => void
}) {
  const isApproval = alert.kind === "pending_approval"
  const isOffline = alert.kind === "agent_offline"

  return (
    <div
      className={`
        group relative overflow-hidden rounded-lg border shadow-lg
        animate-in slide-in-from-right-5 fade-in duration-300
        ${isApproval ? "border-amber-500/30 bg-card" : ""}
        ${isOffline ? "border-red-500/30 bg-card" : ""}
      `}
    >
      {/* Urgency accent bar */}
      <div
        className={`absolute inset-y-0 left-0 w-1 ${
          isApproval ? "bg-amber-500" : "bg-red-500"
        }`}
      />

      <div className="flex items-start gap-3 p-3 pl-4">
        {/* Icon */}
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isApproval
              ? "bg-amber-500/15 text-amber-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {isApproval ? (
            <Shield className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {alert.title}
            </span>
            {alert.ttl && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Timer className="h-3 w-3" />
                {alert.ttl}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {alert.description}
          </p>

          {/* Tool arguments */}
          {alert.args && (
            <pre className="mt-1.5 max-w-full overflow-x-auto rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
              {alert.args}
            </pre>
          )}

          {/* Elapsed timer */}
          {alert.elapsed && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Waiting {alert.elapsed}
            </span>
          )}

          {/* Actions */}
          {isApproval && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700">
                <Check className="mr-1 h-3 w-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-red-500/30 text-xs text-red-400 hover:bg-red-500/10"
              >
                <X className="mr-1 h-3 w-3" />
                Deny
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">
                <Eye className="mr-1 h-3 w-3" />
                Details
              </Button>
            </div>
          )}
          {isOffline && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <RotateCcw className="mr-1 h-3 w-3" />
                Reconnect
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">
                View Logs
              </Button>
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(alert.id)}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group border-b border-border/50 transition-colors hover:bg-muted/30">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
          {feedIcon(item.type)}
        </div>

        {/* Type label */}
        <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground">
          {feedLabel(item.type)}
        </span>

        {/* Agent */}
        <Badge variant="outline" className="shrink-0 font-mono text-xs">
          {item.agent}
        </Badge>

        {/* Tool name (if present) */}
        {item.tool && (
          <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {item.tool}
          </code>
        )}

        {/* Args preview (truncated) */}
        {item.args && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {item.args}
          </span>
        )}

        {/* Detail text for non-tool events */}
        {!item.args && item.detail && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {item.detail}
          </span>
        )}

        {/* Version badge */}
        {item.version && !item.args && !item.detail && (
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {item.version}
          </span>
        )}

        {/* Spacer if nothing else fills flex */}
        {!item.args && !item.detail && !item.version && <div className="flex-1" />}

        {/* Verdict */}
        {item.verdict && <VerdictBadge verdict={item.verdict} />}

        {/* Timestamp */}
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {item.timestamp}
        </span>

        {/* Expand indicator */}
        <div className="w-5 shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/30 bg-muted/20 px-4 py-3 pl-14">
          <div className="space-y-2 text-sm">
            <div className="flex gap-8">
              <div>
                <span className="text-xs text-muted-foreground">Agent</span>
                <p className="font-mono text-sm text-foreground">{item.agent}</p>
              </div>
              {item.tool && (
                <div>
                  <span className="text-xs text-muted-foreground">Tool</span>
                  <p className="font-mono text-sm text-foreground">{item.tool}</p>
                </div>
              )}
              {item.verdict && (
                <div>
                  <span className="text-xs text-muted-foreground">Verdict</span>
                  <div className="mt-0.5">
                    <VerdictBadge verdict={item.verdict} />
                  </div>
                </div>
              )}
              {item.user && (
                <div>
                  <span className="text-xs text-muted-foreground">By</span>
                  <p className="text-sm text-foreground">{item.user}</p>
                </div>
              )}
            </div>
            {item.args && (
              <div>
                <span className="text-xs text-muted-foreground">Arguments</span>
                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 px-3 py-2 text-xs text-foreground">
                  {JSON.stringify(JSON.parse(item.args), null, 2)}
                </pre>
              </div>
            )}
            {item.detail && (
              <div>
                <span className="text-xs text-muted-foreground">Detail</span>
                <p className="text-sm text-foreground">{item.detail}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardV3() {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<string>("all")

  const visibleAlerts = FLOATING_ALERTS.filter((a) => !dismissedAlerts.has(a.id))
  const alertCount = visibleAlerts.length

  const filteredFeed =
    filterType === "all"
      ? FEED_ITEMS
      : FEED_ITEMS.filter((item) => {
          if (filterType === "denials") return item.verdict === "denied"
          if (filterType === "approvals")
            return item.type === "approval_requested" || item.type === "approval_resolved"
          if (filterType === "agents")
            return item.type === "agent_connected" || item.type === "agent_disconnected"
          if (filterType === "deployments")
            return item.type === "contract_deployed" || item.type === "bundle_uploaded"
          return true
        })

  const filters = [
    { key: "all", label: "All Events", count: FEED_ITEMS.length },
    { key: "denials", label: "Denials", count: FEED_ITEMS.filter((i) => i.verdict === "denied").length },
    { key: "approvals", label: "Approvals", count: FEED_ITEMS.filter((i) => i.type === "approval_requested" || i.type === "approval_resolved").length },
    { key: "agents", label: "Agents", count: FEED_ITEMS.filter((i) => i.type === "agent_connected" || i.type === "agent_disconnected").length },
    { key: "deployments", label: "Deployments", count: FEED_ITEMS.filter((i) => i.type === "contract_deployed" || i.type === "bundle_uploaded").length },
  ]

  return (
    <div className="relative flex h-full flex-col">
      {/* Compact stats header */}
      <StatsBar />

      {/* Floating alerts — stack in top-right */}
      {alertCount > 0 && (
        <div className="absolute right-4 top-16 z-30 flex w-96 flex-col gap-2">
          {/* Alert count indicator */}
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">
              {alertCount} alert{alertCount !== 1 ? "s" : ""} requiring attention
            </span>
            <button
              onClick={() =>
                setDismissedAlerts(
                  new Set([...dismissedAlerts, ...visibleAlerts.map((a) => a.id)])
                )
              }
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss all
            </button>
          </div>
          {visibleAlerts.map((alert) => (
            <FloatingAlertCard
              key={alert.id}
              alert={alert}
              onDismiss={(id) =>
                setDismissedAlerts(new Set([...dismissedAlerts, id]))
              }
            />
          ))}
        </div>
      )}

      {/* Feed area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-1 border-b border-border bg-card/30 px-4 py-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterType === f.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`tabular-nums ${
                  filterType === f.key ? "text-primary/70" : "text-muted-foreground/60"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Feed list */}
        <ScrollArea className="flex-1">
          <div>
            {filteredFeed.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </div>

          {/* Load more indicator */}
          <div className="flex items-center justify-center gap-2 border-t border-border/50 py-4 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            Streaming live events...
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
