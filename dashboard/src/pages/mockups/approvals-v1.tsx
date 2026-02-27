import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutGrid,
  List,
  MessageSquare,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  X,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingApproval {
  id: string
  agent_id: string
  environment: string
  tool: string
  tool_args: string
  message: string
  timeout_effect: "deny" | "allow"
  ttl_seconds: number
  elapsed_seconds: number
  requested_at: string
  severity: "critical" | "high" | "normal"
}

interface HistoryItem {
  id: string
  agent_id: string
  tool: string
  tool_args: string
  decision: "approved" | "denied" | "timed_out"
  decided_by: string
  decided_at: string
  deny_reason?: string
  elapsed_seconds: number
  ttl_seconds: number
}

// ---------------------------------------------------------------------------
// Mock data — Card view (low volume, 3 pending)
// ---------------------------------------------------------------------------

const PENDING_LOW: PendingApproval[] = [
  {
    id: "apr-001",
    agent_id: "cleanup-agent-03",
    environment: "production",
    tool: "exec",
    tool_args: `exec("rm -rf /tmp/build-artifacts")`,
    message: "Cleaning up stale build artifacts older than 7 days from temp directory",
    timeout_effect: "deny",
    ttl_seconds: 300,
    elapsed_seconds: 28,
    requested_at: "2 min ago",
    severity: "critical",
  },
  {
    id: "apr-002",
    agent_id: "config-agent-01",
    environment: "staging",
    tool: "write_file",
    tool_args: `write_file("/etc/app.cfg", content="max_workers=16\\nlog_level=debug\\ntimeout=30")`,
    message: "Updating application config to increase worker pool for load test",
    timeout_effect: "deny",
    ttl_seconds: 180,
    elapsed_seconds: 102,
    requested_at: "5 min ago",
    severity: "high",
  },
  {
    id: "apr-003",
    agent_id: "billing-agent-07",
    environment: "production",
    tool: "mcp_call",
    tool_args: `mcp_call("stripe.charges.create", {amount: 20000, currency: "usd", customer: "cus_R4x8mK2", description: "Enterprise plan upgrade"})`,
    message: "Processing enterprise plan upgrade — customer requested via support ticket #8821",
    timeout_effect: "deny",
    ttl_seconds: 300,
    elapsed_seconds: 258,
    requested_at: "8 min ago",
    severity: "critical",
  },
]

// ---------------------------------------------------------------------------
// Mock data — Table view (high volume, 12 pending)
// ---------------------------------------------------------------------------

