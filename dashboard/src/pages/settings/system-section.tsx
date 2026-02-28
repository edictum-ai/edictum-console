import { useState, useEffect } from "react"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeTime } from "@/lib/format"
import type { HealthResponse } from "@/lib/api"

interface SystemSectionProps {
  health: HealthResponse | null
  loading: boolean
  lastChecked: Date | null
  onRefresh: () => void
}

function useRelativeTime(date: Date | null) {
  const [label, setLabel] = useState("")

  useEffect(() => {
    if (!date) return
    function update() {
      setLabel(formatRelativeTime(date!.toISOString()))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [date])

  return label
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${
        ok
          ? "bg-emerald-600 dark:bg-emerald-500"
          : "bg-red-600 dark:bg-red-500"
      }`}
    />
  )
}

export function SystemSection({
  health,
  loading,
  lastChecked,
  onRefresh,
}: SystemSectionProps) {
  const timeLabel = useRelativeTime(lastChecked)
  const isOk = health?.status === "ok"

  if (loading && !health) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">System</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">System</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {timeLabel && <span>Last checked: {timeLabel}</span>}
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Version</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold">
              {health?.version ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth Provider</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">
              {health?.auth_provider ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusDot ok={isOk} />
              <p className="text-2xl font-bold">{health?.status ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service health */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Database</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusDot ok={isOk} />
              <span className="text-sm font-medium">
                {isOk ? "Connected" : "Unavailable"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Redis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusDot ok={isOk} />
              <span className="text-sm font-medium">
                {isOk ? "Connected" : "Unavailable"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bootstrap status */}
      {health && (
        <div className="flex items-center gap-2 text-sm">
          {health.bootstrap_complete ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-500" />
              <span>Setup complete</span>
            </>
          ) : (
            <>
              <AlertCircle className="size-4 text-amber-600 dark:text-amber-500" />
              <span>Setup incomplete</span>
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link to="/dashboard/setup">Complete setup</Link>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
