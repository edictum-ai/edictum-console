import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime } from "@/lib/format"
import { CoverageBar } from "./coverage-bar"
import { DRIFT_STYLES } from "@/lib/coverage-colors"
import type { AgentCoverage, AgentCoverageSummaryEntry } from "@/lib/api/agents"

interface AgentHeaderProps {
  data: AgentCoverage
  fleetEntry: AgentCoverageSummaryEntry | undefined
  loading: boolean
  onBack: () => void
}

export function AgentHeader({ data, fleetEntry, loading, onBack }: AgentHeaderProps) {
  const driftStatus = fleetEntry?.drift_status ?? "unknown"
  const driftStyle = DRIFT_STYLES[driftStatus] ?? DRIFT_STYLES.unknown

  return (
    <>
      <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Agents
      </Button>

      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{data.agent_id}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <EnvBadge env={data.environment} />
          <Badge variant="outline" className={driftStyle.className}>{driftStyle.label}</Badge>
          {data.deployed_bundle && (
            <Badge variant="outline" className="text-xs font-mono">v{data.deployed_bundle.version}</Badge>
          )}
          {fleetEntry?.last_seen && (
            <span className="text-xs text-muted-foreground">
              Last seen: {formatRelativeTime(fleetEntry.last_seen)}
            </span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-w-md">
          <p className="text-xs text-muted-foreground mb-1">
            Coverage: {data.summary.enforced}/{data.summary.total_tools} tools governed ({data.summary.coverage_pct}%)
          </p>
          <CoverageBar
            enforced={data.summary.enforced}
            observed={data.summary.observed}
            ungoverned={data.summary.ungoverned}
          />
        </div>
      </div>
    </>
  )
}

interface MetricCardProps {
  label: string
  value: number
  accent?: string
  onClick?: () => void
}

export function MetricCard({ label, value, accent, onClick }: MetricCardProps) {
  return (
    <Card className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""} onClick={onClick}>
      <CardContent className="pt-4 pb-3 px-4">
        <p className={`text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}

export function AgentDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Agents
      </Button>

      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-2 w-96" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <Skeleton className="h-8 w-12 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
