import {
  Card,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Clock,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Activity,
  Bot,
  Zap,
  AlertTriangle,
  WifiOff,
  TrendingDown,
  Check,
  X,
  FileText,
  Rocket,
  Eye,
  BarChart3,
} from "lucide-react"

// ── Mock Data ──────────────────────────────────────────────────────────

const stats = {
  pending: 5,
  agentsOnline: 10,
  agentsTotal: 12,
  events24h: 2147,
  denials24h: 45,
  approvalRate: 91.2,
}

interface PendingApproval {
  id: string
  agent: string
  tool: string
  args: string
  contract: string
  countdown: string
  countdownSeconds: number
  risk: "high" | "medium" | "low"
  requestedAt: string
}

const pendingApprovals: PendingApproval[] = [
  {
    id: "apr-001",
    agent: "deploy-bot",
    tool: "kubectl_apply",
    args: "namespace=production, manifest=deployment.yaml",
    contract: "infra-deploy-v3",
    countdown: "2:14",
    countdownSeconds: 134,
    risk: "high",
    requestedAt: "12s ago",
  },
  {
    id: "apr-002",
    agent: "data-analyst",
    tool: "sql_execute",
    args: 'query="DROP TABLE staging_events"',
    contract: "data-ops-v2",
    countdown: "4:51",
    countdownSeconds: 291,
    risk: "high",
    requestedAt: "1m ago",
  },
  {
    id: "apr-003",
    agent: "support-bot",
    tool: "send_email",
    args: "to=customer@acme.co, template=refund_confirmation",
    contract: "customer-comms-v1",
    countdown: "8:32",
    countdownSeconds: 512,
    risk: "medium",
    requestedAt: "2m ago",
  },
  {
    id: "apr-004",
    agent: "research-agent",
    tool: "web_scrape",
    args: "url=https://competitor.io/pricing, depth=2",
    contract: "research-v1",
    countdown: "12:07",
    countdownSeconds: 727,
    risk: "low",
    requestedAt: "3m ago",
  },
  {
    id: "apr-005",
    agent: "deploy-bot",
    tool: "helm_upgrade",
    args: "chart=api-gateway, values=prod-values.yaml",
    contract: "infra-deploy-v3",
    countdown: "14:45",
    countdownSeconds: 885,
    risk: "medium",
    requestedAt: "5m ago",
  },
]

interface AgentAlert {
  id: string
  agent: string
  status: "offline" | "degraded"
  message: string
  since: string
}

const agentAlerts: AgentAlert[] = [
  {
    id: "alert-1",
    agent: "billing-agent",
    status: "offline",
    message: "No heartbeat for 8 minutes",
    since: "8m ago",
  },
  {
    id: "alert-2",
    agent: "deploy-bot",
    status: "degraded",
    message: "High error rate (23% denials in last 15m)",
    since: "3m ago",
  },
  {
    id: "alert-3",
    agent: "qa-runner",
    status: "degraded",
    message: "Contract sync failed, running stale v2",
    since: "12m ago",
  },
]

type ActivityType = "event" | "approval" | "deployment"
type Verdict = "allowed" | "denied" | "pending" | "timeout"

interface ActivityItem {
  id: string
  type: ActivityType
  agent: string
  action: string
  detail: string
  verdict?: Verdict
  timestamp: string
}