const PENDING_HIGH: PendingApproval[] = [
  ...PENDING_LOW,
  {
    id: "apr-004",
    agent_id: "deploy-agent-02",
    environment: "production",
    tool: "kubectl_apply",
    tool_args: `kubectl_apply(manifest="deploy/api-v2.yaml", namespace="prod")`,
    message: "Rolling out API v2 to production cluster",
    timeout_effect: "deny",
    ttl_seconds: 300,
    elapsed_seconds: 15,
    requested_at: "15s ago",
    severity: "critical",
  },
  {
    id: "apr-005",
    agent_id: "data-pipeline-01",
    environment: "production",
    tool: "db_execute",
    tool_args: `db_execute("DROP TABLE tmp_migration_batch_44")`,
    message: "Dropping temporary migration table after successful ETL run",
    timeout_effect: "deny",
    ttl_seconds: 180,
    elapsed_seconds: 90,
    requested_at: "3 min ago",
    severity: "high",
  },
  {
    id: "apr-006",
    agent_id: "support-agent-05",
    environment: "production",
    tool: "send_email",
    tool_args: `send_email(to="vip@enterprise.com", subject="Account access restored")`,
    message: "Notifying VIP customer about restored access after incident",
    timeout_effect: "allow",
    ttl_seconds: 120,
    elapsed_seconds: 45,
    requested_at: "1 min ago",
    severity: "normal",
  },
  {
    id: "apr-007",
    agent_id: "research-agent-12",
    environment: "sandbox",
    tool: "http_request",
    tool_args: `http_request("POST", "https://api.openai.com/v1/chat/completions", {model: "gpt-4"})`,
    message: "Making API call to external LLM for analysis task",
    timeout_effect: "deny",
    ttl_seconds: 60,
    elapsed_seconds: 52,
    requested_at: "52s ago",
    severity: "high",
  },
  {
    id: "apr-008",
    agent_id: "monitor-agent-09",
    environment: "production",
    tool: "exec",
    tool_args: `exec("systemctl restart nginx")`,
    message: "Restarting nginx after detecting high error rate",
    timeout_effect: "deny",
    ttl_seconds: 120,
    elapsed_seconds: 30,
    requested_at: "30s ago",
    severity: "critical",
  },
  {
    id: "apr-009",
    agent_id: "cleanup-agent-03",
    environment: "staging",
    tool: "file_delete",
    tool_args: `file_delete("/data/exports/batch-*.csv", count=234)`,
    message: "Removing old export files from staging environment",
    timeout_effect: "allow",
    ttl_seconds: 300,
    elapsed_seconds: 120,
    requested_at: "4 min ago",
    severity: "normal",
  },
  {
    id: "apr-010",
    agent_id: "billing-agent-07",
    environment: "production",
    tool: "mcp_call",
    tool_args: `mcp_call("stripe.refunds.create", {charge: "ch_3Px...", amount: 4999})`,
    message: "Processing refund for disputed charge",
    timeout_effect: "deny",
    ttl_seconds: 180,
    elapsed_seconds: 60,
    requested_at: "2 min ago",
    severity: "high",
  },
  {
    id: "apr-011",
    agent_id: "deploy-agent-02",
    environment: "staging",
    tool: "kubectl_apply",
    tool_args: `kubectl_apply(manifest="deploy/worker-v3.yaml", namespace="staging")`,
    message: "Deploying worker v3 to staging for QA",
    timeout_effect: "allow",
    ttl_seconds: 300,
    elapsed_seconds: 200,
    requested_at: "6 min ago",
    severity: "normal",
  },
  {
    id: "apr-012",
    agent_id: "config-agent-01",
    environment: "production",
    tool: "write_file",
    tool_args: `write_file("/etc/nginx/conf.d/rate-limit.conf", content="limit_req_zone...")`,
    message: "Adding rate limiting config to mitigate traffic spike",
    timeout_effect: "deny",
    ttl_seconds: 120,
    elapsed_seconds: 85,
    requested_at: "1 min ago",
    severity: "high",
  },
]

// ---------------------------------------------------------------------------
// Mock data — History
// ---------------------------------------------------------------------------

const HISTORY: HistoryItem[] = [
  {
    id: "hist-001",
    agent_id: "deploy-agent-02",
    tool: "kubectl_apply",
    tool_args: `kubectl_apply(manifest="deploy/api-v1.9.yaml", namespace="prod")`,
    decision: "approved",
    decided_by: "admin@edictum.dev",
    decided_at: "12 min ago",
    elapsed_seconds: 45,
    ttl_seconds: 300,
  },
  {
    id: "hist-002",
    agent_id: "research-agent-12",
    tool: "http_request",
    tool_args: `http_request("POST", "https://api.stripe.com/v1/charges")`,
    decision: "denied",
    decided_by: "admin@edictum.dev",
    decided_at: "18 min ago",
    deny_reason: "Unauthorized billing action — agent not cleared for payments",
    elapsed_seconds: 30,
    ttl_seconds: 180,
  },
  {
    id: "hist-003",
    agent_id: "support-agent-05",
    tool: "send_email",
    tool_args: `send_email(to="user@example.com", subject="Your ticket was resolved")`,
    decision: "approved",
    decided_by: "admin@edictum.dev",
    decided_at: "25 min ago",
    elapsed_seconds: 12,
    ttl_seconds: 120,
  },
  {
    id: "hist-004",
    agent_id: "cleanup-agent-03",
    tool: "exec",
    tool_args: `exec("rm -rf /var/log/old/*.gz")`,
    decision: "timed_out",
    decided_by: "system",
    decided_at: "32 min ago",
    elapsed_seconds: 300,
    ttl_seconds: 300,
  },
  {
    id: "hist-005",
    agent_id: "data-pipeline-01",
    tool: "db_execute",
    tool_args: `db_execute("TRUNCATE TABLE staging_events")`,
    decision: "approved",
    decided_by: "admin@edictum.dev",
    decided_at: "45 min ago",
    elapsed_seconds: 8,
    ttl_seconds: 180,
  },
]

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

