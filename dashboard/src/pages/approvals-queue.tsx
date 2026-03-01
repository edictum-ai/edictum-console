import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertCircle,
  LayoutGrid,
  List,
  Shield,
  ShieldAlert,
} from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  listApprovals,
  submitDecision,
  type ApprovalResponse,
} from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
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
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("auto")

  // Fetch pending approvals
  // silent: true for SSE-triggered background refreshes (no toast, no error banner)
  const fetchPending = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    try {
      if (!silent) setError(null)
      const data = await listApprovals({ status: "pending" })
      setPending(data)
      setError(null) // auto-clear on successful refresh
    } catch {
      if (!silent) {
        setError("Failed to load pending approvals")
        toast.error("Failed to load pending approvals")
      }
    } finally {
      setLoadingPending(false)
    }
  }, [])

  // Fetch history (approved + denied + timeout, last 50)
  const fetchHistory = useCallback(async (opts?: { silent?: boolean }) => {
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
      if (!opts?.silent) toast.error("Failed to load approval history")
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    void fetchPending()
    void fetchHistory()
  }, [fetchPending, fetchHistory])

  // SSE for real-time updates — silent refresh, no toast on transient failures
  useDashboardSSE({
    approval_created: () => { void fetchPending({ silent: true }) },
    approval_decided: () => { void fetchPending({ silent: true }); void fetchHistory({ silent: true }) },
    approval_timeout: () => { void fetchPending({ silent: true }); void fetchHistory({ silent: true }) },
  })

  // Approve a single approval
  async function handleApprove(id: string) {
    setActing(true)
    try {
      await submitDecision(id, true, user?.email)
      setPending((prev) => prev.filter((a) => a.id !== id))
      void fetchHistory({ silent: true }) // action succeeded; history refresh is background
    } catch {
      toast.error("Failed to approve request")
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
      void fetchHistory({ silent: true })
    } catch {
      toast.error("Failed to deny request")
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
      void fetchHistory({ silent: true })
    } catch {
      toast.error("Failed to approve selected requests")
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
      void fetchHistory({ silent: true })
    } catch {
      toast.error("Failed to deny selected requests")
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
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={() => { setError(null); void fetchPending() }}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-5 text-amber-600 dark:text-amber-400" />
            Approvals Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} pending{" "}
            {pending.length === 1 ? "approval" : "approvals"}
            {pending.length > 0 && " — agents are waiting"}
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
        <Alert variant="destructive" className="animate-pulse">
          <ShieldAlert className="size-4" />
          <AlertDescription>
            {expiringCount} approval{expiringCount > 1 ? "s" : ""} expiring soon
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs: Pending / History */}
      <Tabs defaultValue="pending">
        <TabsList variant="line">
          <TabsTrigger value="pending">
            Pending
            {pending.length > 0 && (
              <Badge
                variant="outline"
                className="ml-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 text-[10px] h-4 px-1.5"
              >
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pending.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-10 w-10" />}
              title="No pending approvals"
              description="When a contract requires human approval before a tool call executes, it appears here. Add effect: approve to a pre-contract or sandbox contract to enable human-in-the-loop."
            />
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
