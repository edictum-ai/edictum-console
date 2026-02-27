import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  Radio,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Approval {
  id: string
  agent: string
  tool: string
  args: string
  requestedAt: string
  ttlSeconds: number
  elapsedSeconds: number
  severity: "critical" | "high" | "normal"
}

interface TriageItem {
  id: string
  type: "approval" | "offline_agent" | "denial_spike"
  title: string
  description: string
  severity: "critical" | "high" | "normal"
  timestamp: string
  meta?: Record<string, string>
}

interface ActivityEvent {
  id: string
  timestamp: string
  category: "event" | "approval" | "deployment"
  agent: string
  action: string
  detail: string
  verdict?: "allowed" | "denied" | "pending" | "timeout"
}

// --- Small scale (1-agent) ---
const STATS_SMALL = {
  pending: 1,
  agents: { online: 1, total: 1 },
  events24h: 34,
  denials24h: 2,
}

const TRIAGE_SMALL: TriageItem[] = [
  {
    id: "t1",
    type: "approval",
    title: "Pending: file_write(/etc/hosts)",
    description: "admin-bot wants to modify system hosts file",
    severity: "critical",
    timestamp: "12s ago",
    meta: { agent: "admin-bot", ttl: "45s remaining" },
  },
]

const ACTIVITY_SMALL: ActivityEvent[] = [
  {
    id: "a1",
    timestamp: "12s ago",
    category: "event",
    agent: "admin-bot",
    action: "file_read",
    detail: 'path="/var/log/app.log", lines=500',
    verdict: "allowed",
  },
  {
    id: "a2",
    timestamp: "1m ago",
    category: "event",
    agent: "admin-bot",
    action: "shell_exec",
    detail: 'cmd="ls -la /tmp"',
    verdict: "allowed",
  },
  {
    id: "a3",
    timestamp: "5m ago",
    category: "deployment",
    agent: "admin-bot",
    action: "contract_update",
    detail: "v1.2.0 deployed — added file_write approval requirement",
    verdict: undefined,
  },
]

// --- Large scale (100-agent) ---
const STATS_LARGE = {
  pending: 3,
  agents: { online: 12, total: 15 },
  events24h: 847,
  denials24h: 23,
}

const APPROVALS_LARGE: Approval[] = [
  {
    id: "apr-1",
    agent: "deploy-agent-07",
    tool: "kubectl_apply",
    args: 'manifest="production/api-gateway.yaml", namespace="prod", dry_run=false',
    requestedAt: "32s ago",
    ttlSeconds: 300,
    elapsedSeconds: 32,
    severity: "critical",
  },
  {
    id: "apr-2",
    agent: "data-pipeline-03",
    tool: "db_execute",
    args: 'query="DROP TABLE tmp_migration_2024", database="analytics"',
    requestedAt: "2m ago",
    ttlSeconds: 180,
    elapsedSeconds: 120,
    severity: "high",
  },
  {
    id: "apr-3",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.stripe.com/v1/charges", method="POST", amount=4999',
    requestedAt: "4m ago",
    ttlSeconds: 300,
    elapsedSeconds: 245,
    severity: "critical",
  },
]

const TRIAGE_LARGE: TriageItem[] = [
  {
    id: "t1",
    type: "approval",
    title: "URGENT: kubectl_apply to production",
    description:
      'deploy-agent-07 wants to apply api-gateway.yaml to prod namespace',
    severity: "critical",
    timestamp: "32s ago",
    meta: { agent: "deploy-agent-07", ttl: "4m 28s remaining" },
  },
  {
    id: "t2",
    type: "approval",
    title: "DROP TABLE on analytics DB",
    description:
      "data-pipeline-03 wants to drop tmp_migration_2024 table",
    severity: "high",
    timestamp: "2m ago",
    meta: { agent: "data-pipeline-03", ttl: "1m remaining" },
  },
  {
    id: "t3",
    type: "approval",
    title: "Stripe charge $49.99 — expiring soon",
    description:
      "research-agent-12 wants to create a Stripe charge via POST",
    severity: "critical",
    timestamp: "4m ago",
    meta: { agent: "research-agent-12", ttl: "55s remaining" },
  },
  {
    id: "t4",
    type: "offline_agent",
    title: "2 agents offline",
    description:
      "monitor-agent-01, cleanup-agent-09 — last seen 15m and 22m ago",
    severity: "high",
    timestamp: "15m ago",
  },
  {
    id: "t5",
    type: "denial_spike",
    title: "Denial spike: research-agent-12",
    description: "8 denials in last 10 minutes (normally 0-1). Tool: http_request",
    severity: "high",
    timestamp: "10m ago",
    meta: { rate: "8/10min", baseline: "0-1/10min" },
  },
]

