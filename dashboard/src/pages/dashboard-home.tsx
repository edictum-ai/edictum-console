import { useState, useEffect, useCallback, useMemo } from "react"
import {
  listEvents,
  listApprovals,
  listKeys,
  listContracts,
  type EventResponse,
  type ApprovalResponse,
} from "@/lib/api"
import { useStats } from "@/hooks/use-stats"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { StatsBar } from "@/components/dashboard/stats-bar"
import { TriageColumn } from "@/components/dashboard/triage-column"
import { ActivityColumn } from "@/components/dashboard/activity-column"
import { AgentGrid } from "@/components/dashboard/agent-grid"
import { GettingStarted } from "@/components/dashboard/getting-started"
import { deriveAgents } from "@/lib/derive-agents"
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
  const isMobile = useIsMobile()
  const { data: stats, loading: statsLoading, refresh: refreshStats } = useStats()
  const [events, setEvents] = useState<EventResponse[]>([])
  const [approvals, setApprovals] = useState<ApprovalResponse[]>([])
  const [hasKeys, setHasKeys] = useState(false)
  const [hasContracts, setHasContracts] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wizardDismissed, setWizardDismissed] = useState(() => {
    try {
      return localStorage.getItem("edictum_wizard_completed") === "true"
    } catch {
      return false
    }
  })

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [eventsData, approvalsData] = await Promise.all([
        listEvents({ limit: 100 }),
        listApprovals({ status: "pending", limit: 50 }),
      ])
      setEvents(eventsData)
      setApprovals(approvalsData)

      // Only fetch getting-started data when dashboard is empty
      if (eventsData.length === 0) {
        const [keysData, contractsData] = await Promise.all([
          listKeys().catch(() => []),
          listContracts().catch(() => []),
        ])
        setHasKeys(keysData.length > 0)
        setHasContracts(contractsData.length > 0)
      }
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
    event_created: () => {
      void refreshStats()
      void listEvents({ limit: 100 }).then(setEvents).catch(() => {})
    },
    approval_created: () => {
      void refreshStats()
      void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
    },
    approval_decided: () => {
      void refreshStats()
      void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
    },
  })

  function handleDecisionMade() {
    void refreshStats()
    // Decision already succeeded; this is a background sync
    void listApprovals({ status: "pending", limit: 50 }).then(setApprovals).catch(() => {})
  }

  // All hooks must be called before any conditional returns
  const agents = useMemo(() => deriveAgents(events), [events])

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
        {/* Two column skeleton (stacked on mobile) */}
        {isMobile ? (
          <div className="mt-4 space-y-4">
            <Skeleton className="h-[200px] rounded-lg" />
            <Skeleton className="h-[200px] rounded-lg" />
          </div>
        ) : (
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
        )}
      </div>
    )
  }

  const isEmpty = events.length === 0

  function handleDismissWizard() {
    try {
      localStorage.setItem("edictum_wizard_completed", "true")
    } catch {
      // localStorage unavailable
    }
    setWizardDismissed(true)
  }

  const consoleUrl = window.location.origin

  if (isEmpty && !wizardDismissed) {
    return (
      <div className="flex flex-col p-4 h-full overflow-auto">
        {/* Stats bar still shows */}
        <div className="-mx-4 -mt-4 mb-0 border-b border-border bg-card/30">
          <div className="px-4 py-0">
            <StatsBar stats={stats} loading={statsLoading} />
          </div>
        </div>

        {/* Error banner */}
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

        {/* Getting started card */}
        <GettingStarted
          hasKeys={hasKeys}
          hasContracts={hasContracts}
          consoleUrl={consoleUrl}
          onDismiss={handleDismissWizard}
        />

        {/* Agent fleet empty state */}
        <div className="mt-8">
          <AgentGrid agents={[]} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-4 h-full overflow-auto">
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

      {/* Two-column layout: triage + activity (stacked on mobile) */}
      {isMobile ? (
        <div className="mt-4 space-y-4 [&>*]:h-auto">
          <TriageColumn approvals={approvals} onDecisionMade={handleDecisionMade} />
          <ActivityColumn events={events} />
        </div>
      ) : (
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
      )}

      {/* Agent Fleet - scrolls with page */}
      <div className="mt-4">
        <AgentGrid agents={agents} />
      </div>
    </div>
  )
}
