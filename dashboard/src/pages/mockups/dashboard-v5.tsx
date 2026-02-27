import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle2,
  ShieldQuestion,
  AlertTriangle,
  ArrowRight,
  Activity,
  ScrollText,
  FileCheck,
  KeyRound,
  Clock,
  Bot,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface TriageItem {
  id: string
  type: "approval" | "alert"
  title: string
  agent: string
  tool: string
  args: Record<string, string>
  timestamp: string
  timeAgo: string
}

const triageItems: TriageItem[] = [
  {
    id: "apr-0041",
    type: "approval",
    title: "Tool execution requires approval",
    agent: "research-agent-01",
    tool: "web_search",
    args: { query: "SEC 10-K filings AAPL 2025", max_results: "20" },
    timestamp: "2026-02-27T14:32:00Z",
    timeAgo: "3m ago",
  },
  {
    id: "apr-0040",
    type: "approval",
    title: "Tool execution requires approval",
    agent: "data-pipeline-03",
    tool: "db_write",
    args: { table: "financial_reports", operation: "INSERT", rows: "847" },
    timestamp: "2026-02-27T14:28:00Z",
    timeAgo: "7m ago",
  },
  {
    id: "alert-012",
    type: "alert",
    title: "Agent exceeded denial threshold",
    agent: "support-bot-02",
    tool: "send_email",
    args: { denials: "5", threshold: "3", window: "1h" },
    timestamp: "2026-02-27T14:15:00Z",
    timeAgo: "20m ago",
  },
]

const quickStats = {
  agents: 5,
  events24h: 230,
  denials: 2,
}

interface NavCard {
  label: string
  description: string
  icon: React.ElementType
  count?: number
  countLabel?: string
}

const navCards: NavCard[] = [
  {
    label: "Events",
    description: "Audit trail",
    icon: Activity,
    count: 230,
    countLabel: "24h",
  },
  {
    label: "Approvals",
    description: "Review queue",
    icon: ShieldQuestion,
    count: 2,
    countLabel: "pending",
  },
  {
    label: "Contracts",
    description: "Governance rules",
    icon: FileCheck,
  },
  {
    label: "API Keys",
    description: "Agent credentials",
    icon: KeyRound,
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    allowed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    denied: "bg-red-500/15 text-red-600 dark:text-red-400",
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    timeout: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  }
  return (
    <Badge variant="outline" className={styles[verdict] ?? styles.pending}>
      {verdict}
    </Badge>
  )
}

function TriageItemCard({ item }: { item: TriageItem }) {
  const isApproval = item.type === "approval"

  return (
    <div className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-amber-500/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
              isApproval
                ? "bg-amber-500/10 text-amber-500"
                : "bg-red-500/10 text-red-500"
            }`}
          >
            {isApproval ? (
              <ShieldQuestion className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {item.title}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="size-3" />
              <span className="font-mono">{item.agent}</span>
              <span className="text-border">|</span>
              <Clock className="size-3" />
              <span>{item.timeAgo}</span>
            </div>
          </div>
        </div>
        <VerdictBadge verdict="pending" />
      </div>

      {/* Tool + arguments — shown prominently */}
      <div className="mt-3 ml-11 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tool
          </span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
            {item.tool}
          </code>
        </div>
        <div className="rounded-md border border-border bg-muted/50 p-3">
          <div className="grid gap-1.5">
            {Object.entries(item.args).map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-muted-foreground">
                  {key}:
                </span>
                <span className="font-mono text-foreground break-all">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        {isApproval && (
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Approve
            </Button>
            <Button size="sm" variant="outline" className="text-red-500 border-red-500/30 hover:bg-red-500/10">
              Deny
            </Button>
          </div>
        )}
        {!isApproval && (
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline">
              View Agent
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground">
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function AllClearState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 mb-5">
        <CheckCircle2 className="size-8 text-emerald-500" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        All clear
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-8">
        No items need your attention. All agents are operating within their
        governance contracts.
      </p>

      {/* Quick stats in all-clear state */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground">
            {quickStats.agents}
          </p>
          <p className="text-xs text-muted-foreground">Active agents</p>
        </div>
        <Separator orientation="vertical" className="h-10" />
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground">
            {quickStats.events24h}
          </p>
          <p className="text-xs text-muted-foreground">Events (24h)</p>
        </div>
        <Separator orientation="vertical" className="h-10" />
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground">
            {quickStats.denials}
          </p>
          <p className="text-xs text-muted-foreground">Denials (24h)</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardV5MinimalTriage() {
  const [showPending, setShowPending] = useState(true)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Home
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {showPending
            ? `${triageItems.length} items need your attention`
            : "Everything is running smoothly"}
        </p>
      </div>

      {/* Demo toggle */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          Demo:
        </span>
        <Switch
          checked={showPending}
          onCheckedChange={setShowPending}
          size="sm"
        />
        <span className="text-xs text-muted-foreground">
          {showPending ? "Pending items" : "All clear"}
        </span>
      </div>

      {/* Triage inbox or all-clear */}
      {showPending ? (
        <div className="space-y-3 mb-10">
          {triageItems.map((item) => (
            <TriageItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="mb-10">
          <AllClearState />
        </div>
      )}

      {/* Separator */}
      <Separator className="mb-8" />

      {/* Quick-jump navigation cards */}
      <div className="grid grid-cols-2 gap-3">
        {navCards.map((nav) => (
          <Card
            key={nav.label}
            className="group cursor-pointer border-border py-4 transition-colors hover:border-amber-500/30"
          >
            <CardHeader className="pb-0 gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <nav.icon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{nav.label}</CardTitle>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <CardDescription className="text-xs">
                {nav.description}
              </CardDescription>
            </CardHeader>
            {nav.count !== undefined && (
              <CardContent className="pt-0 pb-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-foreground">
                    {nav.count}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {nav.countLabel}
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Footer stats when in pending mode */}
      {showPending && (
        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span>
            <ScrollText className="mr-1 inline size-3" />
            {quickStats.events24h} events today
          </span>
          <span>
            <Bot className="mr-1 inline size-3" />
            {quickStats.agents} agents connected
          </span>
        </div>
      )}
    </div>
  )
}
