import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowDown,
  ChevronUp,
  Radio,
  Search,
  ShieldCheck,
  ShieldX,
  Clock,
  Timer,
  Pause,
  Play,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = "allowed" | "denied" | "pending" | "timeout"
type Environment = "production" | "staging" | "development"

interface StreamEvent {
  id: string
  timestamp: string
  agent: string
  tool: string
  args: string
  verdict: Verdict
  env: Environment
  contractVersion?: string
}

// ---------------------------------------------------------------------------
// Mock data — 18 events in the stream
// ---------------------------------------------------------------------------

const LIVE_EVENTS: StreamEvent[] = [
  {
    id: "ev-018",
    timestamp: "just now",
    agent: "deploy-agent-07",
    tool: "kubectl_apply",
    args: 'manifest="production/api-gateway.yaml", namespace="prod", dry_run=false',
    verdict: "denied",
    env: "production",
    contractVersion: "v2.4.1",
  },
  {
    id: "ev-017",
    timestamp: "2s ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.openai.com/v1/chat/completions", method="POST", model="gpt-4"',
    verdict: "allowed",
    env: "production",
    contractVersion: "v2.4.1",
  },
  {
    id: "ev-016",
    timestamp: "4s ago",
    agent: "data-pipeline-03",
    tool: "db_query",
    args: 'query="SELECT count(*) FROM orders WHERE status=\'pending\'", database="analytics"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-015",
    timestamp: "7s ago",
    agent: "support-agent-02",
    tool: "send_email",
    args: 'to="customer@example.com", subject="Ticket #4521 resolved", template="resolution"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-014",
    timestamp: "12s ago",
    agent: "deploy-agent-07",
    tool: "kubectl_get",
    args: 'resource="pods", namespace="prod", selector="app=api-gateway"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-013",
    timestamp: "18s ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.stripe.com/v1/charges", method="POST", amount=4999',
    verdict: "denied",
    env: "production",
    contractVersion: "v2.4.1",
  },
  {
    id: "ev-012",
    timestamp: "25s ago",
    agent: "admin-bot",
    tool: "file_write",
    args: 'path="/etc/hosts", content="127.0.0.1 dev.local"',
    verdict: "pending",
    env: "development",
  },
]

// Events that were received while "scrolled away" — shown behind the banner
const BUFFERED_EVENTS: StreamEvent[] = [
  {
    id: "ev-buf-8",
    timestamp: "just now",
    agent: "deploy-agent-07",
    tool: "kubectl_rollout",
    args: 'deployment="api-gateway", namespace="prod", action="status"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-buf-7",
    timestamp: "1s ago",
    agent: "research-agent-12",
    tool: "file_read",
    args: 'path="/data/results/analysis-2026-02.json", encoding="utf-8"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-buf-6",
    timestamp: "3s ago",
    agent: "data-pipeline-03",
    tool: "db_execute",
    args: 'query="INSERT INTO metrics (agent, event_count) VALUES (\'dp-03\', 847)"',
    verdict: "allowed",
    env: "staging",
  },
  {
    id: "ev-buf-5",
    timestamp: "4s ago",
    agent: "cleanup-agent-09",
    tool: "file_delete",
    args: 'path="/tmp/cache/*.log", pattern="older_than=24h"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-buf-4",
    timestamp: "6s ago",
    agent: "support-agent-02",
    tool: "http_request",
    args: 'url="https://hooks.slack.com/services/T00/B00/xxx", method="POST"',
    verdict: "denied",
    env: "production",
    contractVersion: "v2.4.1",
  },
  {
    id: "ev-buf-3",
    timestamp: "8s ago",
    agent: "deploy-agent-07",
    tool: "kubectl_get",
    args: 'resource="services", namespace="prod", output="json"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-buf-2",
    timestamp: "10s ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.anthropic.com/v1/messages", method="POST", model="claude-sonnet-4-6"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-buf-1",
    timestamp: "12s ago",
    agent: "data-pipeline-03",
    tool: "db_query",
    args: 'query="SELECT agent_id, count(*) FROM events GROUP BY 1 ORDER BY 2 DESC LIMIT 10"',
    verdict: "allowed",
    env: "staging",
  },
]