const recentActivity: ActivityItem[] = [
  { id: "a01", type: "approval", agent: "deploy-bot", action: "kubectl_apply", detail: "namespace=production", verdict: "allowed", timestamp: "12s ago" },
  { id: "a02", type: "event", agent: "support-bot", action: "send_email", detail: "to=user@example.com", verdict: "allowed", timestamp: "28s ago" },
  { id: "a03", type: "event", agent: "data-analyst", action: "sql_execute", detail: 'query="SELECT * FROM users LIMIT 100"', verdict: "allowed", timestamp: "45s ago" },
  { id: "a04", type: "deployment", agent: "system", action: "contract_update", detail: "infra-deploy-v3 deployed to 4 agents", timestamp: "1m ago" },
  { id: "a05", type: "event", agent: "research-agent", action: "web_scrape", detail: "url=https://docs.python.org", verdict: "denied", timestamp: "1m ago" },
  { id: "a06", type: "approval", agent: "deploy-bot", action: "helm_upgrade", detail: "chart=redis, release=cache-prod", verdict: "allowed", timestamp: "2m ago" },
  { id: "a07", type: "event", agent: "billing-agent", action: "stripe_charge", detail: "amount=$249.00, customer=cus_abc", verdict: "allowed", timestamp: "3m ago" },
  { id: "a08", type: "event", agent: "support-bot", action: "ticket_close", detail: "ticket=#4821, reason=resolved", verdict: "allowed", timestamp: "3m ago" },
  { id: "a09", type: "event", agent: "data-analyst", action: "sql_execute", detail: 'query="UPDATE metrics SET..."', verdict: "denied", timestamp: "4m ago" },
  { id: "a10", type: "deployment", agent: "system", action: "contract_update", detail: "customer-comms-v1 deployed to 2 agents", timestamp: "5m ago" },
  { id: "a11", type: "event", agent: "qa-runner", action: "test_execute", detail: "suite=integration, env=staging", verdict: "allowed", timestamp: "5m ago" },
  { id: "a12", type: "approval", agent: "billing-agent", action: "refund_process", detail: "amount=$89.00, reason=duplicate", verdict: "timeout", timestamp: "6m ago" },
  { id: "a13", type: "event", agent: "deploy-bot", action: "kubectl_delete", detail: "namespace=staging, resource=pod/old-api", verdict: "denied", timestamp: "7m ago" },
  { id: "a14", type: "event", agent: "research-agent", action: "web_scrape", detail: "url=https://arxiv.org/abs/2401.001", verdict: "allowed", timestamp: "8m ago" },
  { id: "a15", type: "event", agent: "support-bot", action: "send_sms", detail: "to=+1555000123, template=shipping_update", verdict: "allowed", timestamp: "9m ago" },
  { id: "a16", type: "deployment", agent: "system", action: "contract_update", detail: "research-v1 deployed to 1 agent", timestamp: "10m ago" },
]

// ── Verdict Histogram Data ─────────────────────────────────────────────

const histogramData = [
  { hour: "12a", allowed: 42, denied: 3, timeout: 0 },
  { hour: "2a", allowed: 18, denied: 1, timeout: 0 },
  { hour: "4a", allowed: 8, denied: 0, timeout: 0 },
  { hour: "6a", allowed: 22, denied: 2, timeout: 1 },
  { hour: "8a", allowed: 95, denied: 5, timeout: 0 },
  { hour: "10a", allowed: 142, denied: 8, timeout: 2 },
  { hour: "12p", allowed: 168, denied: 6, timeout: 1 },
  { hour: "2p", allowed: 155, denied: 4, timeout: 0 },
  { hour: "4p", allowed: 178, denied: 9, timeout: 3 },
  { hour: "6p", allowed: 130, denied: 5, timeout: 1 },
  { hour: "8p", allowed: 72, denied: 2, timeout: 0 },
  { hour: "now", allowed: 63, denied: 3, timeout: 1 },
]

// ── Helper Components ──────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    allowed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    denied: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
    timeout: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25",
  }
  return (
    <Badge variant="outline" className={styles[verdict]}>
      {verdict}
    </Badge>
  )
}

