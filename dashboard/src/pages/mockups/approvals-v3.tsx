import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Bot,
  Check,
  CheckCircle,
  Clock,
  FileText,
  Hourglass,
  Shield,
  Timer,
  X,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApprovalStatus = "pending" | "approved" | "denied" | "timeout"

interface Approval {
  id: string
  agent: string
  tool: string
  argsPreview: string
  argsFull: Record<string, unknown>
  message: string
  contract: string
  requestedAt: string
  status: ApprovalStatus
  countdownSeconds: number
  totalSeconds: number
  decidedBy?: string
  decidedAt?: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const APPROVALS: Approval[] = [
  {
    id: "apr-001",
    agent: "billing-agent",
    tool: "stripe.charges.create",
    argsPreview: "{amount: 20000, currency: usd}",
    argsFull: {
      amount: 20000,
      currency: "usd",
      customer: "cus_123",
      description: "Monthly billing - Premium Plan",
      metadata: { invoice_id: "inv_2026_02_0847", plan: "premium" },
    },
    message: "Process monthly billing for premium customer",
    contract: "billing-contract-v2",
    requestedAt: "4m 42s ago",
    status: "pending",
    countdownSeconds: 138,
    totalSeconds: 420,
  },
  {
    id: "apr-002",
    agent: "research-agent",
    tool: "send_email",
    argsPreview: '{to: "ceo@acme.co", subject: "Q4 Report"}',
    argsFull: {
      to: "ceo@acme.co",
      subject: "Q4 Earnings Report Summary",
      body: "Please find attached the Q4 earnings summary...",
      attachments: ["q4_report_2025.pdf"],
    },
    message: "Sending quarterly earnings summary to executive team",
    contract: "comms-contract-v1",
    requestedAt: "2m 18s ago",
    status: "pending",
    countdownSeconds: 282,
    totalSeconds: 420,
  },
  {
    id: "apr-003",
    agent: "cleanup-agent",
    tool: "delete_records",
    argsPreview: '{table: "user_sessions", where: "age > 90d"}',
    argsFull: {
      table: "user_sessions",
      where: "age > 90d",
      estimated_count: 12480,
      dry_run: false,
    },
    message: "Purge stale sessions older than 90 days per retention policy",
    contract: "data-hygiene-v3",
    requestedAt: "6m 55s ago",
    status: "pending",
    countdownSeconds: 65,
    totalSeconds: 420,
  },
  {
    id: "apr-004",
    agent: "ops-agent",
    tool: "deploy_service",
    argsPreview: '{service: "api-gateway", version: "2.4.1"}',
    argsFull: {
      service: "api-gateway",
      version: "2.4.1",
      environment: "production",
      rolling: true,
      health_check_timeout: 30,
    },
    message: "Rolling deployment of api-gateway hotfix for CVE-2026-1234",
    contract: "deploy-contract-v1",
    requestedAt: "1m 05s ago",
    status: "pending",
    countdownSeconds: 355,
    totalSeconds: 420,
  },
  {
    id: "apr-005",
    agent: "data-agent",
    tool: "export_csv",
    argsPreview: '{table: "orders", limit: 50000}',
    argsFull: {
      table: "orders",
      limit: 50000,
      format: "csv",
      destination: "s3://exports/orders_2026_02.csv",
    },
    message: "Monthly order export for finance team reconciliation",
    contract: "data-export-v2",
    requestedAt: "8m 12s ago",
    status: "pending",
    countdownSeconds: 28,
    totalSeconds: 300,
  },
  {
    id: "apr-006",
    agent: "support-agent",
    tool: "refund_payment",
    argsPreview: "{amount: 4999, reason: defective}",
    argsFull: {
      amount: 4999,
      currency: "usd",
      payment_id: "pay_abc123",
      reason: "defective",
      ticket_id: "SUPPORT-4821",
    },
    message: "Customer refund for defective product per ticket #4821",
    contract: "billing-contract-v2",
    requestedAt: "30s ago",
    status: "pending",
    countdownSeconds: 390,
    totalSeconds: 420,
  },
  {
    id: "apr-007",
    agent: "ops-agent",
    tool: "restart_service",
    argsPreview: '{service: "worker-3"}',
    argsFull: {
      service: "worker-3",
      reason: "high memory usage",
      graceful: true,
    },
    message: "Graceful restart of worker-3 due to memory leak",
    contract: "deploy-contract-v1",
    requestedAt: "22m ago",
    status: "approved",
    countdownSeconds: 0,
    totalSeconds: 420,
    decidedBy: "admin@edictum.dev",
    decidedAt: "18m ago",
  },
  {
    id: "apr-008",
    agent: "intern-agent",
    tool: "execute_sql",
    argsPreview: '{query: "DROP TABLE temp_users"}',
    argsFull: {
      query: "DROP TABLE temp_users",
      database: "production",
    },
    message: "Attempting to clean up temporary table",
    contract: "data-hygiene-v3",
    requestedAt: "35m ago",
    status: "denied",
    countdownSeconds: 0,
    totalSeconds: 420,
    decidedBy: "admin@edictum.dev",
    decidedAt: "34m ago",
  },
  {
    id: "apr-009",
    agent: "research-agent",
    tool: "web_scrape",
    argsPreview: '{url: "https://competitor.com/pricing"}',
    argsFull: {
      url: "https://competitor.com/pricing",
      depth: 2,
      extract: ["pricing_table", "plan_names"],
    },
    message: "Competitive pricing analysis for Q1 strategy",
    contract: "comms-contract-v1",
    requestedAt: "1h ago",
    status: "timeout",
    countdownSeconds: 0,
    totalSeconds: 420,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function countdownColor(seconds: number, total: number): string {
  const ratio = seconds / total
  if (ratio > 0.5) return "text-emerald-400"
  if (ratio > 0.15) return "text-amber-400"
  return "text-red-400"
}

function countdownBg(seconds: number, total: number): string {
  const ratio = seconds / total
  if (ratio > 0.5) return "bg-emerald-500/15"
  if (ratio > 0.15) return "bg-amber-500/15"
  return "bg-red-500/15"
}

function statusBadge(status: ApprovalStatus) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      )
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
          <CheckCircle className="h-3 w-3" />
          Approved
        </span>
      )
    case "denied":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
          <XCircle className="h-3 w-3" />
          Denied
        </span>
      )
    case "timeout":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-zinc-400">
          <Timer className="h-3 w-3" />
          Timeout
        </span>
      )
  }
}

