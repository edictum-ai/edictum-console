import { useState, useEffect, useCallback } from "react"
import {
  listEvents,
  listApprovals,
  type EventResponse,
  type ApprovalResponse,
} from "@/lib/api"
import { useStats } from "@/hooks/use-stats"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { StatsBar } from "@/components/dashboard/stats-bar"
import { TriageColumn } from "@/components/dashboard/triage-column"
import { ActivityColumn } from "@/components/dashboard/activity-column"
import { AgentGrid } from "@/components/dashboard/agent-grid"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle } from "lucide-react"
import { toast } from "sonner"

export function DashboardHome() {
  const { data: stats, loading: statsLoading, refresh: refreshStats } = useStats()
  const [events, setEvents] = useState<EventResponse[]>([])
  const [approvals, setApprovals] = useState<ApprovalResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [eventsData, approvalsData] = await Promise.all([
        listEvents({ limit: 100 }),
        listApprovals({ status: "pending", limit: 50 }),
      ])
      setEvents(eventsData)
      setApprovals(approvalsData)
    } catch {
      setError("Failed to load dashboard data")
      toast.error("Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // SSE for real-time updates
  useDashboardSSE({
    stats_update: () => {
      void refreshStats()
    },
    new_event: (raw) => {
      const event = raw as Record<string, unknown>
      if (typeof event?.id === "string" && typeof event?.tool_name === "string") {
        setEvents((prev) => [event as unknown as EventResponse, ...prev].slice(0, 100))
      }
    },
    approval_update: () => {
      // Background sync — SSE will retry; don't toast on transient failures
      void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
    },
  })

  function handleDecisionMade() {
    void refreshStats()
    // Decision already succeeded; this is a background sync
    void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
  }

  if (loading && statsLoading) {
    return (
      <div className="flex flex-col p-4">
        {/* Stats bar skeleton */}
        <div className="-mx-4 -mt-4 mb-0 border-b border-border bg-card/30 px-6 py-3">
          <div className="flex items-center gap-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-24" />
            ))}
          </div>
        </div>
        {/* Two column skeleton */}
        <div className="mt-4 grid grid-cols-[2fr_3fr] gap-4 h-[50vh]">
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <div className="space-y-2 p-4">
            <Skeleton className="h-[120px] w-full rounded-lg" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-4 h-screen overflow-auto">
      {/* Top Stats Bar */}
      <div className="-mx-4 -mt-4 mb-0 border-b border-border bg-card/30">
        <div className="px-4 py-0">
          <StatsBar stats={stats} loading={statsLoading} />
        </div>
      </div>

      {/* Error banner — below stats bar, doesn't hide stale data */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={() => { setError(null); void fetchData() }}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Two-column layout: triage + activity (resizable horizontally) */}
      <div className="mt-4 h-[50vh] min-h-[300px]">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="h-full overflow-auto border-r border-border">
              <TriageColumn approvals={approvals} onDecisionMade={handleDecisionMade} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full overflow-auto">
              <ActivityColumn events={events} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Agent Fleet - scrolls with page */}
      <div className="mt-4">
        <AgentGrid events={events} />
      </div>
    </div>
  )
}
