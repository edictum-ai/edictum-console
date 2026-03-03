/**
 * Fleet Coverage triage section — surfaces ungoverned tools and drifted agents.
 *
 * Self-contained: calls useFleetCoverage internally, renders nothing when the
 * fleet is fully governed, and silently swallows errors (triage column surfaces
 * actionable items, not infrastructure failures).
 */

import { useNavigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ShieldOff, AlertTriangle } from "lucide-react"
import { useFleetCoverage } from "@/hooks/use-fleet-coverage"

export function FleetCoverageTriage() {
  const navigate = useNavigate()
  const { data, loading, error } = useFleetCoverage("24h")

  // Error → render nothing (silent failure per spec)
  if (error && !data) return null

  // Loading with no prior data → skeleton placeholder
  if (loading && !data) {
    return <Skeleton className="h-20 w-full rounded-lg" />
  }

  if (!data) return null

  const { total_ungoverned_tools, with_ungoverned, with_drift } = data.fleet_summary
  const hasUngoverned = total_ungoverned_tools > 0
  const hasDrift = with_drift > 0

  // Fully governed, no drift → nothing to triage
  if (!hasUngoverned && !hasDrift) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <ShieldOff className="size-3.5 text-red-600 dark:text-red-400" />
          Fleet Coverage
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-6 px-2"
          onClick={() => void navigate("/dashboard/agents")}
        >
          View all
        </Button>
      </div>

      <div className="space-y-2">
        {hasUngoverned && (
          <Card
            className="py-0 gap-0 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => void navigate("/dashboard/agents?coverage=has_ungoverned")}
          >
            <div className="p-3 flex items-center gap-2">
              <ShieldOff className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-sm text-foreground">
                <span className="font-semibold">{total_ungoverned_tools}</span>
                {" ungoverned tool"}
                {total_ungoverned_tools !== 1 && "s"}
                {" across "}
                <span className="font-semibold">{with_ungoverned}</span>
                {" agent"}
                {with_ungoverned !== 1 && "s"}
              </span>
            </div>
          </Card>
        )}

        {hasDrift && (
          <Card
            className="py-0 gap-0 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => void navigate("/dashboard/agents?drift=drift")}
          >
            <div className="p-3 flex items-center gap-2">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-foreground">
                <span className="font-semibold">{with_drift}</span>
                {" agent"}
                {with_drift !== 1 && "s"}
                {" with drift"}
              </span>
            </div>
          </Card>
        )}
      </div>
    </section>
  )
}
