/**
 * Agents page — fleet coverage overview with ungoverned sidebar, filter bar, and agent table.
 * Main entry point mounted at /dashboard/agents.
 */

import { useMemo } from "react"
import { useNavigate, Link } from "react-router"
import { Users, ShieldCheck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/empty-state"
import { useFleetCoverage } from "@/hooks/use-fleet-coverage"
import { useAgentFilters } from "@/hooks/use-agent-filters"
import { FleetSummary } from "./fleet-summary"
import { UngovernedSidebar } from "./ungoverned-sidebar"
import { AgentTable } from "./agent-table"
import { AgentFiltersBar } from "./agent-filters"

export default function AgentsPage() {
  const navigate = useNavigate()
  const { filters, updateFilter, filterAgents } = useAgentFilters()

  const envParam = filters.env !== "all" ? filters.env : undefined
  const { data, loading, error, refetch } = useFleetCoverage(filters.since, envParam)

  const filteredAgents = useMemo(
    () => (data ? filterAgents(data.agents) : []),
    [data, filterAgents],
  )

  const summary = data?.fleet_summary ?? null
  const ungoverned = summary?.ungoverned_tools ?? []

  // Handle ungoverned tool click from sidebar → filter search
  const handleFilterByTool = (toolName: string) => {
    updateFilter("search", toolName)
  }

  // --- Loading state (initial, no data) ---
  if (loading && !data) {
    return (
      <div className="flex h-full flex-col">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-lg" />
          ))}
        </div>
        <div className="flex-1 p-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // --- Error state (no data) ---
  if (error && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  // --- Empty state: no agents ---
  if (summary && summary.total_agents === 0) {
    return (
      <div className="flex h-full flex-col">
        <FleetSummary summary={summary} loading={loading} />
        <div className="flex-1">
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No agents detected"
            description="Agents appear here when they start sending events to Edictum. Create an API key, install edictum with pip install edictum[server], and configure your agent to report to this server."
            action={{ label: "Create API Key", onClick: () => navigate("/dashboard/keys") }}
          />
        </div>
      </div>
    )
  }

  // --- Contextual alerts ---
  const allUngoverned = summary && data && data.agents.length > 0
    ? data.agents.every((a) => a.total_tools > 0 && a.ungoverned === a.total_tools)
    : false
  const allEnforced = summary
    ? summary.with_ungoverned === 0 && summary.total_agents > 0
    : false

  return (
    <div className="flex h-full flex-col">
      <FleetSummary summary={summary} loading={loading} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — hidden on mobile */}
        <div className="hidden md:block w-[280px] shrink-0 border-r border-border overflow-y-auto">
          <UngovernedSidebar
            summary={summary}
            agents={data?.agents ?? []}
            loading={loading}
            onFilterByTool={handleFilterByTool}
          />
        </div>

        {/* Right column — filters + table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {allUngoverned && summary && (
            <Alert variant="destructive" className="mx-4 mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No contracts deployed. {summary.total_agents} agent{summary.total_agents !== 1 ? "s are" : " is"} active but all tools are ungoverned.{" "}
                <Link to="/dashboard/contracts" className="underline font-medium">Deploy a Contract</Link>
              </AlertDescription>
            </Alert>
          )}
          {allEnforced && summary && (
            <Alert className="mx-4 mt-3 border-emerald-500/30 bg-emerald-500/10">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertDescription className="text-emerald-600 dark:text-emerald-400">
                Full enforcement — all {summary.total_agents} agent{summary.total_agents !== 1 ? "s are" : " is"} fully governed.
              </AlertDescription>
            </Alert>
          )}

          <AgentFiltersBar
            search={filters.search}
            env={filters.env}
            coverage={filters.coverage}
            drift={filters.drift}
            since={filters.since}
            onUpdate={updateFilter}
          />

          <div className="flex-1 overflow-y-auto px-4">
            <AgentTable
              agents={filteredAgents}
              since={filters.since}
              loading={loading}
              ungoverned={ungoverned}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
