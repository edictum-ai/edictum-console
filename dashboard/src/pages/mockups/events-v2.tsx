import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  X,
  Search,
  Clock,
  Bot,
  Wrench,
  FileText,
  ChevronRight,
  Filter,
  Calendar,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Verdict = "allowed" | "denied" | "escalated"
type Mode = "enforce" | "monitor"
type Environment = "production" | "staging" | "development"

interface MockEvent {
  id: string
  timestamp: string
  agent: string
  agentColor: string
  tool: string
  verdict: Verdict
  mode: Mode
  environment: Environment
  contract: string
  rule: string
  toolArgs: Record<string, unknown>
  duration: number
}

// ---------------------------------------------------------------------------
// Mock data — 18 events across 4 agents
// ---------------------------------------------------------------------------

const MOCK_EVENTS: MockEvent[] = [
  {
    id: "evt_01",
    timestamp: "2026-02-27T14:32:08Z",
    agent: "research-agent",
    agentColor: "bg-blue-500",
    tool: "web_search",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "research-boundaries-v3",
    rule: "blocked_domains",
    toolArgs: { query: "internal salary data site:hr.company.com", max_results: 10 },
    duration: 2,
  },
  {
    id: "evt_02",
    timestamp: "2026-02-27T14:31:55Z",
    agent: "deploy-bot",
    agentColor: "bg-orange-500",
    tool: "kubectl_apply",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "deploy-guardrails-v2",
    rule: "namespace_allowlist",
    toolArgs: { manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: redis-cache\n  namespace: kube-system", namespace: "kube-system", cluster: "prod-us-east-1" },
    duration: 1,
  },
  {
    id: "evt_03",
    timestamp: "2026-02-27T14:31:42Z",
    agent: "support-agent",
    agentColor: "bg-green-500",
    tool: "send_email",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "comms-policy-v4",
    rule: "recipient_limit",
    toolArgs: { to: ["alice@example.com", "bob@example.com", "carol@example.com", "dave@example.com", "eve@example.com", "frank@example.com"], subject: "Account Update Notification", body: "Dear customer, your account has been..." },
    duration: 3,
  },
  {
    id: "evt_04",
    timestamp: "2026-02-27T14:31:30Z",
    agent: "data-pipeline",
    agentColor: "bg-purple-500",
    tool: "sql_execute",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "data-access-v5",
    rule: "forbidden_operations",
    toolArgs: { query: "DROP TABLE users CASCADE", database: "analytics_prod", timeout_ms: 30000 },
    duration: 1,
  },
  {
    id: "evt_05",
    timestamp: "2026-02-27T14:31:18Z",
    agent: "research-agent",
    agentColor: "bg-blue-500",
    tool: "file_write",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "research-boundaries-v3",
    rule: "path_allowlist",
    toolArgs: { path: "/etc/passwd", content: "malicious content attempt" },
    duration: 1,
  },
  {
    id: "evt_06",
    timestamp: "2026-02-27T14:31:05Z",
    agent: "deploy-bot",
    agentColor: "bg-orange-500",
    tool: "kubectl_delete",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "deploy-guardrails-v2",
    rule: "destructive_ops_blocked",
    toolArgs: { resource: "namespace", name: "production", cluster: "prod-us-east-1", force: true },
    duration: 1,
  },
  {
    id: "evt_07",
    timestamp: "2026-02-27T14:30:52Z",
    agent: "support-agent",
    agentColor: "bg-green-500",
    tool: "database_query",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "comms-policy-v4",
    rule: "pii_access_restricted",
    toolArgs: { query: "SELECT ssn, credit_card FROM customers WHERE id = 4521", database: "customer_db" },
    duration: 2,
  },
  {
    id: "evt_08",
    timestamp: "2026-02-27T14:30:40Z",
    agent: "data-pipeline",
    agentColor: "bg-purple-500",
    tool: "s3_upload",
    verdict: "denied",
    mode: "enforce",
    environment: "staging",
    contract: "data-access-v5",
    rule: "bucket_allowlist",
    toolArgs: { bucket: "company-backups-prod", key: "exports/full-dump.csv", size_mb: 2400 },
    duration: 4,
  },
  {
    id: "evt_09",
    timestamp: "2026-02-27T14:30:28Z",
    agent: "research-agent",
    agentColor: "bg-blue-500",
    tool: "web_search",
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contract: "research-boundaries-v3",
    rule: "general_search",
    toolArgs: { query: "latest React 19 features and improvements", max_results: 5 },
    duration: 340,
  },
  {
    id: "evt_10",
    timestamp: "2026-02-27T14:30:15Z",
    agent: "deploy-bot",
    agentColor: "bg-orange-500",
    tool: "kubectl_apply",
    verdict: "allowed",
    mode: "enforce",
    environment: "staging",
    contract: "deploy-guardrails-v2",
    rule: "staging_deploy",
    toolArgs: { manifest: "apiVersion: apps/v1\nkind: Deployment...", namespace: "staging", cluster: "staging-us-east-1" },
    duration: 1200,
  },
  {
    id: "evt_11",
    timestamp: "2026-02-27T14:30:02Z",
    agent: "support-agent",
    agentColor: "bg-green-500",
    tool: "send_email",
    verdict: "escalated",
    mode: "enforce",
    environment: "production",
    contract: "comms-policy-v4",
    rule: "external_recipient",
    toolArgs: { to: ["partner@external.co"], subject: "Partnership Proposal Q2", body: "Hi, we'd like to discuss..." },
    duration: 0,
  },
  {
    id: "evt_12",
    timestamp: "2026-02-27T14:29:48Z",
    agent: "data-pipeline",
    agentColor: "bg-purple-500",
    tool: "sql_execute",
    verdict: "allowed",
    mode: "monitor",
    environment: "development",
    contract: "data-access-v5",
    rule: "read_only",
    toolArgs: { query: "SELECT COUNT(*) FROM events WHERE created_at > '2026-02-01'", database: "analytics_dev", timeout_ms: 5000 },
    duration: 85,
  },
  {
    id: "evt_13",
    timestamp: "2026-02-27T14:29:35Z",
    agent: "research-agent",
    agentColor: "bg-blue-500",
    tool: "file_read",
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contract: "research-boundaries-v3",
    rule: "allowed_paths",
    toolArgs: { path: "/workspace/docs/architecture.md" },
    duration: 12,
  },
  {
    id: "evt_14",
    timestamp: "2026-02-27T14:29:20Z",
    agent: "deploy-bot",
    agentColor: "bg-orange-500",
    tool: "helm_upgrade",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "deploy-guardrails-v2",
    rule: "chart_version_pinned",
    toolArgs: { release: "api-gateway", chart: "nginx-ingress", version: "latest", namespace: "ingress", values: { replicaCount: 3 } },
    duration: 1,
  },
  {
    id: "evt_15",
    timestamp: "2026-02-27T14:29:05Z",
    agent: "support-agent",
    agentColor: "bg-green-500",
    tool: "create_ticket",
    verdict: "allowed",
    mode: "enforce",
    environment: "production",
    contract: "comms-policy-v4",
    rule: "ticket_creation",
    toolArgs: { title: "Customer unable to access dashboard", priority: "high", assignee: "engineering-team", tags: ["bug", "dashboard", "urgent"] },
    duration: 450,
  },
  {
    id: "evt_16",
    timestamp: "2026-02-27T14:28:50Z",
    agent: "data-pipeline",
    agentColor: "bg-purple-500",
    tool: "sql_execute",
    verdict: "denied",
    mode: "enforce",
    environment: "production",
    contract: "data-access-v5",
    rule: "forbidden_operations",
    toolArgs: { query: "TRUNCATE TABLE audit_logs", database: "analytics_prod", timeout_ms: 60000 },
    duration: 1,
  },
  {
    id: "evt_17",
    timestamp: "2026-02-27T14:28:38Z",
    agent: "research-agent",
    agentColor: "bg-blue-500",
    tool: "web_search",
    verdict: "allowed",
    mode: "monitor",
    environment: "development",
    contract: "research-boundaries-v3",
    rule: "general_search",
    toolArgs: { query: "Python asyncio best practices 2026", max_results: 10 },
    duration: 280,
  },
  {
    id: "evt_18",
    timestamp: "2026-02-27T14:28:22Z",
    agent: "deploy-bot",
    agentColor: "bg-orange-500",
    tool: "kubectl_apply",
    verdict: "escalated",
    mode: "enforce",
    environment: "production",
    contract: "deploy-guardrails-v2",
    rule: "production_deploy_approval",
    toolArgs: { manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payment-service", namespace: "production", cluster: "prod-us-east-1", replicas: 5 },
    duration: 0,
  },
]

// ---------------------------------------------------------------------------
// Derived counts
// ---------------------------------------------------------------------------

const VERDICT_COUNTS = {
  all: MOCK_EVENTS.length,
  allowed: MOCK_EVENTS.filter((e) => e.verdict === "allowed").length,
  denied: MOCK_EVENTS.filter((e) => e.verdict === "denied").length,
  escalated: MOCK_EVENTS.filter((e) => e.verdict === "escalated").length,
}

const AGENTS = [...new Set(MOCK_EVENTS.map((e) => e.agent))]
const TOOLS = [...new Set(MOCK_EVENTS.map((e) => e.tool))]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictIcon(verdict: Verdict) {
  switch (verdict) {
    case "allowed":
      return <ShieldCheck className="size-4 text-emerald-500" />
    case "denied":
      return <ShieldX className="size-4 text-red-500" />
    case "escalated":
      return <ShieldAlert className="size-4 text-amber-500" />
  }
}

function verdictBadgeVariant(verdict: Verdict) {
  switch (verdict) {
    case "allowed":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    case "denied":
      return "bg-red-500/10 text-red-500 border-red-500/20"
    case "escalated":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20"
  }
}

function formatTimestamp(ts: string) {
  const d = new Date(ts)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function formatDuration(ms: number) {
  if (ms === 0) return "pending"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatArgValue(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2)
  return String(value)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventsV2() {
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "all">("denied")
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [toolFilter, setToolFilter] = useState<string>("all")
  const [modeFilter, setModeFilter] = useState<Mode | "all">("all")
  const [envFilter, setEnvFilter] = useState<Environment | "all">("all")
  const [selectedEventId, setSelectedEventId] = useState<string>("evt_01")

  // -- Filter logic --
  const filteredEvents = MOCK_EVENTS.filter((e) => {
    if (verdictFilter !== "all" && e.verdict !== verdictFilter) return false
    if (agentFilter !== "all" && e.agent !== agentFilter) return false
    if (toolFilter !== "all" && e.tool !== toolFilter) return false
    if (modeFilter !== "all" && e.mode !== modeFilter) return false
    if (envFilter !== "all" && e.environment !== envFilter) return false
    return true
  })

  const selectedEvent = MOCK_EVENTS.find((e) => e.id === selectedEventId) ?? filteredEvents[0]

  const activeFilterCount = [
    verdictFilter !== "all",
    agentFilter !== "all",
    toolFilter !== "all",
    modeFilter !== "all",
    envFilter !== "all",
  ].filter(Boolean).length

  function clearAllFilters() {
    setVerdictFilter("all")
    setAgentFilter("all")
    setToolFilter("all")
    setModeFilter("all")
    setEnvFilter("all")
  }

  return (
    <div className="flex h-full flex-col">
      {/* ---- Top bar: filters ---- */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search placeholder */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              className="h-8 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Verdict toggle pills */}
          <div className="flex items-center gap-1">
            {(["all", "allowed", "denied", "escalated"] as const).map((v) => {
              const isActive = verdictFilter === v
              const count = VERDICT_COUNTS[v]
              return (
                <button
                  key={v}
                  onClick={() => setVerdictFilter(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? v === "all"
                        ? "bg-primary text-primary-foreground"
                        : v === "allowed"
                          ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30"
                          : v === "denied"
                            ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30"
                            : "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                      : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  )}
                >
                  {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold",
                    isActive ? "bg-background/20" : "bg-background/50"
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Agent dropdown */}
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs">
              <Bot className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {AGENTS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tool dropdown */}
          <Select value={toolFilter} onValueChange={setToolFilter}>
            <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs">
              <Wrench className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tools</SelectItem>
              {TOOLS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mode dropdown */}
          <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as Mode | "all")}>
            <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs">
              <Filter className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="enforce">Enforce</SelectItem>
              <SelectItem value="monitor">Monitor</SelectItem>
            </SelectContent>
          </Select>

          {/* Environment dropdown */}
          <Select value={envFilter} onValueChange={(v) => setEnvFilter(v as Environment | "all")}>
            <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range placeholder */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Calendar className="size-3.5" />
            Last 24h
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Result count + clear */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filteredEvents.length} events</span>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="xs" onClick={clearAllFilters} className="gap-1 text-xs">
                <X className="size-3" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {verdictFilter !== "all" && (
              <FilterChip label={`Verdict: ${verdictFilter}`} onRemove={() => setVerdictFilter("all")} />
            )}
            {agentFilter !== "all" && (
              <FilterChip label={`Agent: ${agentFilter}`} onRemove={() => setAgentFilter("all")} />
            )}
            {toolFilter !== "all" && (
              <FilterChip label={`Tool: ${toolFilter}`} onRemove={() => setToolFilter("all")} />
            )}
            {modeFilter !== "all" && (
              <FilterChip label={`Mode: ${modeFilter}`} onRemove={() => setModeFilter("all")} />
            )}
            {envFilter !== "all" && (
              <FilterChip label={`Env: ${envFilter}`} onRemove={() => setEnvFilter("all")} />
            )}
          </div>
        )}
      </div>

      {/* ---- Main area: list + detail ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* Event list (left ~60%) */}
        <div className="w-[60%] border-r border-border">
          <ScrollArea className="h-full">
            <div className="divide-y divide-border">
              {filteredEvents.map((event) => {
                const isSelected = selectedEvent?.id === event.id
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                      isSelected
                        ? "bg-accent/50"
                        : "hover:bg-accent/30"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {verdictIcon(event.verdict)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {event.tool}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", verdictBadgeVariant(event.verdict))}>
                          {event.verdict}
                        </Badge>
                        {event.mode === "monitor" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/20 text-blue-500 bg-blue-500/10">
                            monitor
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className={cn("inline-block size-2 rounded-full", event.agentColor)} />
                          {event.agent}
                        </span>
                        <span className="text-border">|</span>
                        <span>{event.contract}</span>
                        <span className="text-border">|</span>
                        <span>{event.rule}</span>
                      </div>
                      {/* Inline tool args preview */}
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground/70">
                        {Object.entries(event.toolArgs).slice(0, 2).map(([k, v], i) => (
                          <span key={k}>
                            {i > 0 && <span className="mx-1">·</span>}
                            <span className="text-muted-foreground">{k}=</span>
                            <span>{typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 30)}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(event.timestamp)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                        {formatDuration(event.duration)}
                      </div>
                    </div>

                    {isSelected && (
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                )
              })}

              {filteredEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="mb-3 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No events match your filters</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={clearAllFilters}>
                    Clear all filters
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Detail panel (right ~40%) */}
        <div className="w-[40%] bg-card">
          {selectedEvent ? (
            <ScrollArea className="h-full">
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {verdictIcon(selectedEvent.verdict)}
                      <h2 className="text-lg font-semibold text-foreground">
                        {selectedEvent.tool}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedEvent.id}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", verdictBadgeVariant(selectedEvent.verdict))}>
                    {selectedEvent.verdict.toUpperCase()}
                  </Badge>
                </div>

                {/* Metadata grid */}
                <Card className="mt-4 gap-0 py-0">
                  <div className="divide-y divide-border">
                    <DetailRow icon={<Clock className="size-3.5" />} label="Timestamp" value={new Date(selectedEvent.timestamp).toLocaleString()} />
                    <DetailRow
                      icon={<Bot className="size-3.5" />}
                      label="Agent"
                      value={
                        <span className="flex items-center gap-1.5">
                          <span className={cn("inline-block size-2 rounded-full", selectedEvent.agentColor)} />
                          {selectedEvent.agent}
                        </span>
                      }
                    />
                    <DetailRow icon={<FileText className="size-3.5" />} label="Contract" value={selectedEvent.contract} />
                    <DetailRow icon={<ShieldAlert className="size-3.5" />} label="Rule" value={selectedEvent.rule} />
                    <DetailRow
                      label="Mode"
                      value={
                        <Badge variant="outline" className={cn(
                          "text-[10px] px-1.5 py-0",
                          selectedEvent.mode === "enforce"
                            ? "border-foreground/20 text-foreground"
                            : "border-blue-500/20 text-blue-500 bg-blue-500/10"
                        )}>
                          {selectedEvent.mode}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label="Environment"
                      value={
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {selectedEvent.environment}
                        </Badge>
                      }
                    />
                    <DetailRow label="Duration" value={formatDuration(selectedEvent.duration)} />
                  </div>
                </Card>

                {/* Tool Arguments */}
                <div className="mt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Wrench className="size-3.5" />
                    Tool Arguments
                  </h3>
                  <Card className="gap-0 py-0 overflow-hidden">
                    <div className="divide-y divide-border">
                      {Object.entries(selectedEvent.toolArgs).map(([key, value]) => {
                        const formatted = formatArgValue(value)
                        const isMultiline = formatted.includes("\n") || formatted.length > 60
                        return (
                          <div key={key} className={cn("px-3", isMultiline ? "py-2.5" : "py-2")}>
                            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              {key}
                            </div>
                            <div className={cn(
                              "mt-1 text-sm text-foreground",
                              isMultiline
                                ? "whitespace-pre-wrap break-all font-mono text-xs leading-relaxed rounded bg-muted/50 p-2"
                                : "font-mono text-xs"
                            )}>
                              {formatted}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <FileText className="mb-3 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Select an event to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-sm hover:bg-primary/20 p-0.5">
        <X className="size-3" />
      </button>
    </span>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}