function RiskIndicator({ risk }: { risk: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-emerald-500",
  }
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${styles[risk]}`}
      title={`${risk} risk`}
    />
  )
}

function CountdownTimer({ time, seconds }: { time: string; seconds: number }) {
  const urgent = seconds < 180
  return (
    <span
      className={`font-mono text-xs tabular-nums ${
        urgent
          ? "text-red-500 dark:text-red-400 font-semibold"
          : "text-muted-foreground"
      }`}
    >
      <Clock className="mr-1 inline-block size-3" />
      {time}
    </span>
  )
}

function ActivityIcon({ type }: { type: ActivityType }) {
  switch (type) {
    case "event":
      return <Zap className="size-3.5 text-blue-500" />
    case "approval":
      return <ShieldCheck className="size-3.5 text-amber-500" />
    case "deployment":
      return <Rocket className="size-3.5 text-violet-500" />
  }
}

function MiniHistogram() {
  const maxVal = Math.max(
    ...histogramData.map((d) => d.allowed + d.denied + d.timeout)
  )
  return (
    <div className="flex items-end gap-1 h-10">
      {histogramData.map((bar) => {
        const total = bar.allowed + bar.denied + bar.timeout
        const heightPercent = (total / maxVal) * 100
        const deniedPercent =
          total > 0 ? ((bar.denied + bar.timeout) / total) * 100 : 0
        return (
          <div
            key={bar.hour}
            className="flex-1 flex flex-col justify-end rounded-sm overflow-hidden"
            style={{ height: "100%" }}
            title={`${bar.hour}: ${bar.allowed} allowed, ${bar.denied} denied, ${bar.timeout} timeout`}
          >
            <div className="w-full flex flex-col justify-end" style={{ height: "100%" }}>
              {deniedPercent > 0 && (
                <div
                  className="w-full bg-red-500/60 rounded-t-[1px]"
                  style={{
                    height: `${(deniedPercent / 100) * heightPercent}%`,
                    minHeight: deniedPercent > 0 ? "1px" : 0,
                  }}
                />
              )}
              <div
                className="w-full bg-emerald-500/50 dark:bg-emerald-500/40"
                style={{
                  height: `${((100 - deniedPercent) / 100) * heightPercent}%`,
                  minHeight: "1px",
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

export default function DashboardV2() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Top Stats Bar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center gap-6 text-sm">
          <StatItem
            icon={<ShieldAlert className="size-4 text-amber-500" />}
            label="Pending"
            value={stats.pending}
            highlight
          />
          <Separator orientation="vertical" className="h-5" />
          <StatItem
            icon={<Bot className="size-4 text-emerald-500" />}
            label="Agents"
            value={`${stats.agentsOnline}/${stats.agentsTotal}`}
            subtext={`${stats.agentsTotal - stats.agentsOnline} offline`}
          />
          <Separator orientation="vertical" className="h-5" />
          <StatItem
            icon={<Activity className="size-4 text-blue-500" />}
            label="Events (24h)"
            value={stats.events24h.toLocaleString()}
          />
          <Separator orientation="vertical" className="h-5" />
          <StatItem
            icon={<ShieldX className="size-4 text-red-500" />}
            label="Denials (24h)"
            value={stats.denials24h}
            subtext={`${(100 - stats.approvalRate).toFixed(1)}% rate`}
          />
          <Separator orientation="vertical" className="h-5" />
          <StatItem
            icon={<BarChart3 className="size-4 text-muted-foreground" />}
            label="Approval Rate"
            value={`${stats.approvalRate}%`}
          />
        </div>
      </div>

      {/* ── Two-Column Layout ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Column: Triage ──────────────────────────────────── */}
        <div className="w-[42%] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Pending Approvals */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShieldAlert className="size-4 text-amber-500" />
                    Pending Approvals
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 ml-1">
                      {pendingApprovals.length}
                    </Badge>
                  </h2>
                </div>
                <div className="space-y-2">
                  {pendingApprovals.map((approval) => (
                    <Card key={approval.id} className="py-0 gap-0">
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <RiskIndicator risk={approval.risk} />
                            <span className="font-mono text-sm font-medium text-foreground truncate">
                              {approval.tool}
                            </span>
                          </div>
                          <CountdownTimer
                            time={approval.countdown}
                            seconds={approval.countdownSeconds}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mb-1 truncate font-mono pl-4">
                          {approval.args}
                        </div>
                        <div className="flex items-center justify-between pl-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Bot className="size-3" />
                            <span>{approval.agent}</span>
                            <span className="text-border">|</span>
                            <span>{approval.contract}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="xs" variant="outline" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15">
                              <Check className="size-3" />
                            </Button>
                            <Button size="xs" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15">
                              <X className="size-3" />
                            </Button>
                            <Button size="xs" variant="ghost" className="text-muted-foreground">
                              <Eye className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>

              <Separator />

              {/* Agent Alerts */}
              <section>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <AlertTriangle className="size-4 text-red-500" />
                  Agent Alerts
                  <Badge variant="outline" className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25 ml-1">
                    {agentAlerts.length}
                  </Badge>
                </h2>
                <div className="space-y-2">
                  {agentAlerts.map((alert) => (
                    <Card key={alert.id} className="py-0 gap-0">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {alert.status === "offline" ? (
                              <WifiOff className="size-3.5 text-red-500" />
                            ) : (
                              <TrendingDown className="size-3.5 text-amber-500" />
                            )}
                            <span className="text-sm font-medium text-foreground">
                              {alert.agent}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                alert.status === "offline"
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                              }
                            >
                              {alert.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {alert.since}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5.5">
                          {alert.message}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>

              <Separator />

              {/* Denial Spike Warning */}
              <section>
                <Card className="py-0 gap-0 border-amber-500/30 bg-amber-500/5">
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldX className="size-4 text-amber-500" />
                      <span className="text-sm font-semibold text-foreground">
                        Denial Spike Detected
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">
                      <span className="font-medium text-amber-600 dark:text-amber-400">deploy-bot</span> has
                      a 23% denial rate over the last 15 minutes (baseline: 4%).
                      Most denied tool: <span className="font-mono">kubectl_delete</span>.
                    </p>
                    <div className="flex gap-2 mt-2 pl-6">
                      <Button size="xs" variant="outline">
                        <FileText className="size-3 mr-1" />
                        View Contract
                      </Button>
                      <Button size="xs" variant="outline">
                        <Activity className="size-3 mr-1" />
                        View Events
                      </Button>
                    </div>
                  </div>
                </Card>
              </section>
            </div>
          </ScrollArea>
        </div>

        {/* ── Right Column: Activity Feed ──────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mini Histogram */}
          <div className="shrink-0 px-6 pt-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground">
                Verdict Distribution (24h)
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-sm bg-emerald-500/50" />
                  allowed
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-sm bg-red-500/60" />
                  denied/timeout
                </span>
              </div>
            </div>
            <MiniHistogram />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              {histogramData.map((d) => (
                <span key={d.hour} className="flex-1 text-center">
                  {d.hour}
                </span>
              ))}
            </div>
          </div>

          {/* Activity Stream */}
          <div className="shrink-0 px-6 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Recent Activity
              </h2>
              <div className="flex items-center gap-1">
                <Button size="xs" variant="secondary" className="text-xs">
                  All
                </Button>
                <Button size="xs" variant="ghost" className="text-xs text-muted-foreground">
                  Events
                </Button>
                <Button size="xs" variant="ghost" className="text-xs text-muted-foreground">
                  Approvals
                </Button>
                <Button size="xs" variant="ghost" className="text-xs text-muted-foreground">
                  Deploys
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-6 pb-4">
              <div className="space-y-0">
                {recentActivity.map((item, idx) => (
                  <div key={item.id}>
                    <div className="flex items-start gap-3 py-2.5 group hover:bg-accent/50 -mx-2 px-2 rounded-md transition-colors cursor-pointer">
                      <div className="mt-0.5 shrink-0">
                        <ActivityIcon type={item.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-foreground">
                            {item.agent}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.action}
                          </span>
                          {item.verdict && (
                            <VerdictBadge verdict={item.verdict} />
                          )}
                          {item.type === "deployment" && (
                            <Badge variant="outline" className="bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25">
                              deploy
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate font-mono">
                          {item.detail}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {item.timestamp}
                      </span>
                    </div>
                    {idx < recentActivity.length - 1 && (
                      <Separator />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

// ── Stat Item ──────────────────────────────────────────────────────────

function StatItem({
  icon,
  label,
  value,
  subtext,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground"
          }`}
        >
          {value}
        </span>
        {subtext && (
          <span className="text-xs text-muted-foreground">({subtext})</span>
        )}
      </div>
    </div>
  )
}