// Older events below the fold
const OLDER_EVENTS: StreamEvent[] = [
  {
    id: "ev-011",
    timestamp: "32s ago",
    agent: "data-pipeline-03",
    tool: "db_execute",
    args: 'query="DROP TABLE tmp_migration_2024", database="analytics"',
    verdict: "pending",
    env: "staging",
  },
  {
    id: "ev-010",
    timestamp: "45s ago",
    agent: "deploy-agent-07",
    tool: "kubectl_apply",
    args: 'manifest="staging/api-gateway.yaml", namespace="staging", dry_run=true',
    verdict: "allowed",
    env: "staging",
  },
  {
    id: "ev-009",
    timestamp: "1m ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.openai.com/v1/embeddings", method="POST", input="quarterly report"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-008",
    timestamp: "1m ago",
    agent: "support-agent-02",
    tool: "db_query",
    args: 'query="SELECT * FROM tickets WHERE id=4521", database="support"',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-007",
    timestamp: "2m ago",
    agent: "cleanup-agent-09",
    tool: "file_delete",
    args: 'path="/data/exports/batch-2024-02-*.csv", count=147',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-006",
    timestamp: "3m ago",
    agent: "deploy-agent-07",
    tool: "kubectl_get",
    args: 'resource="deployments", namespace="staging", output="wide"',
    verdict: "allowed",
    env: "staging",
  },
  {
    id: "ev-005",
    timestamp: "5m ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.stripe.com/v1/customers", method="GET", limit=100',
    verdict: "allowed",
    env: "production",
  },
  {
    id: "ev-004",
    timestamp: "8m ago",
    agent: "admin-bot",
    tool: "shell_exec",
    args: 'cmd="systemctl status nginx"',
    verdict: "allowed",
    env: "development",
  },
  {
    id: "ev-003",
    timestamp: "12m ago",
    agent: "data-pipeline-03",
    tool: "db_query",
    args: 'query="EXPLAIN ANALYZE SELECT * FROM events WHERE created_at > now() - interval \'1 hour\'"',
    verdict: "allowed",
    env: "staging",
  },
  {
    id: "ev-002",
    timestamp: "15m ago",
    agent: "deploy-agent-07",
    tool: "kubectl_apply",
    args: 'manifest="staging/redis.yaml", namespace="staging", dry_run=false',
    verdict: "allowed",
    env: "staging",
  },
  {
    id: "ev-001",
    timestamp: "20m ago",
    agent: "research-agent-12",
    tool: "http_request",
    args: 'url="https://api.openai.com/v1/chat/completions", method="POST", model="gpt-4"',
    verdict: "denied",
    env: "production",
    contractVersion: "v2.4.0",
  },
]

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const config: Record<
    Verdict,
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

  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

function EnvBadge({ env }: { env: Environment }) {
  const config: Record<Environment, string> = {
    production: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    staging: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    development: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  }

  return (
    <Badge variant="outline" className={config[env]}>
      {env}
    </Badge>
  )
}

