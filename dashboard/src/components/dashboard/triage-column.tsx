/**
 * Triage Column — "Needs Attention" section of the dashboard home.
 *
 * This column surfaces actionable items that require operator attention,
 * sorted by urgency. It's a prioritized triage list, NOT a full feed.
 * Capped at ~10 most urgent items across all categories.
 *
 * Currently implemented:
 * - Pending approvals (sorted by timeout, oldest first)
 *
 * Future items to add (see DASHBOARD.md "Needs Attention" section):
 * - Disconnected agents (no heartbeat for X minutes)
 * - Denial spikes (denials > 2x rolling average in time window)
 * - Failed deployments
 * - Agent dead (no activity for >1 hour)
 *
 * When adding new triage item types:
 * 1. Create a new section similar to "Pending Approvals"
 * 2. Each item type gets its own icon and color scheme
 * 3. Items should have inline actions where possible (approve/deny, dismiss, investigate)
 * 4. Sort all items by urgency across categories, not grouped by type
 * 5. Update the props interface to receive the new data
 */

import { useState } from "react"
import { useNavigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ShieldAlert,
  Clock,
  Bot,
  Check,
  X,
  Eye,
  CheckCircle,
} from "lucide-react"
import { submitDecision, type ApprovalResponse } from "@/lib/api"
import { formatArgs } from "@/lib/format"
import { useTimerTick } from "@/pages/approvals/timer"

function LiveCountdown({ createdAt, timeoutSeconds }: { createdAt: string; timeoutSeconds: number }) {
  const { timeStr, zone } = useTimerTick(createdAt, timeoutSeconds)
  const urgent = zone === "red" || zone === "expired"
  const warning = zone === "amber"
  return (
    <span
      className={`font-mono text-xs tabular-nums ${
        urgent
          ? "text-red-500 dark:text-red-400 font-semibold"
          : warning
            ? "text-amber-500 dark:text-amber-400"
            : "text-muted-foreground"
      }`}
    >
      <Clock className="mr-1 inline-block size-3" />
      {zone === "expired" ? "Expired" : timeStr}
    </span>
  )
}

interface TriageColumnProps {
  approvals: ApprovalResponse[]
  onDecisionMade: () => void
  // TODO: Add when implementing agent presence tracking
  // disconnectedAgents?: Array<{ agent_id: string; last_seen: string }>
  // TODO: Add when implementing denial spike detection
  // denialSpikes?: Array<{ time_window: string; count: number; baseline: number }>
  // TODO: Add when implementing deployment status
  // failedDeployments?: Array<{ env: string; version: string; error: string }>
}

export function TriageColumn({ approvals, onDecisionMade }: TriageColumnProps) {
  const navigate = useNavigate()
  const [decidingIds, setDecidingIds] = useState<Set<string>>(new Set())

  async function handleDecision(id: string, approved: boolean) {
    setDecidingIds((prev) => new Set(prev).add(id))
    try {
      await submitDecision(id, approved)
      onDecisionMade()
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const pending = approvals.filter((a) => a.status === "pending")

  return (
    <div className="border-r border-border flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Triage section - actionable items needing attention */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
                Triage
                {pending.length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 ml-1"
                  >
                    {pending.length}
                  </Badge>
                )}
              </h2>
              {pending.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => void navigate("/dashboard/approvals")}
                >
                  View all
                </Button>
              )}
            </div>

            {pending.length === 0 ? (
              <Card className="py-0 gap-0">
                <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                  No pending approvals
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {pending.slice(0, 10).map((approval) => {
                  const deciding = decidingIds.has(approval.id)
                  return (
                    <Card key={approval.id} className="py-0 gap-0">
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-sm font-medium text-foreground truncate">
                              {approval.tool_name}
                            </span>
                          </div>
                          <LiveCountdown createdAt={approval.created_at} timeoutSeconds={approval.timeout_seconds} />
                        </div>
                        <div className="text-xs text-muted-foreground mb-1 truncate font-mono pl-0">
                          {formatArgs(approval.tool_args)}
                        </div>
                        {approval.message && (
                          <p className="text-xs text-muted-foreground mb-1.5 truncate italic">
                            {approval.message}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Bot className="size-3" />
                            <span>{approval.agent_id}</span>
                            <span className="text-border">|</span>
                            <span>{approval.env}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deciding}
                              className="h-6 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                              onClick={() => void handleDecision(approval.id, true)}
                            >
                              <Check className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deciding}
                              className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                              onClick={() => void handleDecision(approval.id, false)}
                            >
                              <X className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-muted-foreground"
                              onClick={() => void navigate(`/dashboard/approvals`)}
                            >
                              <Eye className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {/* TODO: Disconnected Agents section
              Icon: WifiOff (red)
              Show agents with no heartbeat for X minutes
              Actions: View agent, Dismiss alert */}

          {/* TODO: Denial Spikes section
              Icon: TrendingUp (red)
              Show when denials > 2x rolling average
              Actions: View denied events, Investigate */}

          {/* TODO: Failed Deployments section
              Icon: XCircle (red)
              Show recent deployment failures
              Actions: View deployment, Retry */}
        </div>
      </ScrollArea>
    </div>
  )
}
