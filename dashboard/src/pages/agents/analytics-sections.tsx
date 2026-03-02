import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis } from "recharts"
import { histogramConfig, type HistogramBucket } from "@/lib/histogram"
import type { ToolCoverageEntry, CoverageSummary, FleetCoverage } from "@/lib/api/agents"

export function VerdictChart({ data, loading }: { data: HistogramBucket[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Verdict Distribution</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-[200px] w-full" /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Verdict Distribution</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={histogramConfig} className="h-[200px] w-full [&>div]:!aspect-auto">
          <AreaChart data={data} accessibilityLayer>
            <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area type="monotone" dataKey="allowed" stackId="1" fill="var(--color-allowed)" stroke="var(--color-allowed)" fillOpacity={0.4} />
            <Area type="monotone" dataKey="denied" stackId="1" fill="var(--color-denied)" stroke="var(--color-denied)" fillOpacity={0.4} />
            <Area type="monotone" dataKey="observed" stackId="1" fill="var(--color-observed)" stroke="var(--color-observed)" fillOpacity={0.4} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function DenialHotspots({ tools, totalDenials }: { tools: ToolCoverageEntry[]; totalDenials: number }) {
  if (tools.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Denial Hotspots</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No denials in this time window.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Denial Hotspots</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Contract</TableHead>
              <TableHead className="w-[140px]">Tool</TableHead>
              <TableHead className="w-[80px] text-right">Denials</TableHead>
              <TableHead>% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((tool) => {
              const pct = totalDenials > 0 ? Math.round(((tool.deny_count ?? 0) / totalDenials) * 100) : 0
              return (
                <TableRow key={tool.tool_name}>
                  <TableCell className="text-sm">
                    {tool.contract_name ?? <span className="text-muted-foreground">&mdash;</span>}
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs">{tool.tool_name}</code>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{tool.deny_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function FleetComparison({
  agentTools,
  coverageSummary,
  fleetData,
  since,
}: {
  agentTools: ToolCoverageEntry[]
  coverageSummary: CoverageSummary
  fleetData: FleetCoverage | null
  since: string
}) {
  if (!fleetData || fleetData.agents.length <= 1) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Fleet Comparison</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Fleet comparison requires multiple agents.</p>
        </CardContent>
      </Card>
    )
  }

  const agents = fleetData.agents
  const agentDenials = agentTools.reduce((sum, t) => sum + (t.deny_count ?? 0), 0)
  const agentTotal = agentTools.reduce((sum, t) => sum + t.event_count, 0)
  const agentDenialRate = agentTotal > 0 ? Math.round((agentDenials / agentTotal) * 100) : 0
  const agentEnforcedPct = coverageSummary.coverage_pct

  const fleetEnforcedPct = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + a.coverage_pct, 0) / agents.length)
    : 0

  const fleetEventAvg = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + (a.event_count_24h ?? 0), 0) / agents.length)
    : 0

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Fleet Comparison</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Fleet denial rate requires include_verdicts=true per agent (expensive). Show "—" instead. */}
          <ComparisonRow label="Denial Rate" agentValue={`${agentDenialRate}%`} fleetValue="—" fleetLabel="Fleet avg not computed" />
          <ComparisonRow
            label="Enforced"
            agentValue={`${agentEnforcedPct}%`}
            fleetValue={`${fleetEnforcedPct}%`}
            fleetLabel="Fleet avg"
            warn={agentEnforcedPct < fleetEnforcedPct * 0.8}
          />
          <ComparisonRow label={`Events (${since})`} agentValue={String(agentTotal)} fleetValue={String(fleetEventAvg)} fleetLabel="Fleet avg (24h)" />
        </div>
      </CardContent>
    </Card>
  )
}

function ComparisonRow({
  label, agentValue, fleetValue, fleetLabel, warn,
}: {
  label: string; agentValue: string; fleetValue: string; fleetLabel: string; warn?: boolean
}) {
  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${warn ? "text-red-600 dark:text-red-400" : ""}`}>
          {agentValue}
          <span className="text-xs font-normal text-muted-foreground ml-1">This agent</span>
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">&nbsp;</p>
        <p className="text-lg font-semibold tabular-nums text-muted-foreground">
          {fleetValue}
          <span className="text-xs font-normal ml-1">{fleetLabel}</span>
        </p>
      </div>
    </>
  )
}
