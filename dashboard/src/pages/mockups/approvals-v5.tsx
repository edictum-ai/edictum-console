import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Monitor,
  Shield,
  ShieldAlert,
  Terminal,
  Timer,
  X,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingApproval {
  id: string
  agent: string
  tool: string
  toolArgs: Record<string, unknown>
  agentMessage: string
  environment: "production" | "staging" | "development"
  requestedAt: string
  ttlSeconds: number
  remainingSeconds: number
  severity: "critical" | "high" | "normal"
}

interface DecidedApproval {
  id: string
  agent: string
  tool: string
  toolSummary: string
  decision: "approved" | "denied"
  decidedAt: string
  decidedBy: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const initialPending: PendingApproval[] = [
  {
    id: "apr-001",
    agent: "bot-prod-1",
    tool: "exec",
    toolArgs: { command: "deploy prod --force", target: "us-east-1", timeout: 300 },
    agentMessage:
      "Production deployment triggered by upstream dependency update. Rollback plan: revert to v2.8.1.",
    environment: "production",
    requestedAt: "12:04:32",
    ttlSeconds: 120,
    remainingSeconds: 28,
    severity: "critical",
  },
  {
    id: "apr-002",
    agent: "infra-bot-3",
    tool: "write_file",
    toolArgs: { path: "/etc/nginx/upstream.conf", mode: "overwrite", backup: true },
    agentMessage:
      "Updating upstream config to route 30% traffic to canary deployment. Change is reversible.",
    environment: "production",
    requestedAt: "12:03:15",
    ttlSeconds: 180,
    remainingSeconds: 105,
    severity: "high",
  },
  {
    id: "apr-003",
    agent: "billing-agent",
    tool: "mcp_call",
    toolArgs: {
      method: "stripe.charges.create",
      params: { amount: 5000, currency: "usd", customer: "cus_R4x9..." },
    },
    agentMessage:
      "Customer requested immediate charge for overdue invoice #INV-2847. Amount matches invoice total.",
    environment: "production",
    requestedAt: "12:01:48",
    ttlSeconds: 300,
    remainingSeconds: 202,
    severity: "normal",
  },
  {
    id: "apr-004",
    agent: "qa-runner-7",
    tool: "exec",
    toolArgs: { command: "truncate table test_results", database: "staging_analytics" },
    agentMessage: "Clearing stale test data before nightly regression suite. Staging only.",
    environment: "staging",
    requestedAt: "12:00:22",
    ttlSeconds: 300,
    remainingSeconds: 248,
    severity: "normal",
  },
  {
    id: "apr-005",
    agent: "data-pipeline-2",
    tool: "mcp_call",
    toolArgs: {
      method: "s3.deleteObjects",
      params: { bucket: "staging-artifacts", prefix: "tmp/build-*", dryRun: false },
    },
    agentMessage:
      "Cleaning up 847 temporary build artifacts from staging. Total size: 12.3 GB. Retention policy: 7 days.",
    environment: "staging",
    requestedAt: "11:58:10",
    ttlSeconds: 600,
    remainingSeconds: 412,
    severity: "normal",
  },
]

const decidedApprovals: DecidedApproval[] = [
  {
    id: "apr-098",
    agent: "bot-prod-1",
    tool: "exec",
    toolSummary: 'exec("restart service auth-api")',
    decision: "approved",
    decidedAt: "11:52:30",
    decidedBy: "admin@edictum.dev",
  },
  {
    id: "apr-097",
    agent: "billing-agent",
    tool: "mcp_call",
    toolSummary: 'mcp_call("stripe.refunds.create", {amount: 1200})',
    decision: "denied",
    decidedAt: "11:48:15",
    decidedBy: "admin@edictum.dev",
  },
  {
    id: "apr-096",
    agent: "infra-bot-3",
    tool: "write_file",
    toolSummary: 'write_file("/etc/cron.d/cleanup")',
    decision: "approved",
    decidedAt: "11:41:02",
    decidedBy: "admin@edictum.dev",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function timerColor(seconds: number): "red" | "amber" | "green" {
  if (seconds <= 30) return "red"
  if (seconds <= 120) return "amber"
  return "green"
}

function timerClasses(color: "red" | "amber" | "green"): string {
  switch (color) {
    case "red":
      return "text-red-500 dark:text-red-400"
    case "amber":
      return "text-amber-500 dark:text-amber-400"
    case "green":
      return "text-emerald-500 dark:text-emerald-400"
  }
}

function timerBgClasses(color: "red" | "amber" | "green"): string {
  switch (color) {
    case "red":
      return "bg-red-500/10 border-red-500/30 dark:bg-red-500/5 dark:border-red-500/20"
    case "amber":
      return "bg-amber-500/10 border-amber-500/30 dark:bg-amber-500/5 dark:border-amber-500/20"
    case "green":
      return "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/5 dark:border-emerald-500/20"
  }
}

function envBadgeVariant(
  env: "production" | "staging" | "development",
): { label: string; className: string } {
  switch (env) {
    case "production":
      return {
        label: "PROD",
        className:
          "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
      }
    case "staging":
      return {
        label: "STG",
        className:
          "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      }
    case "development":
      return {
        label: "DEV",
        className:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      }
  }
}

function severityIcon(severity: "critical" | "high" | "normal") {
  switch (severity) {
    case "critical":
      return <ShieldAlert className="size-4 text-red-500" />
    case "high":
      return <AlertTriangle className="size-4 text-amber-500" />
    case "normal":
      return <Shield className="size-4 text-muted-foreground" />
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CounterBar({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Timer className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Showing {shown} of {total} pending
          </p>
          <p className="text-xs text-muted-foreground">
            Sorted by urgency — most critical first
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`size-1.5 rounded-full transition-colors ${
              i < shown
                ? "bg-primary"
                : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function TimerDisplay({
  seconds,
  ttl,
}: {
  seconds: number
  ttl: number
}) {
  const color = timerColor(seconds)
  const pct = Math.round((seconds / ttl) * 100)

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${timerBgClasses(color)}`}
    >
      <Clock
        className={`size-4 ${timerClasses(color)} ${
          color === "red" ? "animate-pulse" : ""
        }`}
      />
      <span
        className={`font-mono text-lg font-bold tabular-nums ${timerClasses(color)} ${
          color === "red" ? "animate-pulse" : ""
        }`}
      >
        {formatTimer(seconds)}
      </span>
      <span className="text-xs text-muted-foreground">/ {formatTimer(ttl)}</span>
      <div className="ml-1 h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            color === "red"
              ? "bg-red-500"
              : color === "amber"
                ? "bg-amber-500"
                : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ToolArgsBlock({ args }: { args: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
      {Object.entries(args).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">{key}:</span>
          <span className="text-foreground">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SwipeHint() {
  return (
    <div className="flex items-center justify-center gap-6 py-1 text-xs text-muted-foreground/60">
      <span className="flex items-center gap-1">
        <ArrowLeft className="size-3" />
        deny
      </span>
      <span className="text-muted-foreground/30">|</span>
      <span className="flex items-center gap-1">
        approve
        <ArrowRight className="size-3" />
      </span>
    </div>
  )
}

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: PendingApproval
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}) {
  const color = timerColor(approval.remainingSeconds)
  const env = envBadgeVariant(approval.environment)

  return (
    <Card
      className={`relative overflow-hidden transition-shadow ${
        color === "red"
          ? "shadow-red-500/10 dark:shadow-red-500/5 ring-1 ring-red-500/20"
          : color === "amber"
            ? "shadow-amber-500/5"
            : ""
      }`}
    >
      {/* Urgency accent stripe */}
      <div
        className={`absolute inset-y-0 left-0 w-1 ${
          color === "red"
            ? "bg-red-500"
            : color === "amber"
              ? "bg-amber-500"
              : "bg-emerald-500"
        }`}
      />

      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {severityIcon(approval.severity)}
            <CardTitle className="text-base">
              <span className="font-mono text-primary">{approval.tool}</span>
              <span className="text-muted-foreground">()</span>
            </CardTitle>
            <Badge variant="outline" className={env.className}>
              {env.label}
            </Badge>
          </div>
          <TimerDisplay
            seconds={approval.remainingSeconds}
            ttl={approval.ttlSeconds}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        {/* Agent info */}
        <div className="flex items-center gap-2 text-sm">
          <Bot className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">{approval.agent}</span>
          <span className="text-muted-foreground">requested at {approval.requestedAt}</span>
        </div>

        {/* Tool arguments */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Terminal className="size-3" />
            Arguments
          </div>
          <ToolArgsBlock args={approval.toolArgs} />
        </div>

        {/* Agent message */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <span className="mr-1.5 font-medium text-foreground">Agent says:</span>
          {approval.agentMessage}
        </div>

        <SwipeHint />
      </CardContent>

      <CardFooter className="gap-3 pt-0">
        <Button
          variant="outline"
          size="lg"
          className="flex-1 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          onClick={() => onDeny(approval.id)}
        >
          <X className="mr-2 size-4" />
          Deny
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          onClick={() => onApprove(approval.id)}
        >
          <Check className="mr-2 size-4" />
          Approve
        </Button>
      </CardFooter>
    </Card>
  )
}

function DecidedCard({ item }: { item: DecidedApproval }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
      {item.decision === "approved" ? (
        <Check className="size-4 shrink-0 text-emerald-500" />
      ) : (
        <X className="size-4 shrink-0 text-red-500" />
      )}
      <div className="flex-1 truncate">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.agent}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {item.toolSummary}
          </span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={
          item.decision === "approved"
            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            : "border-red-500/30 text-red-600 dark:text-red-400"
        }
      >
        {item.decision}
      </Badge>
      <span className="shrink-0 text-xs text-muted-foreground">{item.decidedAt}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApprovalsV5() {
  const [pending, setPending] = useState(initialPending)
  const [decided, setDecided] = useState(decidedApprovals)
  const [showDecided, setShowDecided] = useState(true)

  // Countdown timer simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setPending((prev) =>
        prev.map((a) => ({
          ...a,
          remainingSeconds: Math.max(0, a.remainingSeconds - 1),
        })),
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  function handleApprove(id: string) {
    const item = pending.find((a) => a.id === id)
    if (!item) return
    setPending((prev) => prev.filter((a) => a.id !== id))
    setDecided((prev) => [
      {
        id: item.id,
        agent: item.agent,
        tool: item.tool,
        toolSummary: `${item.tool}(${JSON.stringify(Object.values(item.toolArgs)[0])})`,
        decision: "approved",
        decidedAt: new Date().toLocaleTimeString("en-US", { hour12: false }).slice(0, 8),
        decidedBy: "admin@edictum.dev",
      },
      ...prev,
    ])
  }

  function handleDeny(id: string) {
    const item = pending.find((a) => a.id === id)
    if (!item) return
    setPending((prev) => prev.filter((a) => a.id !== id))
    setDecided((prev) => [
      {
        id: item.id,
        agent: item.agent,
        tool: item.tool,
        toolSummary: `${item.tool}(${JSON.stringify(Object.values(item.toolArgs)[0])})`,
        decision: "denied",
        decidedAt: new Date().toLocaleTimeString("en-US", { hour12: false }).slice(0, 8),
        decidedBy: "admin@edictum.dev",
      },
      ...prev,
    ])
  }

  // Sort by urgency: lowest remaining seconds first
  const sorted = [...pending].sort(
    (a, b) => a.remainingSeconds - b.remainingSeconds,
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Monitor className="size-3" />
            View 5: Approvals Queue
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agents are blocked waiting for your decision. Most urgent first.
          </p>
        </div>

        {/* Counter */}
        <div className="mb-4">
          <CounterBar shown={Math.min(sorted.length, 5)} total={sorted.length} />
        </div>

        <Separator className="mb-5" />

        {/* Pending approval cards */}
        <div className="space-y-4">
          {sorted.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Check className="mb-3 size-10 text-emerald-500" />
            <p className="text-lg font-medium text-foreground">All clear</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No pending approvals. All agents are unblocked.
            </p>
          </div>
        )}

        {/* Decided section */}
        {decided.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowDecided(!showDecided)}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDecided ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              Recently decided ({decided.length})
            </button>

            {showDecided && (
              <div className="mt-2 space-y-2">
                {decided.map((item) => (
                  <DecidedCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
