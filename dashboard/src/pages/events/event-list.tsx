import { useMemo, useCallback, useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Search, X, Clock } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import type { EventResponse } from "@/lib/api"
import {
  extractProvenance,
  contractLabel,
  isObserveFinding,
  extractArgsPreview,
} from "@/lib/payload-helpers"
import { verdictColor, VerdictIcon } from "@/lib/verdict-helpers"
import { formatTime, truncate } from "@/lib/format"
import {
  buildHistogram,
  histogramConfig,
  type HistogramBucket,
  type TimeWindow,
  type PresetKey,
  PRESETS,
  PRESET_KEYS,
  DEFAULT_TIME_WINDOW,
  resolveWindow,
  formatCustomLabel,
  toLocalISOString,
} from "@/lib/histogram"

// -- Component -------------------------------------------------------------

interface EventListProps {
  events: EventResponse[]
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedEventId: string | null
  onSelectEvent: (id: string) => void
  newEventCount: number
  onShowNewEvents: () => void
  timeWindow: TimeWindow
  onTimeWindowChange: (tw: TimeWindow) => void
  highlightedEventId: string | null
  onHighlightComplete: () => void
}

export function EventList({
  events,
  searchQuery,
  onSearchChange,
  selectedEventId,
  onSelectEvent,
  newEventCount,
  onShowNewEvents,
  timeWindow,
  onTimeWindowChange,
  highlightedEventId,
  onHighlightComplete,
}: EventListProps) {
  const histogramData = useMemo(() => buildHistogram(events, timeWindow), [events, timeWindow])
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Scroll to and highlight deep-linked event
  useEffect(() => {
    if (!highlightedEventId) return
    const el = rowRefs.current.get(highlightedEventId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    const timer = setTimeout(() => onHighlightComplete(), 2000)
    return () => clearTimeout(timer)
  }, [highlightedEventId, onHighlightComplete])

  // Custom range inline state
  const [showCustomInputs, setShowCustomInputs] = useState(false)
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const handleBarClick = useCallback(
    (data: HistogramBucket) => {
      onTimeWindowChange({ kind: "custom", start: data._start, end: data._end })
      setShowCustomInputs(false)
    },
    [onTimeWindowChange],
  )

  const handlePresetSelect = useCallback(
    (value: string) => {
      if (value === "custom") {
        const { start, end } = resolveWindow(timeWindow)
        setCustomStart(toLocalISOString(new Date(start)))
        setCustomEnd(toLocalISOString(new Date(end)))
        setShowCustomInputs(true)
        return
      }
      setShowCustomInputs(false)
      onTimeWindowChange({ kind: "preset", key: value as PresetKey })
    },
    [timeWindow, onTimeWindowChange],
  )

  const handleCustomApply = useCallback(() => {
    const s = new Date(customStart).getTime()
    const e = new Date(customEnd).getTime()
    if (!Number.isNaN(s) && !Number.isNaN(e) && s < e) {
      onTimeWindowChange({ kind: "custom", start: s, end: e })
      setShowCustomInputs(false)
    }
  }, [customStart, customEnd, onTimeWindowChange])

  const selectValue = timeWindow.kind === "preset" ? timeWindow.key : "custom"
  const customLabel =
    timeWindow.kind === "custom"
      ? formatCustomLabel(timeWindow.start, timeWindow.end)
      : null

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Search bar */}
      <div className="border-b border-border px-3 py-2">
        <InputGroup className="border-0 shadow-none">
          <InputGroupAddon>
            <Search className="h-4 w-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search events... (agent, tool, args)"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs">{events.length} events</span>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {/* New events banner */}
      {newEventCount > 0 && (
        <Button
          variant="ghost"
          onClick={onShowNewEvents}
          className="mx-3 mt-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
        >
          Show {newEventCount} New Event{newEventCount > 1 ? "s" : ""}
        </Button>
      )}

      {/* Histogram */}
      {histogramData.length > 0 && (
        <Card className="mx-3 mt-3 rounded-lg border-border bg-card/50 py-0">
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Verdict Distribution
                </span>
                <div className="flex items-center gap-1">
                  <Select value={selectValue} onValueChange={handlePresetSelect}>
                    <SelectTrigger className="h-6 w-[100px] text-[10px] border-border/50">
                      <SelectValue>
                        {customLabel ?? PRESETS[timeWindow.kind === "preset" ? timeWindow.key : "24h"].label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_KEYS.map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {PRESETS[key].label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Custom...
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {timeWindow.kind === "custom" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCustomInputs(false)
                        onTimeWindowChange(DEFAULT_TIME_WINDOW)
                      }}
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
                  Allowed
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
                  Denied
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                  Pending
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-600" />
                  Observed
                </span>
              </div>
            </div>
            {/* Inline custom time range inputs */}
            {showCustomInputs && (
              <div className="mt-2 flex items-end gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">From</Label>
                  <Input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-7 w-[180px] text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">To</Label>
                  <Input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-7 w-[180px] text-xs"
                  />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={handleCustomApply}>
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setShowCustomInputs(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <div className="px-2 pb-2">
            <ChartContainer config={histogramConfig} className="h-[130px] w-full [&>div]:!aspect-auto">
              <BarChart
                accessibilityLayer
                data={histogramData}
                barGap={1}
                onClick={(state) => {
                  if (state?.activePayload?.[0]?.payload) {
                    handleBarClick(state.activePayload[0].payload as HistogramBucket)
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="allowed" stackId="a" fill="var(--color-allowed)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="denied" stackId="a" fill="var(--color-denied)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="observed" stackId="a" fill="var(--color-observed)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </Card>
      )}

      {/* Event List */}
      <div className="flex-1 overflow-y-auto px-3 pt-2">
        <div className="space-y-px pb-3">
          {events.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No events found</p>
            </div>
          )}
          {events.map((event) => {
            const isSelected = event.id === selectedEventId
            const isHighlighted = event.id === highlightedEventId
            const argsPreview = extractArgsPreview(event)
            const observe = isObserveFinding(event)
            const prov = extractProvenance(event)
            const label = contractLabel(prov)
            return (
              <button
                key={event.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(event.id, el)
                  else rowRefs.current.delete(event.id)
                }}
                onClick={() => onSelectEvent(event.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                  observe ? "opacity-75" : ""
                } ${
                  isHighlighted
                    ? "animate-highlight-fade bg-primary/20 ring-2 ring-primary/40"
                    : isSelected
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-accent/50"
                }`}
              >
                <VerdictIcon verdict={event.verdict} />

                <span className="w-[72px] shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatTime(event.timestamp)}
                </span>

                <span className="w-[110px] shrink-0 truncate text-xs font-medium text-foreground">
                  {event.agent_id}
                </span>

                <Badge
                  variant="outline"
                  className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal"
                >
                  {event.tool_name}
                </Badge>

                {label && (
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal border-violet-500/30 text-violet-600 dark:text-violet-400"
                  >
                    {label}
                  </Badge>
                )}

                {argsPreview && (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {truncate(argsPreview, 60)}
                  </span>
                )}

                <Badge
                  variant="outline"
                  className={`h-5 shrink-0 rounded border px-1.5 text-[10px] font-medium ${observe ? "border-dashed" : ""} ${verdictColor(event.verdict)}`}
                >
                  {event.verdict}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
