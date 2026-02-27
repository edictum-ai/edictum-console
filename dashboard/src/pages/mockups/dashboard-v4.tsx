import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  Signal,
  SignalZero,
  Timer,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentStatus = "healthy" | "degraded" | "offline"

type Verdict = "allowed" | "denied" | "pending" | "timeout"

interface ToolCall {
  tool: string
  args: string
  verdict: Verdict
  timestamp: string
}

interface PendingApproval {
  id: string
  tool: string
  args: string
  requestedAt: string
  agentName: string
}

interface Agent {
  id: string
  name: string
  env: "prod" | "staging" | "dev"
  status: AgentStatus
  contractVersion: string
  lastActivity: string
  eventCounts: number[]
  recentCalls: ToolCall[]
  pendingApproval?: PendingApproval
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const AGENTS: Agent[] = [
  {
    id: "a1",
    name: "bot-prod-1",
    env: "prod",
    status: "healthy",
    contractVersion: "v2.4.0",
    lastActivity: "12s ago",
    eventCounts: [3, 5, 2, 8, 6, 4, 7, 5, 9, 6, 4, 3],
    recentCalls: [
      { tool: "send_email", args: '{"to":"user@acme.co","subject":"Weekly Report"}', verdict: "allowed", timestamp: "12s ago" },
      { tool: "read_db", args: '{"table":"invoices","limit":50}', verdict: "allowed", timestamp: "45s ago" },
      { tool: "write_file", args: '{"path":"/tmp/report.csv"}', verdict: "allowed", timestamp: "2m ago" },
    ],
  },
  {
    id: "a2",
    name: "finance-agent",
    env: "prod",
    status: "healthy",
    contractVersion: "v2.4.0",
    lastActivity: "34s ago",
    eventCounts: [2, 4, 3, 5, 4, 6, 5, 3, 4, 5, 6, 4],
    recentCalls: [
      { tool: "query_ledger", args: '{"account":"receivables","period":"Q4"}', verdict: "allowed", timestamp: "34s ago" },
      { tool: "send_slack", args: '{"channel":"#finance","msg":"Q4 close"}', verdict: "allowed", timestamp: "1m ago" },
    ],
    pendingApproval: {
      id: "apr-1",
      tool: "wire_transfer",
      args: '{"amount":15000,"to":"vendor-8821"}',
      requestedAt: "2m ago",
      agentName: "finance-agent",
    },
  },
  {
    id: "a3",
    name: "data-pipeline-3",
    env: "prod",
    status: "healthy",
    contractVersion: "v2.3.1",
    lastActivity: "1m ago",
    eventCounts: [8, 12, 10, 14, 11, 9, 13, 15, 12, 10, 8, 11],
    recentCalls: [
      { tool: "run_query", args: '{"sql":"SELECT COUNT(*) FROM events"}', verdict: "allowed", timestamp: "1m ago" },
      { tool: "write_s3", args: '{"bucket":"analytics","key":"daily.parquet"}', verdict: "allowed", timestamp: "3m ago" },
      { tool: "notify_team", args: '{"channel":"data-ops"}', verdict: "allowed", timestamp: "5m ago" },
    ],
  },
  {
    id: "a4",
    name: "support-bot",
    env: "staging",
    status: "healthy",
    contractVersion: "v2.4.0",
    lastActivity: "2m ago",
    eventCounts: [1, 3, 2, 4, 3, 2, 5, 3, 2, 4, 3, 2],
    recentCalls: [
      { tool: "search_kb", args: '{"query":"password reset flow"}', verdict: "allowed", timestamp: "2m ago" },
      { tool: "send_reply", args: '{"ticket":"T-4021","draft":true}', verdict: "allowed", timestamp: "4m ago" },
    ],
  },
  {
    id: "a5",
    name: "monitor-agent",
    env: "prod",
    status: "healthy",
    contractVersion: "v2.4.0",
    lastActivity: "5s ago",
    eventCounts: [6, 5, 7, 6, 8, 7, 5, 6, 7, 8, 6, 7],
    recentCalls: [
      { tool: "check_health", args: '{"service":"api-gateway"}', verdict: "allowed", timestamp: "5s ago" },
      { tool: "check_health", args: '{"service":"postgres"}', verdict: "allowed", timestamp: "15s ago" },
      { tool: "check_health", args: '{"service":"redis"}', verdict: "allowed", timestamp: "25s ago" },
    ],
  },
  {
    id: "a6",
    name: "risk-assessor",
    env: "prod",
    status: "degraded",
    contractVersion: "v2.3.1",
    lastActivity: "18s ago",
    eventCounts: [4, 2, 6, 1, 5, 2, 7, 1, 4, 2, 6, 3],
    recentCalls: [
      { tool: "evaluate_trade", args: '{"sym":"AAPL","qty":500,"side":"buy"}', verdict: "denied", timestamp: "18s ago" },
      { tool: "evaluate_trade", args: '{"sym":"TSLA","qty":200,"side":"sell"}', verdict: "denied", timestamp: "32s ago" },
      { tool: "read_portfolio", args: '{"account":"main"}', verdict: "allowed", timestamp: "1m ago" },
      { tool: "evaluate_trade", args: '{"sym":"MSFT","qty":100,"side":"buy"}', verdict: "denied", timestamp: "2m ago" },
    ],
    pendingApproval: {
      id: "apr-2",
      tool: "override_risk_limit",
      args: '{"limit":"50k","reason":"market correction"}',
      requestedAt: "45s ago",
      agentName: "risk-assessor",
    },
  },
  {
    id: "a7",
    name: "email-drafter",
    env: "dev",
    status: "offline",
    contractVersion: "v2.2.0",
    lastActivity: "47m ago",
    eventCounts: [2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    recentCalls: [
      { tool: "draft_email", args: '{"template":"onboarding","to":"new-hire"}', verdict: "allowed", timestamp: "47m ago" },
    ],
  },
  {
    id: "a8",
    name: "deploy-bot",
    env: "staging",
    status: "offline",
    contractVersion: "v2.3.1",
    lastActivity: "2h ago",
    eventCounts: [5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0],
    recentCalls: [
      { tool: "run_deploy", args: '{"service":"api","env":"staging","tag":"v1.8.3"}', verdict: "timeout", timestamp: "2h ago" },
      { tool: "check_ci", args: '{"branch":"release/1.8.3"}', verdict: "allowed", timestamp: "2h ago" },
    ],
  },
]

const SUMMARY = {
  total: AGENTS.length,
  healthy: AGENTS.filter((a) => a.status === "healthy").length,
  degraded: AGENTS.filter((a) => a.status === "degraded").length,
  offline: AGENTS.filter((a) => a.status === "offline").length,
  pendingApprovals: AGENTS.filter((a) => a.pendingApproval).length,
  totalEvents: AGENTS.reduce(
    (sum, a) => sum + a.eventCounts.reduce((s, n) => s + n, 0),
    0,
  ),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; dotClass: string; ringClass: string; icon: typeof Wifi }
> = {
  healthy: {
    label: "Healthy",
    dotClass: "bg-emerald-500",
    ringClass: "",
    icon: Signal,
  },
  degraded: {
    label: "Degraded",
    dotClass: "bg-amber-500",
    ringClass: "ring-2 ring-amber-500/30",
    icon: AlertTriangle,
  },
  offline: {
    label: "Offline",
    dotClass: "bg-zinc-500",
    ringClass: "ring-2 ring-zinc-500/20",
    icon: WifiOff,
  },
}

const ENV_COLORS: Record<string, string> = {
  prod: "bg-red-500/15 text-red-400 dark:text-red-400",
  staging: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  dev: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
}

const VERDICT_STYLES: Record<Verdict, { label: string; className: string }> = {
  allowed: {
    label: "Allowed",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  denied: {
    label: "Denied",
    className: "bg-red-500/15 text-red-500 dark:text-red-400",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  timeout: {
    label: "Timeout",
    className: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400",
  },
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLES[verdict]
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${style.className}`}
    >
      {style.label}
    </span>
  )
}

function StatusDot({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === "healthy" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dotClass} opacity-40`}
        />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dotClass}`}
      />
    </span>
  )
}

function MiniSparkline({ data, status }: { data: number[]; status: AgentStatus }) {
  const color =
    status === "healthy"
      ? "#10b981"
      : status === "degraded"
        ? "#f59e0b"
        : "#71717a"

  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <ResponsiveContainer width="100%" height={28}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${status})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function SummaryBar() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      <Card className="py-4">
        <CardContent className="flex items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{SUMMARY.total}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Total Agents</p>
          </div>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-emerald-500">
              {SUMMARY.healthy}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Healthy</p>
          </div>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold leading-none text-amber-500">
                {SUMMARY.degraded}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Degraded</p>
          </div>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-500/10">
            <SignalZero className="h-4.5 w-4.5 text-zinc-500" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-zinc-500">
              {SUMMARY.offline}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Offline</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 py-4 sm:col-span-2 lg:col-span-1">
        <CardContent className="flex items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-amber-500">
              {SUMMARY.pendingApprovals}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pending Approvals
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({ agent }: { agent: Agent }) {
  const statusCfg = STATUS_CONFIG[agent.status]
  const StatusIcon = statusCfg.icon
  const hasPending = !!agent.pendingApproval
  const isDegraded = agent.status === "degraded"
  const isOffline = agent.status === "offline"

  const borderClass = hasPending
    ? "border-amber-500/40 shadow-amber-500/5"
    : isDegraded
      ? "border-amber-500/30"
      : isOffline
        ? "border-border/50 opacity-75"
        : "border-border"

  return (
    <Card className={`relative gap-0 overflow-hidden py-0 transition-all hover:shadow-md ${borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot status={agent.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 ${ENV_COLORS[agent.env]}`}
              >
                {agent.env}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                {agent.contractVersion}
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {agent.lastActivity}
              </span>
            </div>
          </div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
                <StatusIcon className={`h-3.5 w-3.5 ${
                  agent.status === "healthy"
                    ? "text-emerald-500"
                    : agent.status === "degraded"
                      ? "text-amber-500"
                      : "text-zinc-500"
                }`} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{statusCfg.label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Sparkline */}
      <div className="px-4 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Events (last hour)
          </span>
          <span className="text-[10px] text-muted-foreground">
            {agent.eventCounts.reduce((a, b) => a + b, 0)} total
          </span>
        </div>
        <MiniSparkline data={agent.eventCounts} status={agent.status} />
      </div>

      {/* Recent Tool Calls */}
      <div className="border-t border-border/50 px-4 py-2.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent Calls
        </p>
        <div className="space-y-1.5">
          {agent.recentCalls.slice(0, 3).map((call, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-[11px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-medium text-foreground">
                    {call.tool}
                  </code>
                  <VerdictBadge verdict={call.verdict} />
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {call.args}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {call.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Approval Banner */}
      {hasPending && agent.pendingApproval && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Awaiting Approval
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {agent.pendingApproval.requestedAt}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                <code className="font-mono font-medium">
                  {agent.pendingApproval.tool}
                </code>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {agent.pendingApproval.args}
                </span>
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-1.5">
              <Button
                size="xs"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3 w-3" />
                Approve
              </Button>
              <Button size="xs" variant="destructive">
                <XCircle className="h-3 w-3" />
                Deny
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Degraded Warning */}
      {isDegraded && !hasPending && (
        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium">High denial rate detected</span>
            <span className="text-[10px] text-muted-foreground">
              — 3 of 4 calls denied
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DashboardV4() {
  // Sort: pending approvals first, then degraded, then healthy, then offline
  const sortedAgents = [...AGENTS].sort((a, b) => {
    const priority = (agent: Agent) => {
      if (agent.pendingApproval) return 0
      if (agent.status === "degraded") return 1
      if (agent.status === "healthy") return 2
      return 3
    }
    return priority(a) - priority(b)
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Fleet Overview
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {SUMMARY.total} agents across {SUMMARY.healthy + SUMMARY.degraded} active connections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Gauge className="h-3.5 w-3.5" />
              Health Report
            </Button>
            <Button variant="outline" size="sm">
              <Eye className="h-3.5 w-3.5" />
              All Events
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <SummaryBar />

        {/* Agent Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {/* Footer help */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Healthy
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Degraded
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
            Offline
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3" />
            Click a card for agent details
          </span>
        </div>
      </div>
    </div>
  )
}