const ACTIVITY_LARGE: ActivityEvent[] = [
  {
    id: "e1",
    timestamp: "12s ago",
    category: "event",
    agent: "deploy-agent-07",
    action: "kubectl_get",
    detail: 'resource="pods", namespace="prod", selector="app=api-gateway"',
    verdict: "allowed",
  },
  {
    id: "e2",
    timestamp: "32s ago",
    category: "approval",
    agent: "deploy-agent-07",
    action: "kubectl_apply",
    detail: 'manifest="production/api-gateway.yaml", namespace="prod"',
    verdict: "pending",
  },
  {
    id: "e3",
    timestamp: "1m ago",
    category: "event",
    agent: "research-agent-12",
    action: "http_request",
    detail: 'url="https://api.stripe.com/v1/charges", method="POST"',
    verdict: "denied",
  },
  {
    id: "e4",
    timestamp: "1m ago",
    category: "event",
    agent: "data-pipeline-03",
    action: "db_query",
    detail: 'query="SELECT count(*) FROM tmp_migration_2024", database="analytics"',
    verdict: "allowed",
  },
  {
    id: "e5",
    timestamp: "2m ago",
    category: "approval",
    agent: "data-pipeline-03",
    action: "db_execute",
    detail: 'query="DROP TABLE tmp_migration_2024"',
    verdict: "pending",
  },
  {
    id: "e6",
    timestamp: "5m ago",
    category: "event",
    agent: "support-agent-02",
    action: "send_email",
    detail: 'to="customer@example.com", subject="Ticket #4521 resolved"',
    verdict: "allowed",
  },
  {
    id: "e7",
    timestamp: "8m ago",
    category: "deployment",
    agent: "system",
    action: "contract_update",
    detail: "v2.4.1 deployed to fleet — added http_request rate limit for research agents",
    verdict: undefined,
  },
  {
    id: "e8",
    timestamp: "12m ago",
    category: "event",
    agent: "research-agent-12",
    action: "http_request",
    detail: 'url="https://api.openai.com/v1/chat/completions", method="POST"',
    verdict: "allowed",
  },
  {
    id: "e9",
    timestamp: "15m ago",
    category: "approval",
    agent: "cleanup-agent-09",
    action: "file_delete",
    detail: 'path="/data/exports/batch-2024-02-*.csv", count=147',
    verdict: "allowed",
  },
  {
    id: "e10",
    timestamp: "20m ago",
    category: "event",
    agent: "deploy-agent-07",
    action: "kubectl_get",
    detail: 'resource="deployments", namespace="staging"',
    verdict: "allowed",
  },
]

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return null

  const config: Record<
    string,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    allowed: {
      label: "Allowed",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      icon: <ShieldCheck className="size-3" />,
    },
    denied: {
      label: "Denied",
      className: "bg-red-500/15 text-red-400 border-red-500/25",
      icon: <ShieldX className="size-3" />,
    },
    pending: {
      label: "Pending",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      icon: <Clock className="size-3" />,
    },
    timeout: {
      label: "Timeout",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      icon: <Timer className="size-3" />,
    },
  }

  const c = config[verdict]
  if (!c) return null

  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

