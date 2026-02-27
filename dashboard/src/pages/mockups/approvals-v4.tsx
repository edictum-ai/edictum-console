import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Bot,
  CheckCircle2,
  Clock,
  GripVertical,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  User,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApprovalStatus = "pending" | "approved" | "denied" | "timeout"

interface ApprovalCard {
  id: string
  agent_id: string
  tool_name: string
  args: string
  env: "production" | "staging" | "development"
  status: ApprovalStatus
  requested_at: string
  // pending-only
  ttl_seconds?: number
  elapsed_seconds?: number
  // settled-only
  decided_by?: string
  decided_at?: string
  time_to_decision?: string
  reason?: string
  timeout_effect?: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const PENDING: ApprovalCard[] = [
  {
    id: "apr-001",
    agent_id: "deploy-agent-07",
    tool_name: "kubectl_apply",
    args: 'manifest="prod/api-gateway.yaml", namespace="prod", dry_run=false',
    env: "production",
    status: "pending",
    requested_at: "32s ago",
    ttl_seconds: 300,
    elapsed_seconds: 32,
  },
  {
    id: "apr-002",
    agent_id: "data-pipeline-03",
    tool_name: "db_execute",
    args: 'query="DROP TABLE tmp_migration_2024", database="analytics"',
    env: "production",
    status: "pending",
    requested_at: "2m ago",
    ttl_seconds: 180,
    elapsed_seconds: 120,
  },
  {
    id: "apr-003",
    agent_id: "research-agent-12",
    tool_name: "http_request",
    args: 'url="https://api.stripe.com/v1/charges", method="POST", amount=4999',
    env: "staging",
    status: "pending",
    requested_at: "4m ago",
    ttl_seconds: 300,
    elapsed_seconds: 245,
  },
  {
    id: "apr-004",
    agent_id: "admin-bot",
    tool_name: "file_write",
    args: 'path="/etc/nginx/conf.d/upstream.conf", mode="overwrite"',
    env: "production",
    status: "pending",
    requested_at: "15s ago",
    ttl_seconds: 120,
    elapsed_seconds: 15,
  },
]

const APPROVED: ApprovalCard[] = [
  {
    id: "apr-010",
    agent_id: "deploy-agent-07",
    tool_name: "kubectl_apply",
    args: 'manifest="staging/api-gateway.yaml", namespace="staging"',
    env: "staging",
    status: "approved",
    requested_at: "12m ago",
    decided_by: "admin@acme.com",
    decided_at: "11m ago",
    time_to_decision: "48s",
  },
  {
    id: "apr-011",
    agent_id: "support-agent-02",
    tool_name: "send_email",
    args: 'to="vip@client.com", subject="Escalation: Ticket #8821"',
    env: "production",
    status: "approved",
    requested_at: "25m ago",
    decided_by: "admin@acme.com",
    decided_at: "24m ago",
    time_to_decision: "1m 12s",
  },
  {
    id: "apr-012",
    agent_id: "data-pipeline-03",
    tool_name: "db_execute",
    args: 'query="TRUNCATE staging_events", database="analytics"',
    env: "staging",
    status: "approved",
    requested_at: "1h ago",
    decided_by: "admin@acme.com",
    decided_at: "58m ago",
    time_to_decision: "2m 5s",
  },
  {
    id: "apr-013",
    agent_id: "cleanup-agent-09",
    tool_name: "file_delete",
    args: 'path="/data/exports/batch-*.csv", count=147',
    env: "production",
    status: "approved",
    requested_at: "2h ago",
    decided_by: "admin@acme.com",
    decided_at: "1h 58m ago",
    time_to_decision: "1m 30s",
  },
  {
    id: "apr-014",
    agent_id: "research-agent-12",
    tool_name: "http_request",
    args: 'url="https://api.openai.com/v1/embeddings", method="POST"',
    env: "development",
    status: "approved",
    requested_at: "3h ago",
    decided_by: "admin@acme.com",
    decided_at: "2h 59m ago",
    time_to_decision: "22s",
  },
  {
    id: "apr-015",
    agent_id: "deploy-agent-07",
    tool_name: "helm_upgrade",
    args: 'release="redis", chart="bitnami/redis", values="prod-values.yaml"',
    env: "production",
    status: "approved",
    requested_at: "5h ago",
    decided_by: "admin@acme.com",
    decided_at: "4h 58m ago",
    time_to_decision: "1m 45s",
  },
]

const DENIED: ApprovalCard[] = [
  {
    id: "apr-020",
    agent_id: "research-agent-12",
    tool_name: "http_request",
    args: 'url="https://api.stripe.com/v1/refunds", method="POST", amount=15000',
    env: "production",
    status: "denied",
    requested_at: "18m ago",
    decided_by: "admin@acme.com",
    decided_at: "16m ago",
    time_to_decision: "2m 10s",
    reason: "Refund amount exceeds single-action limit ($100). Requires manual processing.",
  },
  {
    id: "apr-021",
    agent_id: "admin-bot",
    tool_name: "shell_exec",
    args: 'cmd="rm -rf /var/log/archived/*"',
    env: "production",
    status: "denied",
    requested_at: "45m ago",
    decided_by: "admin@acme.com",
    decided_at: "43m ago",
    time_to_decision: "1m 50s",
    reason: "Destructive shell command on production. Use log rotation instead.",
  },
  {
    id: "apr-022",
    agent_id: "data-pipeline-03",
    tool_name: "db_execute",
    args: 'query="ALTER TABLE users DROP COLUMN legacy_auth", database="main"',
    env: "production",
    status: "denied",
    requested_at: "1h ago",
    decided_by: "admin@acme.com",
    decided_at: "58m ago",
    time_to_decision: "2m 30s",
    reason: "Schema migration must go through Alembic. Direct DDL on production is not allowed.",
  },
]

const TIMEOUT: ApprovalCard[] = [
  {
    id: "apr-030",
    agent_id: "monitor-agent-01",
    tool_name: "pagerduty_trigger",
    args: 'severity="critical", summary="DB replica lag >30s"',
    env: "production",
    status: "timeout",
    requested_at: "35m ago",
    ttl_seconds: 120,
    timeout_effect: "Denied (fail-closed). Agent retried with lower severity.",
  },
  {
    id: "apr-031",
    agent_id: "research-agent-12",
    tool_name: "http_request",
    args: 'url="https://api.github.com/repos/acme/core/dispatches", method="POST"',
    env: "staging",
    status: "timeout",
    requested_at: "2h ago",
    ttl_seconds: 300,
    timeout_effect: "Denied (fail-closed). Workflow dispatch skipped.",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envColor(env: ApprovalCard["env"]) {
  switch (env) {
    case "production":
      return "bg-red-500/15 text-red-400 border-red-500/25"
    case "staging":
      return "bg-amber-500/15 text-amber-400 border-amber-500/25"
    case "development":
      return "bg-blue-500/15 text-blue-400 border-blue-500/25"
  }
}

function formatTimeRemaining(elapsed: number, total: number) {
  const remaining = Math.max(total - elapsed, 0)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function timerUrgency(elapsed: number, total: number) {
  const pct = ((total - elapsed) / total) * 100
  if (pct < 20) return "critical" as const
  if (pct < 50) return "warning" as const
  return "safe" as const
}

function timerColors(urgency: "critical" | "warning" | "safe") {
  switch (urgency) {
    case "critical":
      return {
        bar: "bg-red-500",
        text: "text-red-400",
        ring: "ring-red-500/30",
        bg: "bg-red-500/10",
      }
    case "warning":
      return {
        bar: "bg-amber-500",
        text: "text-amber-400",
        ring: "ring-amber-500/20",
        bg: "bg-amber-500/10",
      }
    case "safe":
      return {
        bar: "bg-emerald-500",
        text: "text-emerald-400",
        ring: "ring-emerald-500/20",
        bg: "bg-emerald-500/5",
      }
  }
}

// ---------------------------------------------------------------------------
// Countdown timer with live ticking
// ---------------------------------------------------------------------------

function CountdownTimer({
  elapsed: initialElapsed,
  total,
}: {
  elapsed: number
  total: number
}) {
  const [elapsed, setElapsed] = useState(initialElapsed)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => Math.min(prev + 1, total))
    }, 1000)
    return () => clearInterval(interval)
  }, [total])

  const remaining = Math.max(total - elapsed, 0)
  const pct = (remaining / total) * 100
  const urgency = timerUrgency(elapsed, total)
  const colors = timerColors(urgency)
  const timeStr = formatTimeRemaining(elapsed, total)

  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${colors.bg}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-medium ${colors.text}`}>
        {remaining === 0 ? "EXPIRED" : timeStr}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

function ColumnHeader({
  title,
  count,
  icon,
  colorClass,
}: {
  title: string
  count: number
  icon: React.ReactNode
  colorClass: string
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className={colorClass}>
          {count}
        </Badge>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban cards
// ---------------------------------------------------------------------------

function PendingCard({ card }: { card: ApprovalCard }) {
  const urgency = timerUrgency(card.elapsed_seconds!, card.ttl_seconds!)
  const borderClass =
    urgency === "critical"
      ? "border-red-500/40"
      : urgency === "warning"
        ? "border-amber-500/30"
        : "border-border"

  return (
    <Card className={`${borderClass} gap-0 py-0 group cursor-grab active:cursor-grabbing`}>
      {/* Drag handle hint */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-1.5">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{card.agent_id}</span>
          </div>
        </div>
        <Badge variant="outline" className={envColor(card.env)}>
          {card.env}
        </Badge>
      </div>

      <CardContent className="px-3 py-3">
        {/* Tool + args */}
        <div className="mb-2">
          <p className="text-sm font-semibold text-foreground">{card.tool_name}</p>
          <p className="mt-0.5 text-xs font-mono text-muted-foreground line-clamp-2">
            {card.args}
          </p>
        </div>

        {/* Timer */}
        <div className="mb-3">
          <CountdownTimer
            elapsed={card.elapsed_seconds!}
            total={card.ttl_seconds!}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="size-3" />
            Approve
          </Button>
          <Button size="xs" variant="destructive" className="flex-1">
            <XCircle className="size-3" />
            Deny
          </Button>
        </div>
      </CardContent>

      {/* Footer with timestamp */}
      <div className="border-t border-border/50 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground/60">
          Requested {card.requested_at}
        </span>
      </div>
    </Card>
  )
}

function ApprovedCard({ card }: { card: ApprovalCard }) {
  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.03] gap-0 py-0 group cursor-grab active:cursor-grabbing">
      <div className="flex items-center justify-between border-b border-emerald-500/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-1.5">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{card.agent_id}</span>
          </div>
        </div>
        <Badge variant="outline" className={envColor(card.env)}>
          {card.env}
        </Badge>
      </div>

      <CardContent className="px-3 py-3">
        <p className="text-sm font-medium text-foreground">{card.tool_name}</p>
        <p className="mt-0.5 text-xs font-mono text-muted-foreground line-clamp-1">
          {card.args}
        </p>

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="size-3" />
            <span>{card.decided_by}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{card.time_to_decision}</span>
          </div>
        </div>
      </CardContent>

      <div className="border-t border-emerald-500/10 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">
          {card.decided_at}
        </span>
        <ShieldCheck className="size-3 text-emerald-500/60" />
      </div>
    </Card>
  )
}

function DeniedCard({ card }: { card: ApprovalCard }) {
  return (
    <Card className="border-red-500/20 bg-red-500/[0.03] gap-0 py-0 group cursor-grab active:cursor-grabbing">
      <div className="flex items-center justify-between border-b border-red-500/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-1.5">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{card.agent_id}</span>
          </div>
        </div>
        <Badge variant="outline" className={envColor(card.env)}>
          {card.env}
        </Badge>
      </div>

      <CardContent className="px-3 py-3">
        <p className="text-sm font-medium text-foreground">{card.tool_name}</p>
        <p className="mt-0.5 text-xs font-mono text-muted-foreground line-clamp-1">
          {card.args}
        </p>

        {/* Denial reason */}
        {card.reason && (
          <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5">
            <p className="text-[11px] text-red-400 leading-relaxed">{card.reason}</p>
          </div>
        )}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="size-3" />
            <span>{card.decided_by}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{card.time_to_decision}</span>
          </div>
        </div>
      </CardContent>

      <div className="border-t border-red-500/10 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">
          {card.decided_at}
        </span>
        <ShieldX className="size-3 text-red-500/60" />
      </div>
    </Card>
  )
}

function TimeoutCard({ card }: { card: ApprovalCard }) {
  return (
    <Card className="border-zinc-500/20 bg-zinc-500/[0.03] gap-0 py-0 group cursor-grab active:cursor-grabbing opacity-75">
      <div className="flex items-center justify-between border-b border-zinc-500/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-1.5">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{card.agent_id}</span>
          </div>
        </div>
        <Badge variant="outline" className={envColor(card.env)}>
          {card.env}
        </Badge>
      </div>

      <CardContent className="px-3 py-3">
        <p className="text-sm font-medium text-foreground">{card.tool_name}</p>
        <p className="mt-0.5 text-xs font-mono text-muted-foreground line-clamp-1">
          {card.args}
        </p>

        {/* Timeout info */}
        <div className="mt-2 rounded-md bg-zinc-500/10 px-2 py-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Timer className="size-3 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-400">
              TTL: {card.ttl_seconds}s exceeded
            </span>
          </div>
          {card.timeout_effect && (
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              {card.timeout_effect}
            </p>
          )}
        </div>
      </CardContent>

      <div className="border-t border-zinc-500/10 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">
          {card.requested_at}
        </span>
        <Timer className="size-3 text-zinc-500/60" />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApprovalsV4() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Approvals Queue
            </h1>
            <p className="text-sm text-muted-foreground">
              Agents are blocked waiting for decisions. Timers are ticking.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="bg-amber-500/15 text-amber-400 border-amber-500/25"
            >
              <ShieldAlert className="size-3" />
              {PENDING.length} pending
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
            >
              {APPROVED.length + DENIED.length + TIMEOUT.length} resolved today
            </Badge>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full gap-4 p-4">
          {/* PENDING column — wider, visually prominent */}
          <div className="flex w-[340px] shrink-0 flex-col rounded-lg border-2 border-amber-500/30 bg-amber-500/[0.02]">
            <div className="shrink-0 px-4 pt-4">
              <ColumnHeader
                title="Pending"
                count={PENDING.length}
                icon={<ShieldAlert className="size-4 text-amber-400" />}
                colorClass="bg-amber-500/15 text-amber-400 border-amber-500/25"
              />
              <p className="mb-3 text-[11px] text-amber-400/70">
                Agents blocked — waiting for your decision
              </p>
            </div>
            <ScrollArea className="flex-1 px-4 pb-4">
              <div className="space-y-3">
                {PENDING.map((card) => (
                  <PendingCard key={card.id} card={card} />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* APPROVED column */}
          <div className="flex min-w-[260px] flex-1 flex-col rounded-lg border border-emerald-500/15 bg-emerald-500/[0.01]">
            <div className="shrink-0 px-4 pt-4">
              <ColumnHeader
                title="Approved"
                count={APPROVED.length}
                icon={<ShieldCheck className="size-4 text-emerald-400" />}
                colorClass="bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
              />
            </div>
            <ScrollArea className="flex-1 px-4 pb-4">
              <div className="space-y-2.5">
                {APPROVED.map((card) => (
                  <ApprovedCard key={card.id} card={card} />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* DENIED column */}
          <div className="flex min-w-[260px] flex-1 flex-col rounded-lg border border-red-500/15 bg-red-500/[0.01]">
            <div className="shrink-0 px-4 pt-4">
              <ColumnHeader
                title="Denied"
                count={DENIED.length}
                icon={<ShieldX className="size-4 text-red-400" />}
                colorClass="bg-red-500/15 text-red-400 border-red-500/25"
              />
            </div>
            <ScrollArea className="flex-1 px-4 pb-4">
              <div className="space-y-2.5">
                {DENIED.map((card) => (
                  <DeniedCard key={card.id} card={card} />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* TIMEOUT column */}
          <div className="flex min-w-[220px] flex-1 flex-col rounded-lg border border-zinc-500/15 bg-zinc-500/[0.01]">
            <div className="shrink-0 px-4 pt-4">
              <ColumnHeader
                title="Timeout"
                count={TIMEOUT.length}
                icon={<Timer className="size-4 text-zinc-400" />}
                colorClass="bg-zinc-500/15 text-zinc-400 border-zinc-500/25"
              />
            </div>
            <ScrollArea className="flex-1 px-4 pb-4">
              <div className="space-y-2.5">
                {TIMEOUT.map((card) => (
                  <TimeoutCard key={card.id} card={card} />
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
