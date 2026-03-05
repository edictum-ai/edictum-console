import { useState, useEffect } from "react"
import { useParams, useSearchParams, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sinceToIso } from "@/lib/format"
import { AgentHeader, MetricCard, AgentDetailSkeleton } from "./agent-detail-header"
import { CoverageTab } from "./coverage-tab"
import { AnalyticsTab } from "./analytics-tab"
import { HistoryTab } from "./history-tab"
import { useAgentCoverage } from "@/hooks/use-agent-coverage"
import { listEvents, type EventResponse } from "@/lib/api/events"
import { getFleetCoverage, type FleetCoverage } from "@/lib/api/agents"
import { normalizeVerdict } from "@/lib/verdict-helpers"

const COVERAGE_TIME_OPTIONS = [
  { value: "1h", label: "Last 1h" },
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
] as const

type TabValue = "coverage" | "analytics" | "history"

function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const tab = (searchParams.get("tab") ?? "coverage") as TabValue
  const since = searchParams.get("since") ?? "24h"

  // includeVerdicts flips when switching tabs, which triggers a refetch.
  // Acceptable: coverage tab works fine with either response shape, just a wasted call.
  const includeVerdicts = tab === "analytics"
  // agentId! is safe — route is agents/:agentId so React Router guarantees the param
  const { data, loading, error, refetch } = useAgentCoverage(agentId!, since, includeVerdicts)

  // Event counts for metric cards
  const [events, setEvents] = useState<EventResponse[]>([])
  useEffect(() => {
    if (!agentId) return
    let cancelled = false
    listEvents({ agent_id: agentId, since: sinceToIso(since), limit: 500 })
      .then((result) => { if (!cancelled) setEvents(result) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [agentId, since])

  // Fleet data for analytics comparison + drift status
  const [fleetData, setFleetData] = useState<FleetCoverage | null>(null)
  useEffect(() => {
    let cancelled = false
    getFleetCoverage(since)
      .then((data) => { if (!cancelled) setFleetData(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [since])

  const setTab = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", value)
      return next
    })
  }

  const setSince = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("since", value)
      return next
    })
  }

  const totalEvents = events.length
  const denialCount = events.filter((e) => normalizeVerdict(e.verdict) === "denied").length
  const goBack = () => navigate("/dashboard/agents")

  // Loading skeleton (first load only)
  if (!data && loading) return <AgentDetailSkeleton onBack={goBack} />

  // Error state
  if (!data && error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
      </div>
    )
  }

  if (!data) return null

  const fleetEntry = fleetData?.agents.find((a) => a.agent_id === data.agent_id)

  return (
    <div className="flex flex-col gap-6 p-6">
      <AgentHeader data={data} fleetEntry={fleetEntry} loading={loading} onBack={goBack} />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label={`Events (${since})`}
          value={totalEvents}
          onClick={() => navigate(`/dashboard/events?agent_id=${encodeURIComponent(data.agent_id)}`)}
        />
        <MetricCard
          label={`Denials (${since})`}
          value={denialCount}
          accent={denialCount > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
        <MetricCard
          label="Ungoverned Tools"
          value={data.summary.ungoverned}
          accent={data.summary.ungoverned > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
        <MetricCard
          label="Observed Only"
          value={data.summary.observed}
          accent={data.summary.observed > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
      </div>

      {/* Tabs + Time Selector */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList variant="line">
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {tab !== "history" && (
            <Select value={since} onValueChange={setSince}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVERAGE_TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="coverage" className="mt-4">
          <CoverageTab
            tools={data.tools}
            summary={data.summary}
            environment={data.environment}
            deployedBundle={data.deployed_bundle}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTab
            agentId={data.agent_id}
            since={since}
            tools={data.tools}
            coverageSummary={data.summary}
            fleetData={fleetData}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab agentId={data.agent_id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AgentDetail
