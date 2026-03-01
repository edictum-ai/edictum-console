import { useState, useEffect } from "react"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { HealthResponse } from "@/lib/api"

interface SystemSectionProps {
  health: HealthResponse | null
  loading: boolean
  lastChecked: Date | null
  onRefresh: () => void
}

function LastCheckedTimer({ date }: { date: Date }) {
  const [seconds, setSeconds] = useState(() =>
    Math.floor((Date.now() - date.getTime()) / 1000)
  )

  useEffect(() => {
    setSeconds(Math.floor((Date.now() - date.getTime()) / 1000))
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - date.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [date])

  const label = seconds < 5 ? "just now" : `${seconds}s ago`
  return <span className="text-xs text-muted-foreground">{label}</span>
}

function StatusDot({ status }: { status: "ok" | "degraded" | "down" }) {
  const colors = {
    ok: "bg-emerald-600 dark:bg-emerald-500",
    degraded: "bg-amber-600 dark:bg-amber-500",
    down: "bg-red-600 dark:bg-red-500",
  }
  return <span className={`inline-block size-2 rounded-full ${colors[status]}`} />
}

function overallStatus(health: HealthResponse): "ok" | "degraded" | "down" {
  if (health.status === "ok") return "ok"
  if (health.status === "degraded") return "degraded"
  return "down"
}

function serviceStatus(connected?: boolean): "ok" | "down" {
  return connected ? "ok" : "down"
}

export function SystemSection({ health, loading, lastChecked, onRefresh }: SystemSectionProps) {
  if (loading && !health) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
          <Skeleton className="h-px w-full" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!health) return null

  const status = overallStatus(health)
  const statusLabel = status === "ok" ? "Healthy" : status === "degraded" ? "Degraded" : "Unhealthy"

  // Backward compatibility: infer DB/Redis status from overall status
  const dbConnected = health.database?.connected ?? (health.status === "ok")
  const dbLatency = health.database?.latency_ms
  const redisConnected = health.redis?.connected ?? (health.status === "ok")
  const redisLatency = health.redis?.latency_ms
  const agentCount = health.connected_agents ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-medium">System Status</CardTitle>
        <div className="flex items-center gap-2">
          {lastChecked && <LastCheckedTimer date={lastChecked} />}
          <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overview grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex items-center gap-1.5">
              <StatusDot status={status} />
              <span className="text-sm font-medium">{statusLabel}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Version</p>
            <p className="font-mono text-sm font-medium">{health.version}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Auth</p>
            <p className="text-sm font-medium capitalize">{health.auth_provider}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Setup</p>
            <div className="flex items-center gap-1.5">
              {health.bootstrap_complete ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium">Complete</span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <Button variant="link" size="sm" className="h-auto p-0 text-sm" asChild>
                    <Link to="/dashboard/setup">Complete setup</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Services */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Services</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ServiceItem
              name="Database"
              connected={dbConnected}
              latency={dbLatency}
            />
            <ServiceItem
              name="Redis"
              connected={redisConnected}
              latency={redisLatency}
            />
            <ServiceItem
              name="Agents"
              connected={agentCount > 0}
              count={agentCount}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ServiceItem({
  name,
  connected,
  latency,
  count,
}: {
  name: string
  connected: boolean
  latency?: number | null
  count?: number
}) {
  const connectedLabel = count !== undefined
    ? `${count} connected`
    : connected ? "Connected" : "Unavailable"

  return (
    <div className="flex items-center gap-2">
      <StatusDot status={serviceStatus(connected)} />
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">
        {connectedLabel}
        {latency != null && ` (${latency}ms)`}
      </span>
    </div>
  )
}
