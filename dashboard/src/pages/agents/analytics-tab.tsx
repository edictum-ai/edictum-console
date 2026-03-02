import { useState, useEffect, useCallback, useMemo } from "react"
import { sinceToIso } from "@/lib/format"
import { listEvents, type EventResponse } from "@/lib/api/events"
import { buildHistogram, type TimeWindow, type PresetKey } from "@/lib/histogram"
import { VerdictChart, DenialHotspots, FleetComparison } from "./analytics-sections"
import type { ToolCoverageEntry, CoverageSummary, FleetCoverage } from "@/lib/api/agents"

interface AnalyticsTabProps {
  agentId: string
  since: string
  tools: ToolCoverageEntry[]
  coverageSummary: CoverageSummary
  fleetData: FleetCoverage | null
}

function toTimeWindow(since: string): TimeWindow {
  if (since === "30d") {
    const now = Date.now()
    return { kind: "custom", start: now - 30 * 86400000, end: now }
  }
  const presetMap: Record<string, PresetKey> = {
    "1h": "1h", "6h": "6h", "24h": "24h", "7d": "7d",
  }
  const key = presetMap[since]
  if (key) return { kind: "preset", key }
  return { kind: "preset", key: "24h" }
}

export function AnalyticsTab({ agentId, since, tools, coverageSummary, fleetData }: AnalyticsTabProps) {
  const [events, setEvents] = useState<EventResponse[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    try {
      setEventsLoading(true)
      const result = await listEvents({
        agent_id: agentId,
        since: sinceToIso(since),
        limit: 500,
      })
      setEvents(result)
    } catch {
      // Chart shows no data on error
    } finally {
      setEventsLoading(false)
    }
  }, [agentId, since])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const histogramData = useMemo(() => {
    const tw = toTimeWindow(since)
    return buildHistogram(
      events.map((e) => ({
        timestamp: e.timestamp,
        verdict: e.verdict,
        mode: e.mode,
        payload: e.payload,
      })),
      tw,
    )
  }, [events, since])

  // Denial hotspots: tools with denials, sorted desc
  const denialTools = tools
    .filter((t) => t.deny_count && t.deny_count > 0)
    .sort((a, b) => (b.deny_count ?? 0) - (a.deny_count ?? 0))

  const totalDenials = denialTools.reduce((sum, t) => sum + (t.deny_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <VerdictChart data={histogramData} loading={eventsLoading && events.length === 0} />
      <DenialHotspots tools={denialTools} totalDenials={totalDenials} />
      <FleetComparison
        agentTools={tools}
        coverageSummary={coverageSummary}
        fleetData={fleetData}
        since={since}
      />
    </div>
  )
}
