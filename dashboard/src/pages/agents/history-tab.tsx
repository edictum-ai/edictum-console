import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router"
import { Rocket, CheckCircle, AlertTriangle, Eye, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { getAgentHistory, type HistoryEvent } from "@/lib/api/agents"
import { formatRelativeTime } from "@/lib/format"

interface HistoryTabProps {
  agentId: string
}

const DOT_COLORS: Record<HistoryEvent["type"], string> = {
  deployment: "bg-blue-500",
  drift_resolved: "bg-emerald-500",
  drift_detected: "bg-amber-500",
  first_seen: "bg-zinc-500",
}

const ICONS: Record<HistoryEvent["type"], React.ReactNode> = {
  deployment: <Rocket className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />,
  drift_resolved: <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
  drift_detected: <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
  first_seen: <Eye className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />,
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours} hour${hours !== 1 ? "s" : ""}`
}

function eventTitle(event: HistoryEvent): string {
  switch (event.type) {
    case "deployment":
      return "Contract update deployed"
    case "drift_resolved":
      return "Agent policy synced"
    case "drift_detected":
      return "Drift detected"
    case "first_seen":
      return "Agent first seen"
  }
}

function EventDescription({ event }: { event: HistoryEvent }) {
  switch (event.type) {
    case "deployment":
      return (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {event.bundle_name} v{event.bundle_version}
            {event.deployed_by && <span> &middot; by {event.deployed_by}</span>}
          </p>
          {event.bundle_name && event.bundle_version != null && (
            <Link
              to={`/dashboard/contracts?bundle=${encodeURIComponent(event.bundle_name)}&version=${event.bundle_version}&tab=diff`}
              className="text-xs text-primary hover:underline"
            >
              View Diff
            </Link>
          )}
        </div>
      )
    case "drift_resolved":
      return (
        <p className="text-xs text-muted-foreground">
          {event.drift_duration_seconds != null
            ? `Drift resolved after ${formatDuration(event.drift_duration_seconds)}`
            : "Drift resolved"}
        </p>
      )
    case "drift_detected":
      return (
        <p className="text-xs text-muted-foreground">
          Expected {event.expected_version?.slice(0, 8) ?? "unknown"} &rarr; actual{" "}
          {event.actual_version?.slice(0, 8) ?? "unknown"}
        </p>
      )
    case "first_seen":
      return (
        <p className="text-xs text-muted-foreground">
          {event.environment && `Environment: ${event.environment}`}
        </p>
      )
  }
}

export function HistoryTab({ agentId }: HistoryTabProps) {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getAgentHistory(agentId)
      setEvents(result.events)
    } catch {
      setError("Failed to load history")
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  if (loading && events.length === 0) {
    return (
      <div className="space-y-6 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 pl-8">
            <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void fetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-10 w-10" />}
        title="No history available"
        description="No history available for this agent."
      />
    )
  }

  return (
    <div className="relative pl-8 py-2">
      {/* Vertical line */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

      {events.map((event, i) => (
        <div key={`${event.type}-${event.timestamp}-${i}`} className="relative pb-8 last:pb-0">
          {/* Dot */}
          <div
            className={`absolute left-3 -translate-x-1/2 mt-1.5 h-2.5 w-2.5 rounded-full ${DOT_COLORS[event.type]}`}
          />

          {/* Content */}
          <div className="ml-4">
            <div className="flex items-center gap-2">
              {ICONS[event.type]}
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(event.timestamp)} &mdash;{" "}
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
            <p className="text-sm font-medium mt-0.5">{eventTitle(event)}</p>
            <div className="mt-0.5">
              <EventDescription event={event} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
