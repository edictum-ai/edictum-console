import { useState } from "react"
import { useNavigate } from "react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Activity, Zap, ShieldCheck } from "lucide-react"
import type { EventResponse } from "@/lib/api"
import { contractLabel, extractProvenance, isObserveFinding, extractArgsPreview } from "@/lib/payload-helpers"
import { VERDICT_STYLES, normalizeVerdict } from "@/lib/verdict-helpers"
import { formatRelativeTime } from "@/lib/format"
import { buildSimpleHistogram, activityChartConfig } from "@/lib/histogram"
import {
  ChartContainer,
  ChartTooltip as ShadcnChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { BarChart, Bar, XAxis } from "recharts"

type ActivityTab = "all" | "enforced" | "observed"

function VerdictBadge({ verdict }: { verdict: string }) {
  const style = VERDICT_STYLES[normalizeVerdict(verdict)] ?? VERDICT_STYLES["timeout"]
  return (
    <Badge variant="outline" className={style}>
      {verdict}
    </Badge>
  )
}

function EventIcon({ verdict }: { verdict: string }) {
  switch (normalizeVerdict(verdict)) {
    case "denied":
    case "would_deny":
      return <ShieldCheck className="size-3.5 text-red-600 dark:text-red-400" />
    case "pending":
      return <ShieldCheck className="size-3.5 text-amber-600 dark:text-amber-400" />
    default:
      return <Zap className="size-3.5 text-blue-600 dark:text-blue-400" />
  }
}

interface ActivityColumnProps {
  events: EventResponse[]
}

export function ActivityColumn({ events }: ActivityColumnProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActivityTab>("all")

  const histogram = buildSimpleHistogram(events)

  const filteredEvents = events.filter((e) => {
    if (activeTab === "all") return true
    if (activeTab === "enforced") return e.mode === "enforce"
    if (activeTab === "observed") return isObserveFinding(e)
    return true
  })

  const tabs: { id: ActivityTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "enforced", label: "Enforced" },
    { id: "observed", label: "Observed" },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Mini Histogram */}
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">
            Verdict Distribution (24h)
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-emerald-500/50" />
              allowed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-red-500/60" />
              denied
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-amber-500/50" />
              observed
            </span>
          </div>
        </div>
        <ChartContainer config={activityChartConfig} className="h-[48px] w-full [&>div]:!aspect-auto">
          <BarChart accessibilityLayer data={histogram}>
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <ShadcnChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="allowed" stackId="v" fill="var(--color-allowed)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="denied" stackId="v" fill="var(--color-denied)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="observed" stackId="v" fill="var(--color-observed)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      {/* Activity Stream Header */}
      <div className="shrink-0 px-6 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Recent Activity
          </h2>
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                size="sm"
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                className="h-6 px-2 text-xs"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Event List */}
      <ScrollArea className="flex-1">
        <div className="px-6 pb-4">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Activity className="h-10 w-10 mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Events appear here when agents start making tool calls. Connect an agent to start seeing activity.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {filteredEvents.slice(0, 15).map((event, idx) => {
                const isObserve = isObserveFinding(event)
                return (
                <div key={event.id}>
                  <div
                    className={`flex items-start gap-3 py-2.5 group hover:bg-accent/50 -mx-2 px-2 rounded-md transition-colors cursor-pointer ${isObserve ? "opacity-75" : ""}`}
                    onClick={() => void navigate(`/dashboard/events?event=${event.id}`)}
                  >
                    <div className="mt-0.5 shrink-0">
                      <EventIcon verdict={event.verdict} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {event.agent_id}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {event.tool_name}
                        </span>
                        <VerdictBadge verdict={event.verdict} />
                        {(() => {
                          const prov = extractProvenance(event)
                          const label = contractLabel(prov)
                          return label ? (
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 border-violet-500/30 text-violet-600 dark:text-violet-400">
                              {label}
                            </Badge>
                          ) : null
                        })()}
                      </div>
                      {extractArgsPreview(event) && (
                        <p className="text-xs text-muted-foreground truncate font-mono">
                          {extractArgsPreview(event)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                  {idx < filteredEvents.length - 1 && <Separator />}
                </div>
                )
              })}
              {filteredEvents.length > 15 && (
                <div className="pt-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => void navigate("/dashboard/events")}
                  >
                    View all events
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
