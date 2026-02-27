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
import { Loader2 } from "lucide-react"

export function DashboardHome() {
  const { data: stats, loading: statsLoading, refresh: refreshStats } = useStats()
  const [events, setEvents] = useState<EventResponse[]>([])
  const [approvals, setApprovals] = useState<ApprovalResponse[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [eventsData, approvalsData] = await Promise.all([
        listEvents({ limit: 100 }),
        listApprovals({ status: "pending", limit: 50 }),
      ])
      setEvents(eventsData)
      setApprovals(approvalsData)
    } catch {
      // Stats hook handles its own errors; data fetching failures are non-fatal
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // SSE for real-time updates
  useDashboardSSE({
    onStatsUpdate: () => {
      void refreshStats()
    },
    onNewEvent: (raw) => {
      const event = raw as EventResponse
      if (event?.id) {
        setEvents((prev) => [event, ...prev].slice(0, 100))
      }
    },
    onApprovalUpdate: () => {
      // Refetch approvals on any change
      void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
    },
  })

  function handleDecisionMade() {
    void refreshStats()
    void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
  }

  if (loading && statsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-background p-4 h-screen overflow-auto">
      {/* Top Stats Bar */}
      <StatsBar stats={stats} loading={statsLoading} />

      {/* Two-column layout: triage + activity (resizable horizontally) */}
      <div className="mt-4 h-[50vh] min-h-[300px]">
        <ResizablePanelGroup direction="horizontal" autoSaveId="edictum-overview-cols" className="h-full">
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
