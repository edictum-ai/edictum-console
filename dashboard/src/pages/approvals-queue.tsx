import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  LayoutGrid,
  List,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import {
  listApprovals,
  submitDecision,
  type ApprovalResponse,
} from "@/lib/api"
import { createDashboardSSE } from "@/lib/sse"
import { useAuth } from "@/hooks/use-auth"
import { getTimerState } from "./approvals/timer"
import { ApprovalCard } from "./approvals/approval-card"
import { ApprovalsTable } from "./approvals/approvals-table"
import { HistoryTable } from "./approvals/history-table"

type ViewMode = "auto" | "cards" | "table"

const CARD_THRESHOLD = 5

export function ApprovalsQueue() {
  const { user } = useAuth()
  const [pending, setPending] = useState<ApprovalResponse[]>([])
  const [history, setHistory] = useState<ApprovalResponse[]>([])
  const [loadingPending, setLoadingPending] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [acting, setActing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("auto")
  const [sseConnected, setSseConnected] = useState(false)
  const sseRef = useRef<ReturnType<typeof createDashboardSSE> | null>(null)

  // Fetch pending approvals
  const fetchPending = useCallback(async () => {
    try {
      const data = await listApprovals({ status: "pending" })
      setPending(data)
    } catch {
      // Silently handle — SSE will retry
    } finally {
      setLoadingPending(false)
    }
  }, [])

  // Fetch history (approved + denied + timeout, last 50)
  const fetchHistory = useCallback(async () => {
    try {
      const [approved, denied, timeout] = await Promise.all([
        listApprovals({ status: "approved", limit: 20 }),
        listApprovals({ status: "denied", limit: 20 }),
        listApprovals({ status: "timeout", limit: 10 }),
      ])
      const combined = [...approved, ...denied, ...timeout].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setHistory(combined)
    } catch {
      // Silently handle
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    void fetchPending()
    void fetchHistory()
  }, [fetchPending, fetchHistory])

  // SSE for real-time updates
  useEffect(() => {
    const sse = createDashboardSSE({
      approval_created: () => {
        void fetchPending()
      },
      approval_decided: () => {
        void fetchPending()
        void fetchHistory()
      },
      approval_timeout: () => {
        void fetchPending()
        void fetchHistory()
      },
    })

    sse.connect()
    sseRef.current = sse
    setSseConnected(true)

    return () => {
      sse.disconnect()
      sseRef.current = null
      setSseConnected(false)
    }
  }, [fetchPending, fetchHistory])

  // Approve a single approval
  async function handleApprove(id: string) {
    setActing(true)
    try {
      await submitDecision(id, true, user?.email)
      setPending((prev) => prev.filter((a) => a.id !== id))
      void fetchHistory()
    } catch {
      // Error handling — could add toast later
    } finally {
      setActing(false)
    }
  }

  // Deny a single approval
  async function handleDeny(id: string, reason: string) {
    setActing(true)
    try {
      await submitDecision(id, false, user?.email, reason)
      setPending((prev) => prev.filter((a) => a.id !== id))
      void fetchHistory()
    } catch {
      // Error handling
    } finally {
      setActing(false)
    }
  }

  // Bulk approve
  async function handleBulkApprove(ids: string[]) {
    setActing(true)
    try {
      await Promise.all(ids.map((id) => submitDecision(id, true, user?.email)))
      setPending((prev) => prev.filter((a) => !ids.includes(a.id)))
      void fetchHistory()
    } catch {
      // Error handling
    } finally {
      setActing(false)
    }
  }

  // Bulk deny
  async function handleBulkDeny(ids: string[], reason: string) {
    setActing(true)
    try {
      await Promise.all(ids.map((id) => submitDecision(id, false, user?.email, reason)))
      setPending((prev) => prev.filter((a) => !ids.includes(a.id)))
      void fetchHistory()
    } catch {
      // Error handling
    } finally {
      setActing(false)
    }
  }

  // Determine card vs table mode
  const isCardMode = viewMode === "cards" || (viewMode === "auto" && pending.length < CARD_THRESHOLD)

  // Count approvals in red zone (expiring soon)
  const expiringCount = pending.filter(
    (a) => getTimerState(a.created_at, a.timeout_seconds).zone === "red",
  ).length

  if (loadingPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-5 text-amber-400" />
            Approvals Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} pending{" "}
            {pending.length === 1 ? "approval" : "approvals"}
            {pending.length > 0 && " — agents are waiting"}
            {!sseConnected && (
              <span className="ml-2 text-amber-400">Live updates paused — reconnecting...</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <Button
              size="icon-xs"
              variant={isCardMode ? "default" : "ghost"}
              onClick={() => setViewMode(viewMode === "cards" ? "auto" : "cards")}
              title="Card view"
            >
              <LayoutGrid className="size-3" />
            </Button>
            <Button
              size="icon-xs"
              variant={!isCardMode ? "default" : "ghost"}
              onClick={() => setViewMode(viewMode === "table" ? "auto" : "table")}
              title="Table view"
            >
              <List className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Urgency banner */}
      {expiringCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 animate-pulse">
          <ShieldAlert className="size-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">
            {expiringCount} approval{expiringCount > 1 ? "s" : ""} expiring soon
          </span>
        </div>
      )}

      {/* Tabs: Pending / History */}
      <Tabs defaultValue="pending">
        <TabsList variant="line">
          <TabsTrigger value="pending">
            Pending
            {pending.length > 0 && (
              <Badge
                variant="outline"
                className="ml-1.5 bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] h-4 px-1.5"
              >
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="mb-3 size-10 text-emerald-400" />
              <p className="text-sm font-medium">No pending approvals</p>
              <p className="text-xs text-muted-foreground mt-1">
                All agents are running freely
              </p>
            </div>
          ) : isCardMode ? (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3 items-stretch">
              {pending.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  acting={acting}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <ApprovalsTable
                approvals={pending}
                onApprove={handleApprove}
                onDeny={handleDeny}
                onBulkApprove={handleBulkApprove}
                onBulkDeny={handleBulkDeny}
                acting={acting}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTable approvals={history} loading={loadingHistory} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