// ---------------------------------------------------------------------------
// List item component
// ---------------------------------------------------------------------------

function ApprovalListItem({
  approval,
  isSelected,
  onSelect,
}: {
  approval: Approval
  isSelected: boolean
  onSelect: () => void
}) {
  const isPending = approval.status === "pending"
  const isResolved = !isPending

  return (
    <button
      onClick={onSelect}
      className={`
        relative w-full text-left transition-colors
        ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}
        ${isResolved ? "opacity-60" : ""}
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}

      <div className="px-4 py-3">
        {/* Top row: agent + status + countdown */}
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {approval.agent}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isPending && (
              <span
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono font-semibold tabular-nums ${countdownBg(approval.countdownSeconds, approval.totalSeconds)} ${countdownColor(approval.countdownSeconds, approval.totalSeconds)}`}
              >
                <Hourglass className="h-3 w-3" />
                {formatCountdown(approval.countdownSeconds)}
              </span>
            )}
            {isResolved && statusBadge(approval.status)}
          </div>
        </div>

        {/* Tool call */}
        <div className="mt-1 flex items-center gap-1.5">
          <code className="text-xs font-medium text-foreground">
            {approval.tool}
          </code>
        </div>

        {/* Args preview */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {approval.argsPreview}
        </p>

        {/* Timestamp */}
        <span className="mt-1 block text-[11px] text-muted-foreground/60">
          {approval.requestedAt}
        </span>
      </div>

      <Separator />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Detail panel component
// ---------------------------------------------------------------------------

function ApprovalDetail({ approval }: { approval: Approval }) {
  const isPending = approval.status === "pending"

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">
              Approval Request
            </h2>
            <p className="text-sm text-muted-foreground">
              {approval.agent} is blocked waiting for a decision
            </p>
          </div>
          {statusBadge(approval.status)}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 px-6 py-5">
          {/* Countdown timer - prominent */}
          {isPending && (
            <Card
              className={`border ${
                approval.countdownSeconds / approval.totalSeconds > 0.15
                  ? "border-amber-500/30"
                  : "border-red-500/30"
              }`}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${countdownBg(approval.countdownSeconds, approval.totalSeconds)}`}
                >
                  <Hourglass
                    className={`h-6 w-6 ${countdownColor(approval.countdownSeconds, approval.totalSeconds)}`}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Time Remaining
                  </p>
                  <p
                    className={`text-3xl font-bold tabular-nums ${countdownColor(approval.countdownSeconds, approval.totalSeconds)}`}
                  >
                    {formatCountdown(approval.countdownSeconds)}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">
                    Agent blocked for
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {approval.requestedAt}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resolved info */}
          {!isPending && approval.decidedBy && (
            <Card className="border-border">
              <CardContent className="flex items-center gap-4 p-4">
                {approval.status === "approved" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  </div>
                ) : approval.status === "denied" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                    <XCircle className="h-5 w-5 text-red-400" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-500/15">
                    <Timer className="h-5 w-5 text-zinc-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {approval.status === "approved"
                      ? "Approved"
                      : approval.status === "denied"
                        ? "Denied"
                        : "Timed Out"}{" "}
                    by {approval.decidedBy}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {approval.decidedAt}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agent message */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Agent Message
            </h3>
            <p className="text-sm leading-relaxed text-foreground">
              {approval.message}
            </p>
          </div>

          <Separator />

          {/* Tool call info */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tool Call
            </h3>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-semibold text-foreground">
                {approval.tool}
              </code>
              <Badge variant="outline" className="font-mono text-xs">
                <Bot className="mr-1 h-3 w-3" />
                {approval.agent}
              </Badge>
            </div>
          </div>

          {/* Tool arguments - structured key-value */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Arguments
            </h3>
            <div className="rounded-lg border border-border bg-muted/30">
              {Object.entries(approval.argsFull).map(
                ([key, value], i, arr) => (
                  <div
                    key={key}
                    className={`flex items-start gap-3 px-4 py-2.5 ${
                      i < arr.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
                      {key}
                    </span>
                    <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          <Separator />

          {/* Context */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Decision Context
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Contract</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {approval.contract}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requested</p>
                <p className="mt-1 text-sm text-foreground">
                  {approval.requestedAt}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Action buttons - fixed at bottom */}
      {isPending && (
        <div className="border-t border-border bg-card/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              <Check className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <X className="mr-2 h-4 w-4" />
              Deny
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <Shield className="mb-3 h-10 w-10 opacity-30" />
      <p className="text-sm">Select an approval to review</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ApprovalsV3() {
  const [selectedId, setSelectedId] = useState<string>("apr-001")
  const [filter, setFilter] = useState<"pending" | "all">("pending")

  const pendingApprovals = APPROVALS.filter((a) => a.status === "pending")
  const filteredApprovals =
    filter === "pending" ? pendingApprovals : APPROVALS

  const selected = APPROVALS.find((a) => a.id === selectedId)

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-4 border-b border-border bg-card/50 px-6 py-3">
        <Shield className="h-4 w-4 text-amber-400" />
        <h1 className="text-sm font-semibold text-foreground">
          Approvals Queue
        </h1>
        <div className="mx-2 h-4 w-px bg-border" />

        {/* Pending count */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-xs font-bold tabular-nums text-amber-400">
            {pendingApprovals.length}
          </span>
          <span className="text-xs text-muted-foreground">
            agents blocked
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — approval list */}
        <div className="flex w-[35%] min-w-[300px] flex-col border-r border-border">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 border-b border-border bg-card/30 px-3 py-2">
            <button
              onClick={() => setFilter("pending")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === "pending"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Pending
              <span
                className={`tabular-nums ${
                  filter === "pending"
                    ? "text-primary/70"
                    : "text-muted-foreground/60"
                }`}
              >
                {pendingApprovals.length}
              </span>
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              All
              <span
                className={`tabular-nums ${
                  filter === "all"
                    ? "text-primary/70"
                    : "text-muted-foreground/60"
                }`}
              >
                {APPROVALS.length}
              </span>
            </button>
          </div>

          {/* Scrollable list */}
          <ScrollArea className="flex-1">
            {filteredApprovals.map((approval) => (
              <ApprovalListItem
                key={approval.id}
                approval={approval}
                isSelected={approval.id === selectedId}
                onSelect={() => setSelectedId(approval.id)}
              />
            ))}

            {filteredApprovals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle className="mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">No pending approvals</p>
                <p className="text-xs">All agents are unblocked</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right column — detail panel */}
        <div className="flex-1 bg-background">
          {selected ? <ApprovalDetail approval={selected} /> : <EmptyDetail />}
        </div>
      </div>
    </div>
  )
}