function EventCard({ event }: { event: StreamEvent }) {
  return (
    <Card className="py-0 transition-colors hover:border-border/80 hover:bg-card/80">
      <CardContent className="px-4 py-3">
        {/* Row 1: timestamp, agent, verdict+env badges */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-mono text-muted-foreground/60">
              {event.timestamp}
            </span>
            <span className="text-sm font-medium text-foreground">
              {event.agent}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <EnvBadge env={event.env} />
            <VerdictBadge verdict={event.verdict} />
          </div>
        </div>

        {/* Row 2: tool name — prominent */}
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {event.tool}
          </span>
          {event.contractVersion && (
            <span className="text-xs text-muted-foreground/50">
              {event.contractVersion}
            </span>
          )}
        </div>

        {/* Row 3: tool arguments — the most important detail */}
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs font-mono text-muted-foreground leading-relaxed break-all">
            {event.args}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Filter pill component
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  count,
  color,
  onClick,
}: {
  label: string
  active: boolean
  count?: number
  color?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? `${color ?? "bg-primary/15 text-primary border-primary/25"}`
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="font-mono text-[10px] opacity-70">{count}</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EventsV5() {
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "all">("all")
  const [isLive, setIsLive] = useState(true)
  const [showBuffered, setShowBuffered] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Count verdicts across all visible events
  const allVisibleEvents = [...LIVE_EVENTS, ...OLDER_EVENTS]
  const verdictCounts = allVisibleEvents.reduce(
    (acc, e) => {
      acc[e.verdict] = (acc[e.verdict] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  // Apply filters
  const filterEvents = (events: StreamEvent[]) => {
    return events.filter((e) => {
      if (verdictFilter !== "all" && e.verdict !== verdictFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          e.agent.toLowerCase().includes(q) ||
          e.tool.toLowerCase().includes(q) ||
          e.args.toLowerCase().includes(q)
        )
      }
      return true
    })
  }

  const filteredLiveEvents = filterEvents(LIVE_EVENTS)
  const filteredOlderEvents = filterEvents(OLDER_EVENTS)
  const filteredBufferedEvents = filterEvents(BUFFERED_EVENTS)

  return (
    <div className="min-h-screen bg-background">
      {/* ---- Sticky header bar ---- */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-4">
          {/* Top row: title + live indicator */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Events</h1>
              <span className="text-sm text-muted-foreground">
                Live tail
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Events per second */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">~3.2 evt/s</span>
              </div>

              {/* Live indicator */}
              <button
                onClick={() => setIsLive(!isLive)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors ${
                  isLive
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                {isLive ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-medium text-emerald-400">
                      Live
                    </span>
                    <Pause className="size-3 text-emerald-400" />
                  </>
                ) : (
                  <>
                    <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-medium text-amber-400">
                      Paused
                    </span>
                    <Play className="size-3 text-amber-400" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bottom row: search + verdict pills */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search agents, tools, args..."
                className="h-8 pl-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <FilterPill
                label="All"
                active={verdictFilter === "all"}
                count={allVisibleEvents.length}
                onClick={() => setVerdictFilter("all")}
              />
              <FilterPill
                label="Allowed"
                active={verdictFilter === "allowed"}
                count={verdictCounts.allowed ?? 0}
                color="bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                onClick={() =>
                  setVerdictFilter(
                    verdictFilter === "allowed" ? "all" : "allowed",
                  )
                }
              />
              <FilterPill
                label="Denied"
                active={verdictFilter === "denied"}
                count={verdictCounts.denied ?? 0}
                color="bg-red-500/15 text-red-400 border-red-500/25"
                onClick={() =>
                  setVerdictFilter(
                    verdictFilter === "denied" ? "all" : "denied",
                  )
                }
              />
              <FilterPill
                label="Pending"
                active={verdictFilter === "pending"}
                count={verdictCounts.pending ?? 0}
                color="bg-amber-500/15 text-amber-400 border-amber-500/25"
                onClick={() =>
                  setVerdictFilter(
                    verdictFilter === "pending" ? "all" : "pending",
                  )
                }
              />
              <FilterPill
                label="Timeout"
                active={verdictFilter === "timeout"}
                count={verdictCounts.timeout ?? 0}
                color="bg-zinc-500/15 text-zinc-400 border-zinc-500/25"
                onClick={() =>
                  setVerdictFilter(
                    verdictFilter === "timeout" ? "all" : "timeout",
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Stream body ---- */}
      <div className="px-6 py-4">
        {/* "Return to Live" button — shown when paused */}
        {!isLive && (
          <div className="mb-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLive(true)}
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
            >
              <Radio className="size-3.5 animate-pulse" />
              Return to Live
              <ChevronUp className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Live events — newest first */}
        <div className="space-y-2">
          {filteredLiveEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>

        {/* "Show N New Events" banner — simulates scrolled-away state */}
        {!showBuffered && (
          <div className="my-3 flex justify-center">
            <button
              onClick={() => setShowBuffered(true)}
              className="group flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <ArrowDown className="size-3.5 transition-transform group-hover:translate-y-0.5" />
              Show 8 New Events
            </button>
          </div>
        )}

        {/* Buffered events — revealed when banner is clicked */}
        {showBuffered && (
          <div className="mt-2 space-y-2">
            <div className="my-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-primary/20" />
              <span className="text-xs font-medium text-primary/60">
                8 new events loaded
              </span>
              <div className="h-px flex-1 bg-primary/20" />
            </div>
            {filteredBufferedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Older events — below the fold */}
        <div className="mt-2 space-y-2">
          {filteredOlderEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>

        {/* End of stream indicator */}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-xs text-muted-foreground/50">
            Showing last 20 minutes of events
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 text-xs text-muted-foreground"
          >
            Load older events
          </Button>
        </div>
      </div>
    </div>
  )
}
