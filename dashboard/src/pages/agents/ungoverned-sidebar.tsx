/**
 * Fleet coverage sidebar — coverage %, ungoverned tools leaderboard, drift count.
 * Left column of the two-column agents layout.
 */

import { useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ShieldCheck, ShieldOff, AlertTriangle } from "lucide-react"
import type { FleetSummaryData, AgentCoverageSummaryEntry } from "@/lib/api"
import { CoverageBar } from "./coverage-bar"

interface UngovernedSidebarProps {
  summary: FleetSummaryData | null
  agents: AgentCoverageSummaryEntry[]
  loading: boolean
  onFilterByTool: (toolName: string) => void
}

export function UngovernedSidebar({ summary, agents, loading, onFilterByTool }: UngovernedSidebarProps) {
  const fleetTotals = useMemo(() => {
    const enforced = agents.reduce((sum, a) => sum + a.enforced, 0)
    const observed = agents.reduce((sum, a) => sum + a.observed, 0)
    const ungoverned = agents.reduce((sum, a) => sum + a.ungoverned, 0)
    const total = enforced + observed + ungoverned
    const pct = total > 0 ? Math.round((enforced / total) * 100) : 0
    return { enforced, observed, ungoverned, total, pct }
  }, [agents])

  if (loading && !summary) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-[100px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    )
  }

  if (!summary) return null

  const sortedUngoverned = [...summary.ungoverned_tools].sort((a, b) => b.agent_count - a.agent_count)
  const driftCount = summary.with_drift

  return (
    <div className="p-3 space-y-3">
      {/* Fleet Coverage % */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fleet Coverage</span>
          </div>
          <p className="text-3xl font-bold tabular-nums">{fleetTotals.pct}%</p>
          <CoverageBar enforced={fleetTotals.enforced} observed={fleetTotals.observed} ungoverned={fleetTotals.ungoverned} />
          <p className="text-xs text-muted-foreground">
            {fleetTotals.enforced}/{fleetTotals.total} tools enforced
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Ungoverned Tools Leaderboard */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="flex items-center gap-1.5">
            <ShieldOff className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium">Ungoverned Tools</span>
          </div>
          <Badge variant="outline" className="text-[10px]">{summary.total_ungoverned_tools}</Badge>
        </div>
        {sortedUngoverned.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">No ungoverned tools</p>
        ) : (
          <ScrollArea className="max-h-[240px] overflow-hidden">
            <div className="space-y-0.5">
              {sortedUngoverned.map((tool) => (
                <Button
                  key={tool.tool_name}
                  variant="ghost"
                  className="w-full justify-between h-auto py-1.5 px-2 text-xs"
                  onClick={() => onFilterByTool(tool.tool_name)}
                >
                  <span className="font-mono truncate">{tool.tool_name}</span>
                  <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                    {tool.agent_count}
                  </Badge>
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Separator />

      {/* Drift section */}
      <div className="px-1">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium">Drift Detected</span>
          {driftCount > 0 && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
              {driftCount}
            </Badge>
          )}
        </div>
        {driftCount === 0 && (
          <p className="text-xs text-muted-foreground">No drift</p>
        )}
      </div>
    </div>
  )
}