function getTimerState(elapsed: number, total: number) {
  const remaining = Math.max(total - elapsed, 0)
  const remainingPct = (remaining / total) * 100
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const timeStr = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `0:${String(seconds).padStart(2, "0")}`

  let zone: "green" | "amber" | "red" | "expired" = "green"
  if (remaining === 0) zone = "expired"
  else if (remainingPct < 20) zone = "red"
  else if (remainingPct < 60) zone = "amber"

  return { remaining, remainingPct, timeStr, zone }
}

function TimerBadge({ elapsed, total }: { elapsed: number; total: number }) {
  const { timeStr, zone } = getTimerState(elapsed, total)

  const styles = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25 animate-pulse",
    expired: "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
  }

  return (
    <Badge variant="outline" className={`${styles[zone]} font-mono gap-1.5`}>
      <Timer className="size-3" />
      {zone === "expired" ? "Expired" : timeStr}
    </Badge>
  )
}

function TimerBar({ elapsed, total, showLabel }: { elapsed: number; total: number; showLabel?: boolean }) {
  const { timeStr, zone, remainingPct } = getTimerState(elapsed, total)

  const barColor = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    expired: "bg-zinc-500",
  }[zone]

  const textColor = {
    green: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    expired: "text-zinc-500",
  }[zone]

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 min-w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor} ${zone === "red" ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(remainingPct, 2)}%` }}
        />
      </div>
      {showLabel !== false && (
        <span className={`text-xs font-mono whitespace-nowrap ${textColor}`}>
          {zone === "expired" ? "Expired" : timeStr}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: PendingApproval["severity"] }) {
  const styles = {
    critical: "bg-red-500/15 text-red-400 border-red-500/25",
    high: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    normal: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  }

  return (
    <Badge variant="outline" className={`${styles[severity]} uppercase text-[10px]`}>
      {severity}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Environment badge
// ---------------------------------------------------------------------------

function EnvBadge({ env }: { env: string }) {
  const style = env === "production"
    ? "bg-red-500/10 text-red-400 border-red-500/20"
    : env === "staging"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"

  return (
    <Badge variant="outline" className={`${style} text-[10px]`}>
      {env}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Decision badge (for history)
// ---------------------------------------------------------------------------

function DecisionBadge({ decision }: { decision: HistoryItem["decision"] }) {
  const config = {
    approved: {
      label: "Approved",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      icon: <ShieldCheck className="size-3" />,
    },
    denied: {
      label: "Denied",
      className: "bg-red-500/15 text-red-400 border-red-500/25",
      icon: <ShieldX className="size-3" />,
    },
    timed_out: {
      label: "Timed Out",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      icon: <Timer className="size-3" />,
    },
  }

  const c = config[decision]
  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Deny input (inline)
// ---------------------------------------------------------------------------

function DenyButton({ onDeny }: { onDeny: (reason: string) => void }) {
  const [showInput, setShowInput] = useState(false)
  const [reason, setReason] = useState("")

  if (!showInput) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
        onClick={() => setShowInput(true)}
      >
        <XCircle className="size-3.5" />
        Deny
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for denial..."
        className="h-8 w-48 text-xs"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && reason.trim()) {
            onDeny(reason)
            setShowInput(false)
            setReason("")
          }
          if (e.key === "Escape") {
            setShowInput(false)
            setReason("")
          }
        }}
      />
      <Button
        size="xs"
        variant="destructive"
        disabled={!reason.trim()}
        onClick={() => {
          onDeny(reason)
          setShowInput(false)
          setReason("")
        }}
      >
        <Check className="size-3" />
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setShowInput(false)
          setReason("")
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approval Card (rich, for low-volume mode)
// ---------------------------------------------------------------------------

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const { zone } = getTimerState(approval.elapsed_seconds, approval.ttl_seconds)

  const borderColor = {
    green: "",
    amber: "border-amber-500/20",
    red: "border-red-500/30",
    expired: "border-zinc-500/30",
  }[zone]

  const bgTint = zone === "red" ? "bg-red-500/[0.02]" : ""

  return (
    <Card className={`${borderColor} ${bgTint} transition-all`}>
      <CardContent className="p-4 space-y-3">
        {/* Row 1: Timer + Agent Info + Severity */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <ShieldAlert className="size-4.5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{approval.tool}</span>
                <SeverityBadge severity={approval.severity} />
                <EnvBadge env={approval.environment} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Bot className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">{approval.agent_id}</span>
                <span className="text-xs text-muted-foreground">{approval.requested_at}</span>
              </div>
            </div>
          </div>
          <TimerBadge elapsed={approval.elapsed_seconds} total={approval.ttl_seconds} />
        </div>

        {/* Row 2: Timer bar (full width) */}
        <TimerBar elapsed={approval.elapsed_seconds} total={approval.ttl_seconds} showLabel={false} />

        {/* Row 3: Agent's message */}
        <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
          <MessageSquare className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">{approval.message}</p>
        </div>

        {/* Row 4: Tool arguments — THE HERO */}
        <div className="rounded-md border border-border bg-zinc-950/50 dark:bg-zinc-950/80 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Tool Arguments</p>
          <code className="text-sm font-mono text-foreground leading-relaxed break-all whitespace-pre-wrap">
            {approval.tool_args}
          </code>
        </div>

        {/* Row 5: Timeout effect warning */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>
            On timeout: <span className={approval.timeout_effect === "deny" ? "text-red-400 font-medium" : "text-amber-400 font-medium"}>{approval.timeout_effect === "deny" ? "Request denied" : "Request allowed"}</span>
          </span>
        </div>

        {/* Row 6: Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            onClick={() => {}}
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
          <DenyButton onDeny={() => {}} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Table view (compact, for high-volume mode)
// ---------------------------------------------------------------------------

function ApprovalsTable({ approvals }: { approvals: PendingApproval[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const allSelected = selected.size === approvals.length
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(approvals.map((a) => a.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  return (
    <div className="space-y-3">
      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setSelected(new Set())}
            >
              <CheckCircle2 className="size-3.5" />
              Approve Selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
              onClick={() => setSelected(new Set())}
            >
              <XCircle className="size-3.5" />
              Deny Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected
                }}
                onChange={toggleAll}
                className="size-3.5 rounded border-muted-foreground/50 accent-primary"
              />
            </TableHead>
            <TableHead className="w-10" />
            <TableHead>Agent / Tool</TableHead>
            <TableHead>Arguments</TableHead>
            <TableHead>Env</TableHead>
            <TableHead>Timer</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => {
            const isExpanded = expanded.has(approval.id)
            const { zone } = getTimerState(approval.elapsed_seconds, approval.ttl_seconds)
            const rowTint = zone === "red" ? "bg-red-500/[0.03]" : ""

            return (
              <TableRow
                key={approval.id}
                data-state={selected.has(approval.id) ? "selected" : undefined}
                className={rowTint}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(approval.id)}
                    onChange={() => toggleOne(approval.id)}
                    className="size-3.5 rounded border-muted-foreground/50 accent-primary"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => toggleExpand(approval.id)}
                  >
                    {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{approval.tool}</span>
                      <SeverityBadge severity={approval.severity} />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{approval.agent_id}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  {isExpanded ? (
                    <div className="space-y-2">
                      <code className="text-xs font-mono text-foreground break-all whitespace-pre-wrap block">
                        {approval.tool_args}
                      </code>
                      <div className="flex items-start gap-1.5 rounded bg-muted/50 px-2 py-1.5">
                        <MessageSquare className="size-3 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-xs text-muted-foreground">{approval.message}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-2.5" />
                        On timeout: <span className={approval.timeout_effect === "deny" ? "text-red-400" : "text-amber-400"}>{approval.timeout_effect}</span>
                      </div>
                    </div>
                  ) : (
                    <code className="text-xs font-mono text-muted-foreground truncate block max-w-xs">
                      {approval.tool_args}
                    </code>
                  )}
                </TableCell>
                <TableCell>
                  <EnvBadge env={approval.environment} />
                </TableCell>
                <TableCell className="min-w-32">
                  <TimerBar elapsed={approval.elapsed_seconds} total={approval.ttl_seconds} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button
                      size="xs"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="size-3" />
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <XCircle className="size-3" />
                      Deny
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History section
// ---------------------------------------------------------------------------

function HistorySection() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          Recent Decisions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent / Tool</TableHead>
              <TableHead>Arguments</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Response Time</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {HISTORY.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">{item.tool}</span>
                    <span className="text-xs text-muted-foreground font-mono block">{item.agent_id}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  <code className="text-xs font-mono text-muted-foreground truncate block">
                    {item.tool_args}
                  </code>
                  {item.deny_reason && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                      <MessageSquare className="size-2.5" />
                      {item.deny_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DecisionBadge decision={item.decision} />
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{item.decided_by}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-mono text-muted-foreground">{item.elapsed_seconds}s</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs text-muted-foreground">{item.decided_at}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApprovalsV1() {
  const [highVolume, setHighVolume] = useState(false)
  const [forceView, setForceView] = useState<"auto" | "cards" | "table">("auto")

  const pending = highVolume ? PENDING_HIGH : PENDING_LOW
  const isCardMode = forceView === "cards" || (forceView === "auto" && pending.length < 5)
  const isTableMode = !isCardMode

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-5 text-amber-400" />
            Approvals Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} pending {pending.length === 1 ? "approval" : "approvals"} — agents are waiting
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Volume toggle (demo) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Low volume</span>
            <Switch checked={highVolume} onCheckedChange={setHighVolume} size="sm" />
            <span className="text-xs text-muted-foreground">High volume</span>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              size="icon-xs"
              variant={isCardMode ? "default" : "ghost"}
              onClick={() => setForceView(forceView === "cards" ? "auto" : "cards")}
            >
              <LayoutGrid className="size-3" />
            </Button>
            <Button
              size="icon-xs"
              variant={isTableMode ? "default" : "ghost"}
              onClick={() => setForceView(forceView === "table" ? "auto" : "table")}
            >
              <List className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Pending count + urgency indicator */}
      {pending.some((a) => getTimerState(a.elapsed_seconds, a.ttl_seconds).zone === "red") && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 animate-pulse">
          <ShieldAlert className="size-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">
            {pending.filter((a) => getTimerState(a.elapsed_seconds, a.ttl_seconds).zone === "red").length} approval{pending.filter((a) => getTimerState(a.elapsed_seconds, a.ttl_seconds).zone === "red").length > 1 ? "s" : ""} expiring soon
          </span>
        </div>
      )}

      {/* Main content — Tabs for pending / history */}
      <Tabs defaultValue="pending">
        <TabsList variant="line">
          <TabsTrigger value="pending">
            Pending
            <Badge variant="outline" className="ml-1.5 bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] h-4 px-1.5">
              {pending.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {/* Auto-switching view */}
          {isCardMode && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LayoutGrid className="size-3" />
                Card view — {forceView === "auto" ? "auto-selected (low volume)" : "manual"}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {pending.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} />
                ))}
              </div>
            </div>
          )}

          {isTableMode && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <List className="size-3" />
                Table view — {forceView === "auto" ? "auto-selected (high volume)" : "manual"} — click row chevron for details
              </div>
              <ApprovalsTable approvals={pending} />
            </div>
          )}

          {pending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="mb-3 size-10 text-emerald-400" />
              <p className="text-sm font-medium">No pending approvals</p>
              <p className="text-xs text-muted-foreground mt-1">All agents are running freely</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistorySection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
