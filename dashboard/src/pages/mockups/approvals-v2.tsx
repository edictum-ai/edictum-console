import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Filter,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Approval {
  id: string
  agent: string
  agentId: string
  tool: string
  toolArgs: Record<string, unknown>
  message: string
  requestedAt: string
  requestedAtFull: string
  ttlSeconds: number
  elapsedSeconds: number
  severity: "critical" | "high" | "normal"
  status: "pending" | "approved" | "denied" | "timeout"
  contractVersion: string
  decidedBy?: string
  decidedAt?: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const PENDING_APPROVALS: Approval[] = [
  {
    id: "apr-001",
    agent: "deploy-agent-07",
    agentId: "agt_7f3a2b",
    tool: "kubectl_apply",
    toolArgs: {
      manifest: "production/api-gateway.yaml",
      namespace: "prod",
      dry_run: false,
      replicas: 3,
      image: "registry.internal/api-gw:v2.4.1",
    },
    message:
      "Deploying api-gateway v2.4.1 to production. This updates the ingress rules and scales to 3 replicas. Previous version: v2.3.8.",
    requestedAt: "32s ago",
    requestedAtFull: "2026-02-27T14:32:18Z",
    ttlSeconds: 300,
    elapsedSeconds: 32,
    severity: "critical",
    status: "pending",
    contractVersion: "v2.4.1",
  },
  {
    id: "apr-002",
    agent: "data-pipeline-03",
    agentId: "agt_9c1e4d",
    tool: "db_execute",
    toolArgs: {
      query: "DROP TABLE tmp_migration_2024",
      database: "analytics",
      timeout_ms: 30000,
    },
    message:
      "Cleaning up temporary migration table from 2024 data migration. Table has 0 rows — migration completed successfully.",
    requestedAt: "2m ago",
    requestedAtFull: "2026-02-27T14:30:42Z",
    ttlSeconds: 180,
    elapsedSeconds: 120,
    severity: "high",
    status: "pending",
    contractVersion: "v1.8.0",
  },
  {
    id: "apr-003",
    agent: "research-agent-12",
    agentId: "agt_2f8b7a",
    tool: "http_request",
    toolArgs: {
      url: "https://api.stripe.com/v1/charges",
      method: "POST",
      amount: 4999,
      currency: "usd",
      customer: "cus_R4nD0m1D",
      description: "Pro plan upgrade — annual billing",
    },
    message:
      "Creating Stripe charge for customer pro plan upgrade. Customer requested annual billing switch from monthly.",
    requestedAt: "4m ago",
    requestedAtFull: "2026-02-27T14:28:55Z",
    ttlSeconds: 300,
    elapsedSeconds: 245,
    severity: "critical",
    status: "pending",
    contractVersion: "v1.2.0",
  },
  {
    id: "apr-004",
    agent: "support-agent-02",
    agentId: "agt_5d3f1c",
    tool: "send_email",
    toolArgs: {
      to: "enterprise-client@megacorp.com",
      subject: "Re: Incident #4521 — Resolution Summary",
      template: "incident_resolution",
      attachments: ["postmortem_4521.pdf"],
    },
    message:
      "Sending incident resolution summary to enterprise client. Incident involved 12-minute API outage. SLA credit applied.",
    requestedAt: "5m ago",
    requestedAtFull: "2026-02-27T14:27:33Z",
    ttlSeconds: 600,
    elapsedSeconds: 300,
    severity: "normal",
    status: "pending",
    contractVersion: "v3.1.0",
  },
  {
    id: "apr-005",
    agent: "cleanup-agent-09",
    agentId: "agt_8a2c6e",
    tool: "file_delete",
    toolArgs: {
      path: "/data/exports/batch-2024-02-*.csv",
      count: 147,
      total_size_mb: 2340,
    },
    message:
      "Batch delete of 147 export CSV files from February 2024. Total size 2.3 GB. Retention policy: 12 months.",
    requestedAt: "8m ago",
    requestedAtFull: "2026-02-27T14:24:11Z",
    ttlSeconds: 900,
    elapsedSeconds: 480,
    severity: "high",
    status: "pending",
    contractVersion: "v1.0.0",
  },
  {
    id: "apr-006",
    agent: "deploy-agent-03",
    agentId: "agt_4b9d2f",
    tool: "kubectl_apply",
    toolArgs: {
      manifest: "staging/redis-cluster.yaml",
      namespace: "staging",
      dry_run: false,
    },
    message: "Deploying Redis cluster config update to staging. Increases memory limit from 2Gi to 4Gi.",
    requestedAt: "10m ago",
    requestedAtFull: "2026-02-27T14:22:05Z",
    ttlSeconds: 300,
    elapsedSeconds: 120,
    severity: "normal",
    status: "pending",
    contractVersion: "v2.4.1",
  },
  {
    id: "apr-007",
    agent: "research-agent-08",
    agentId: "agt_1c7e3a",
    tool: "http_request",
    toolArgs: {
      url: "https://api.openai.com/v1/fine-tuning/jobs",
      method: "POST",
      model: "gpt-4o-mini",
      training_file: "file-abc123",
    },
    message:
      "Starting fine-tuning job on GPT-4o-mini with curated training data. Estimated cost: $12.40.",
    requestedAt: "12m ago",
    requestedAtFull: "2026-02-27T14:20:38Z",
    ttlSeconds: 600,
    elapsedSeconds: 150,
    severity: "normal",
    status: "pending",
    contractVersion: "v1.2.0",
  },
  {
    id: "apr-008",
    agent: "monitor-agent-01",
    agentId: "agt_6f4a8b",
    tool: "exec",
    toolArgs: {
      command: "pg_dump",
      args: "--format=custom --compress=9 --file=/backups/analytics-2026-02-27.dump analytics",
      timeout: 3600,
    },
    message:
      "Scheduled daily backup of analytics database. Compressed custom format. Previous backup: 26 hours ago.",
    requestedAt: "15m ago",
    requestedAtFull: "2026-02-27T14:17:22Z",
    ttlSeconds: 1800,
    elapsedSeconds: 900,
    severity: "normal",
    status: "pending",
    contractVersion: "v1.0.0",
  },
]

const APPROVED_APPROVALS: Approval[] = [
  {
    id: "apr-101",
    agent: "deploy-agent-07",
    agentId: "agt_7f3a2b",
    tool: "kubectl_apply",
    toolArgs: { manifest: "staging/api-gateway.yaml", namespace: "staging", dry_run: false },
    message: "Staging deployment of api-gateway v2.4.1 before production rollout.",
    requestedAt: "45m ago",
    requestedAtFull: "2026-02-27T13:47:00Z",
    ttlSeconds: 300,
    elapsedSeconds: 300,
    severity: "high",
    status: "approved",
    contractVersion: "v2.4.1",
    decidedBy: "admin@edictum.dev",
    decidedAt: "43m ago",
  },
  {
    id: "apr-102",
    agent: "support-agent-02",
    agentId: "agt_5d3f1c",
    tool: "send_email",
    toolArgs: { to: "vip@enterprise.com", subject: "Weekly Report" },
    message: "Weekly status report to VIP enterprise account.",
    requestedAt: "1h ago",
    requestedAtFull: "2026-02-27T13:32:00Z",
    ttlSeconds: 600,
    elapsedSeconds: 600,
    severity: "normal",
    status: "approved",
    contractVersion: "v3.1.0",
    decidedBy: "admin@edictum.dev",
    decidedAt: "58m ago",
  },
]

const DENIED_APPROVALS: Approval[] = [
  {
    id: "apr-201",
    agent: "research-agent-12",
    agentId: "agt_2f8b7a",
    tool: "http_request",
    toolArgs: { url: "https://api.stripe.com/v1/refunds", method: "POST", charge: "ch_xxx", amount: 9999 },
    message: "Attempting to process refund for disputed charge.",
    requestedAt: "2h ago",
    requestedAtFull: "2026-02-27T12:32:00Z",
    ttlSeconds: 300,
    elapsedSeconds: 300,
    severity: "critical",
    status: "denied",
    contractVersion: "v1.2.0",
    decidedBy: "admin@edictum.dev",
    decidedAt: "2h ago",
  },
]

const TIMEOUT_APPROVALS: Approval[] = [
  {
    id: "apr-301",
    agent: "cleanup-agent-09",
    agentId: "agt_8a2c6e",
    tool: "file_delete",
    toolArgs: { path: "/data/logs/2023-*.gz", count: 892 },
    message: "Bulk delete of 2023 archived logs. No operator responded within TTL.",
    requestedAt: "6h ago",
    requestedAtFull: "2026-02-27T08:32:00Z",
    ttlSeconds: 900,
    elapsedSeconds: 900,
    severity: "high",
    status: "timeout",
    contractVersion: "v1.0.0",
  },
  {
    id: "apr-302",
    agent: "deploy-agent-03",
    agentId: "agt_4b9d2f",
    tool: "kubectl_apply",
    toolArgs: { manifest: "staging/worker.yaml", namespace: "staging" },
    message: "Worker deployment timed out waiting for approval overnight.",
    requestedAt: "14h ago",
    requestedAtFull: "2026-02-27T00:15:00Z",
    ttlSeconds: 300,
    elapsedSeconds: 300,
    severity: "normal",
    status: "timeout",
    contractVersion: "v2.4.1",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTTL(elapsed: number, total: number): string {
  const remaining = Math.max(total - elapsed, 0)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function ttlUrgency(elapsed: number, total: number): "safe" | "warning" | "danger" {
  const pct = ((total - elapsed) / total) * 100
  if (pct < 20) return "danger"
  if (pct < 50) return "warning"
  return "safe"
}

const ttlColors = {
  safe: { bar: "bg-emerald-500", text: "text-emerald-400", pulse: false },
  warning: { bar: "bg-amber-500", text: "text-amber-400", pulse: false },
  danger: { bar: "bg-red-500", text: "text-red-400", pulse: true },
}

function TTLCountdown({ elapsed, total }: { elapsed: number; total: number }) {
  const remaining = Math.max(total - elapsed, 0)
  const pct = (remaining / total) * 100
  const urgency = ttlUrgency(elapsed, total)
  const colors = ttlColors[urgency]

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-xs ${colors.text} ${colors.pulse ? "animate-pulse" : ""}`}
      >
        {formatTTL(elapsed, total)}
      </span>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: Approval["severity"] }) {
  const config = {
    critical: {
      label: "Critical",
      className: "bg-red-500/15 text-red-400 border-red-500/25",
    },
    high: {
      label: "High",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    },
    normal: {
      label: "Normal",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    },
  }
  const c = config[severity]

  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: Approval["status"] }) {
  const config = {
    pending: {
      label: "Pending",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      icon: <Clock className="size-3" />,
    },
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
    timeout: {
      label: "Timeout",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      icon: <Timer className="size-3" />,
    },
  }
  const c = config[status]

  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Expanded Row Detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ approval }: { approval: Approval }) {
  return (
    <div className="border-t border-border/50 bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Tool Arguments */}
        <div className="col-span-2 space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tool Arguments</span>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
              {JSON.stringify(approval.toolArgs, null, 2)}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Agent Message</span>
            </div>
            <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground leading-relaxed">
              {approval.message}
            </p>
          </div>
        </div>

        {/* Right: Context + Actions */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-3">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Request Context
            </h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agent</dt>
                <dd className="font-medium">{approval.agent}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agent ID</dt>
                <dd className="font-mono text-xs">{approval.agentId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Contract</dt>
                <dd className="font-mono text-xs">{approval.contractVersion}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Requested</dt>
                <dd className="text-xs">{approval.requestedAtFull}</dd>
              </div>
              {approval.status === "pending" && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">TTL</dt>
                  <dd>
                    <TTLCountdown elapsed={approval.elapsedSeconds} total={approval.ttlSeconds} />
                  </dd>
                </div>
              )}
              {approval.decidedBy && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Decided by</dt>
                    <dd className="text-xs">{approval.decidedBy}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Decided</dt>
                    <dd className="text-xs">{approval.decidedAt}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {approval.status === "pending" && (
            <div className="flex gap-2">
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="size-4" />
                Approve
              </Button>
              <Button variant="destructive" className="flex-1">
                <XCircle className="size-4" />
                Deny
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approval Table Row
// ---------------------------------------------------------------------------

function ApprovalRow({
  approval,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
}: {
  approval: Approval
  expanded: boolean
  selected: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
}) {
  const isPending = approval.status === "pending"

  return (
    <>
      <TableRow
        className={`cursor-pointer ${expanded ? "bg-muted/30 border-b-0" : ""} ${
          selected ? "bg-primary/5" : ""
        }`}
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          {isPending && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="size-4 rounded border-border accent-primary"
            />
          )}
        </TableCell>

        {/* Expand indicator */}
        <TableCell className="w-8 px-0">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>

        {/* Severity */}
        <TableCell className="w-24">
          <SeverityBadge severity={approval.severity} />
        </TableCell>

        {/* Agent */}
        <TableCell>
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <span className="font-medium">{approval.agent}</span>
          </div>
        </TableCell>

        {/* Tool */}
        <TableCell>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {approval.tool}
          </code>
        </TableCell>

        {/* Args preview */}
        <TableCell className="max-w-[200px]">
          <span className="truncate block font-mono text-xs text-muted-foreground">
            {Object.entries(approval.toolArgs)
              .slice(0, 2)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")}
            {Object.keys(approval.toolArgs).length > 2 && " ..."}
          </span>
        </TableCell>

        {/* Time / TTL */}
        <TableCell className="w-40">
          {isPending ? (
            <TTLCountdown elapsed={approval.elapsedSeconds} total={approval.ttlSeconds} />
          ) : (
            <span className="text-xs text-muted-foreground">{approval.requestedAt}</span>
          )}
        </TableCell>

        {/* Status / Actions */}
        <TableCell className="w-40">
          {isPending ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button size="xs" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="size-3" />
                Approve
              </Button>
              <Button size="xs" variant="destructive">
                <XCircle className="size-3" />
                Deny
              </Button>
            </div>
          ) : (
            <StatusBadge status={approval.status} />
          )}
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <ExpandedDetail approval={approval} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApprovalsV2() {
  const [expandedId, setExpandedId] = useState<string | null>("apr-001")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("pending")

  const tabData = {
    pending: PENDING_APPROVALS,
    approved: APPROVED_APPROVALS,
    denied: DENIED_APPROVALS,
    timeout: TIMEOUT_APPROVALS,
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (activeTab !== "pending") return
    const pendingIds = PENDING_APPROVALS.map((a) => a.id)
    const allSelected = pendingIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingIds))
    }
  }

  const selectedCount = selectedIds.size
  const allPendingSelected =
    activeTab === "pending" &&
    PENDING_APPROVALS.length > 0 &&
    PENDING_APPROVALS.every((a) => selectedIds.has(a.id))

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Approvals Queue</h1>
          <p className="text-sm text-muted-foreground">
            Agents blocked waiting for human approval
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="size-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Search className="size-4" />
            Search
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card className="border-amber-500/40 py-4">
          <CardContent className="flex items-center gap-3 px-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <ShieldAlert className="size-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold tracking-tight">{PENDING_APPROVALS.length}</p>
              <p className="text-xs text-muted-foreground">
                {PENDING_APPROVALS.filter((a) => a.severity === "critical").length} critical
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="flex items-center gap-3 px-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
              <Timer className="size-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expiring Soon</p>
              <p className="text-xl font-bold tracking-tight text-red-400">
                {PENDING_APPROVALS.filter((a) => ttlUrgency(a.elapsedSeconds, a.ttlSeconds) === "danger").length}
              </p>
              <p className="text-xs text-muted-foreground">under 20% TTL</p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="flex items-center gap-3 px-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
              <ShieldCheck className="size-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approved Today</p>
              <p className="text-xl font-bold tracking-tight">23</p>
              <p className="text-xs text-muted-foreground">avg response 1m 12s</p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardContent className="flex items-center gap-3 px-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-500/15">
              <Clock className="size-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Response Time</p>
              <p className="text-xl font-bold tracking-tight">1m 12s</p>
              <p className="text-xs text-muted-foreground">last 24h</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="size-4" />
            Approve All ({selectedCount})
          </Button>
          <Button size="sm" variant="destructive">
            <XCircle className="size-4" />
            Deny All ({selectedCount})
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Main table card */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">All Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setExpandedId(null) }}>
            <TabsList variant="line" className="mb-4">
              <TabsTrigger value="pending">
                Pending
                <Badge
                  variant="outline"
                  className="ml-1 h-4 px-1.5 text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/25"
                >
                  {PENDING_APPROVALS.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  23
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="denied">
                Denied
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  5
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="timeout">
                Timeout
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  2
                </Badge>
              </TabsTrigger>
            </TabsList>

            {(["pending", "approved", "denied", "timeout"] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">
                        {tab === "pending" && (
                          <input
                            type="checkbox"
                            checked={allPendingSelected}
                            onChange={toggleSelectAll}
                            className="size-4 rounded border-border accent-primary"
                          />
                        )}
                      </TableHead>
                      <TableHead className="w-8 px-0" />
                      <TableHead className="w-24">Severity</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Tool</TableHead>
                      <TableHead>Arguments</TableHead>
                      <TableHead className="w-40">
                        {tab === "pending" ? "TTL" : "Requested"}
                      </TableHead>
                      <TableHead className="w-40">
                        {tab === "pending" ? "Actions" : "Status"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabData[tab].map((approval) => (
                      <ApprovalRow
                        key={approval.id}
                        approval={approval}
                        expanded={expandedId === approval.id}
                        selected={selectedIds.has(approval.id)}
                        onToggleExpand={() => toggleExpand(approval.id)}
                        onToggleSelect={() => toggleSelect(approval.id)}
                      />
                    ))}
                    {tabData[tab].length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="size-8 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">
                              No {tab} approvals
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