function TTLBar({
  elapsed,
  total,
}: {
  elapsed: number
  total: number
}) {
  const pct = Math.min((elapsed / total) * 100, 100)
  const remaining = Math.max(total - elapsed, 0)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const timeStr =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

  // Color based on remaining percentage
  const remainingPct = 100 - pct
  let barColor = "bg-emerald-500"
  let textColor = "text-emerald-400"
  if (remainingPct < 20) {
    barColor = "bg-red-500"
    textColor = "text-red-400"
  } else if (remainingPct < 50) {
    barColor = "bg-amber-500"
    textColor = "text-amber-400"
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${100 - pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{timeStr}</span>
    </div>
  )
}

function TriageIcon({ type }: { type: TriageItem["type"] }) {
  switch (type) {
    case "approval":
      return (
        <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15">
          <ShieldAlert className="size-4 text-amber-400" />
        </div>
      )
    case "offline_agent":
      return (
        <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-500/15">
          <WifiOff className="size-4 text-zinc-400" />
        </div>
      )
    case "denial_spike":
      return (
        <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/15">
          <Flame className="size-4 text-red-400" />
        </div>
      )
  }
}

function CategoryIcon({ category }: { category: ActivityEvent["category"] }) {
  switch (category) {
    case "event":
      return <Zap className="size-3.5 text-muted-foreground" />
    case "approval":
      return <ShieldAlert className="size-3.5 text-amber-400" />
    case "deployment":
      return <Rocket className="size-3.5 text-blue-400" />
  }
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  subValue,
  icon,
  alert,
}: {
  label: string
  value: string | number
  subValue?: string
  icon: React.ReactNode
  alert?: "amber" | "red" | "green" | "none"
}) {
  const borderColor = {
    amber: "border-amber-500/40",
    red: "border-red-500/40",
    green: "border-emerald-500/30",
    none: "",
  }[alert ?? "none"]

  const glowColor = {
    amber: "shadow-amber-500/5",
    red: "shadow-red-500/5",
    green: "",
    none: "",
  }[alert ?? "none"]

  return (
    <Card className={`${borderColor} ${glowColor} py-4`}>
      <CardContent className="flex items-center gap-3 px-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tracking-tight">{value}</p>
          {subValue && (
            <p className="text-xs text-muted-foreground">{subValue}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DashboardV1() {
  const [largeScale, setLargeScale] = useState(true)

  const stats = largeScale ? STATS_LARGE : STATS_SMALL
  const triage = largeScale ? TRIAGE_LARGE : TRIAGE_SMALL
  const activity = largeScale ? ACTIVITY_LARGE : ACTIVITY_SMALL

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Fleet overview and triage
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">1 agent</span>
          <Switch
            checked={largeScale}
            onCheckedChange={setLargeScale}
            size="sm"
          />
          <span className="text-xs text-muted-foreground">100 agents</span>
          <div className="ml-3 flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
            <Radio className="size-3 text-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">Live</span>
          </div>
        </div>
      </div>

      {/* Section 1: Summary Bar */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard
          label="Pending Approvals"
          value={stats.pending}
          icon={<ShieldAlert className="size-5 text-amber-400" />}
          alert={stats.pending > 0 ? "amber" : "none"}
        />
        <StatCard
          label="Active Agents"
          value={`${stats.agents.online}/${stats.agents.total}`}
          subValue={
            stats.agents.online < stats.agents.total
              ? `${stats.agents.total - stats.agents.online} offline`
              : "all connected"
          }
          icon={<Bot className="size-5 text-emerald-400" />}
          alert={
            stats.agents.online === stats.agents.total ? "green" : "amber"
          }
        />
        <StatCard
          label="Events (24h)"
          value={stats.events24h.toLocaleString()}
          icon={<Zap className="size-5 text-blue-400" />}
          alert="none"
        />
        <StatCard
          label="Denials (24h)"
          value={stats.denials24h}
          icon={<XCircle className="size-5 text-red-400" />}
          alert={stats.denials24h > 0 ? "red" : "none"}
        />
      </div>

      {/* Section 2: Needs Attention (Triage) */}
      <Card className="mb-6 border-amber-500/20">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <CardTitle className="text-base">Needs Attention</CardTitle>
              <Badge
                variant="outline"
                className="bg-amber-500/15 text-amber-400 border-amber-500/25"
              >
                {triage.length}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              View all
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {triage.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <TriageIcon type={item.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        item.severity === "critical"
                          ? "text-red-400"
                          : item.severity === "high"
                            ? "text-amber-400"
                            : "text-foreground"
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.severity === "critical" && (
                      <Badge
                        variant="outline"
                        className="bg-red-500/15 text-red-400 border-red-500/25 text-[10px] px-1.5"
                      >
                        CRITICAL
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                  {item.type === "approval" && item.meta && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {item.meta.agent}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.timestamp}
                      </span>
                    </div>
                  )}
                  {item.type === "denial_spike" && item.meta && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-red-400 font-mono">
                        {item.meta.rate}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (baseline: {item.meta.baseline})
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.type === "approval" && (
                    <>
                      {largeScale &&
                        APPROVALS_LARGE.find(
                          (a) =>
                            item.meta?.agent === a.agent,
                        ) && (
                          <TTLBar
                            elapsed={
                              APPROVALS_LARGE.find(
                                (a) =>
                                  item.meta?.agent === a.agent,
                              )!.elapsedSeconds
                            }
                            total={
                              APPROVALS_LARGE.find(
                                (a) =>
                                  item.meta?.agent === a.agent,
                              )!.ttlSeconds
                            }
                          />
                        )}
                      <Button size="xs" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle2 className="size-3" />
                        Approve
                      </Button>
                      <Button size="xs" variant="destructive">
                        <XCircle className="size-3" />
                        Deny
                      </Button>
                    </>
                  )}
                  {item.type === "offline_agent" && (
                    <Button size="xs" variant="outline">
                      <Eye className="size-3" />
                      Investigate
                    </Button>
                  )}
                  {item.type === "denial_spike" && (
                    <Button size="xs" variant="outline">
                      <Eye className="size-3" />
                      View Denials
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {triage.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-2 size-8 text-emerald-400" />
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs text-muted-foreground">
                No items need your attention
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Recent Activity */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList variant="line" className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="events">
                Events
                {largeScale && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[10px]"
                  >
                    {activity.filter((e) => e.category === "event").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approvals">
                Approvals
                {stats.pending > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-1 h-4 px-1 text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/25"
                  >
                    {stats.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deployments">Deployments</TabsTrigger>
            </TabsList>

            {(["all", "events", "approvals", "deployments"] as const).map(
              (tab) => (
                <TabsContent key={tab} value={tab}>
                  <div className="divide-y divide-border">
                    {activity
                      .filter(
                        (e) =>
                          tab === "all" ||
                          (tab === "events" && e.category === "event") ||
                          (tab === "approvals" &&
                            e.category === "approval") ||
                          (tab === "deployments" &&
                            e.category === "deployment"),
                      )
                      .map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
                            <CategoryIcon category={event.category} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {event.action}
                              </span>
                              <VerdictBadge verdict={event.verdict} />
                            </div>
                            <p className="mt-0.5 truncate text-xs font-mono text-muted-foreground">
                              {event.detail}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-xs text-muted-foreground max-w-[120px] truncate">
                              {event.agent}
                            </span>
                            <span className="text-xs text-muted-foreground/60 font-mono w-16 text-right">
                              {event.timestamp}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </TabsContent>
              ),
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
