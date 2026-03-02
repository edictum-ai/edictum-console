/**
 * Fleet summary — four metric cards + ungoverned tools warning callout.
 * Top section of the Agents page.
 */

import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, ShieldOff, ShieldCheck, AlertTriangle, AlertCircle } from "lucide-react"
import type { FleetSummaryData } from "@/lib/api"

interface FleetSummaryProps {
  summary: FleetSummaryData | null
  loading: boolean
}

export function FleetSummary({ summary, loading }: FleetSummaryProps) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[80px] rounded-lg" />
        ))}
      </div>
    )
  }

  if (!summary) return null

  const metrics = [
    {
      label: "Agents Active",
      value: summary.total_agents,
      icon: Users,
      color: "text-foreground",
    },
    {
      label: "Ungoverned Tools",
      value: summary.total_ungoverned_tools,
      icon: ShieldOff,
      color: summary.total_ungoverned_tools > 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
    },
    {
      label: "Fully Enforced",
      value: summary.fully_enforced,
      icon: ShieldCheck,
      color: summary.fully_enforced > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
    },
    {
      label: "Drift Detected",
      value: summary.with_drift,
      icon: AlertTriangle,
      color: summary.with_drift > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
    },
  ]

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <m.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.total_ungoverned_tools > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {summary.total_ungoverned_tools} ungoverned tool{summary.total_ungoverned_tools !== 1 ? "s" : ""}{" "}
            across {summary.with_ungoverned} agent{summary.with_ungoverned !== 1 ? "s" : ""}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
