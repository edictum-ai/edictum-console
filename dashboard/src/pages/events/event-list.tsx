import { useMemo, useCallback, useState } from "react"
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
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Shield,
  X,
  Clock,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts"
import type { EventResponse } from "@/lib/api"
import {
  extractProvenance,
  contractLabel,
  isObserveFinding,
} from "@/lib/payload-helpers"

// -- Verdict helpers -------------------------------------------------------

function verdictColor(v: string) {
  switch (v) {
    case "allowed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "denied":
      return "bg-red-500/15 text-red-400 border-red-500/30"
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30"
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  }
}

function VerdictIcon({ verdict }: { verdict: string }) {
  const cls = "h-3.5 w-3.5"
  switch (verdict) {
    case "allowed":
      return <ShieldCheck className={`${cls} text-emerald-400`} />
    case "denied":
      return <ShieldAlert className={`${cls} text-red-400`} />
    case "pending":
      return <ShieldQuestion className={`${cls} text-amber-400`} />
    default:
      return <Shield className={`${cls} text-zinc-400`} />
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function truncate(s: string, len: number) {
  return s.length > len ? s.slice(0, len) + "..." : s
}

function extractArgsPreview(event: EventResponse): string {
  const payload = event.payload
  if (!payload) return ""
  const toolArgs = payload.tool_args as Record<string, unknown> | undefined
  if (!toolArgs) return ""

  const tool = event.tool_name.toLowerCase()
  if (tool.includes("exec") || tool.includes("shell")) {
    const cmd = toolArgs.command ?? toolArgs.cmd
    if (typeof cmd === "string") return cmd
  }
  if (tool.includes("file") || tool.includes("read") || tool.includes("write")) {
    const path = toolArgs.path ?? toolArgs.file
    if (typeof path === "string") return path
  }
  if (tool.includes("sql") || tool.includes("query")) {
    const query = toolArgs.query ?? toolArgs.sql
    if (typeof query === "string") return query
  }
  if (tool.includes("mcp")) {
    const server = toolArgs.server ?? toolArgs.function
    const method = toolArgs.method ?? ""
    if (typeof server === "string") {
      return method ? `${server}.${method}` : server
    }
  }
  if (tool.includes("http") || tool.includes("request") || tool.includes("fetch")) {
    const url = toolArgs.url ?? toolArgs.endpoint
    if (typeof url === "string") return url
  }

  // Fallback: first value
  const firstVal = Object.values(toolArgs)[0]
  if (firstVal !== undefined) {
    return typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal)
  }
  return ""
}

// -- Custom Recharts tooltip ------------------------------------------------

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, entry) => sum + entry.value, 0)
  if (total === 0) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        entry.value > 0 && (
          <div key={i} className="flex items-center gap-2 text-popover-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.name}: {entry.value}</span>
          </div>
        )
      ))}
    </div>
  )
}

// -- Timeframe config -------------------------------------------------------

export type PresetKey = "1h" | "6h" | "12h" | "24h" | "7d"

interface TimeframeConfig {
  label: string
  windowMs: number
  bucketCount: number
  bucketMs: number
}

export const PRESETS: Record<PresetKey, TimeframeConfig> = {
  "1h":  { label: "Last 1h",  windowMs: 1 * 60 * 60 * 1000,  bucketCount: 12, bucketMs: 5 * 60 * 1000 },
  "6h":  { label: "Last 6h",  windowMs: 6 * 60 * 60 * 1000,  bucketCount: 12, bucketMs: 30 * 60 * 1000 },
  "12h": { label: "Last 12h", windowMs: 12 * 60 * 60 * 1000, bucketCount: 12, bucketMs: 60 * 60 * 1000 },
  "24h": { label: "Last 24h", windowMs: 24 * 60 * 60 * 1000, bucketCount: 12, bucketMs: 2 * 60 * 60 * 1000 },
  "7d":  { label: "Last 7d",  windowMs: 7 * 24 * 60 * 60 * 1000, bucketCount: 14, bucketMs: 12 * 60 * 60 * 1000 },
}

const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[]

/** Unified time window — either a preset or a custom absolute range. */
export type TimeWindow =
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; start: number; end: number }

export const DEFAULT_TIME_WINDOW: TimeWindow = { kind: "preset", key: "24h" }

/** Resolve the absolute start/end timestamps for any TimeWindow. */
export function resolveWindow(tw: TimeWindow): { start: number; end: number } {
  if (tw.kind === "custom") return { start: tw.start, end: tw.end }
  const cfg = PRESETS[tw.key]
  const now = Date.now()
  return { start: now - cfg.windowMs, end: now }
}

function bestBucketConfig(windowMs: number): { bucketCount: number; bucketMs: number } {
  // Pick a bucket size that yields 10-14 bars
  const targets = [
    5 * 60 * 1000,       // 5m
    15 * 60 * 1000,      // 15m
    30 * 60 * 1000,      // 30m
    60 * 60 * 1000,      // 1h
    2 * 60 * 60 * 1000,  // 2h
    6 * 60 * 60 * 1000,  // 6h
    12 * 60 * 60 * 1000, // 12h
    24 * 60 * 60 * 1000, // 1d
  ]
  for (const bucketMs of targets) {
    const count = Math.ceil(windowMs / bucketMs)
    if (count >= 4 && count <= 20) return { bucketCount: count, bucketMs }
  }
  return { bucketCount: 12, bucketMs: Math.ceil(windowMs / 12) }
}

function formatBucketLabelForWindow(date: Date, windowMs: number): string {
  const oneDay = 24 * 60 * 60 * 1000
  if (windowMs > 3 * oneDay) {
    // Multi-day: "Mon 6 AM"
    return date.toLocaleDateString("en-US", { weekday: "short" }) +
      " " +
      date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
  }
  if (windowMs > 6 * 60 * 60 * 1000) {
    // >6h: "3 PM"
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
  }
  // Short: "3:30 PM"
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

/** Format a compact label for a custom time window (shown in the selector). */
function formatCustomLabel(start: number, end: number): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  if (s.toDateString() === e.toDateString()) {
    return `${fmtDate(s)} ${fmtTime(s)} - ${fmtTime(e)}`
  }
  return `${fmtDate(s)} ${fmtTime(s)} - ${fmtDate(e)} ${fmtTime(e)}`
}

/** Convert a Date to a `datetime-local` input value (YYYY-MM-DDThh:mm). */
function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// -- Histogram builder -----------------------------------------------------

interface HistogramBucket {
  time: string
  allowed: number
  denied: number
  pending: number
  observed: number
  _start: number
  _end: number
  _index: number
}

function buildHistogram(events: EventResponse[], tw: TimeWindow): HistogramBucket[] {
  let bucketCount: number
  let bucketMs: number
  let windowStart: number
  let windowEnd: number

  if (tw.kind === "preset") {
    const cfg = PRESETS[tw.key]
    bucketCount = cfg.bucketCount
    bucketMs = cfg.bucketMs
    windowEnd = Date.now()
    windowStart = windowEnd - cfg.windowMs
  } else {
    const windowMs = tw.end - tw.start
    const best = bestBucketConfig(windowMs)
    bucketCount = best.bucketCount
    bucketMs = best.bucketMs
    windowStart = tw.start
    windowEnd = tw.end
  }

  const windowMs = windowEnd - windowStart
  const buckets: HistogramBucket[] = []

  for (let i = 0; i < bucketCount; i++) {
    const start = windowStart + i * bucketMs
    const end = Math.min(start + bucketMs, windowEnd)
    const bucket: HistogramBucket = {
      time: formatBucketLabelForWindow(new Date(end), windowMs),
      allowed: 0,
      denied: 0,
      pending: 0,
      observed: 0,
      _start: start,
      _end: end,
      _index: i,
    }
    for (const e of events) {
      const t = new Date(e.timestamp).getTime()
      if (t >= start && t < end) {
        if (isObserveFinding(e)) {
          bucket.observed++
        } else {
          const v = e.verdict.toLowerCase()
          if (v === "allowed") bucket.allowed++
          else if (v === "denied") bucket.denied++
          else if (v === "pending") bucket.pending++
        }
      }
    }
    buckets.push(bucket)
  }
  return buckets
}

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
}: EventListProps) {
  const histogramData = useMemo(() => buildHistogram(events, timeWindow), [events, timeWindow])

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
    <div className="flex min-w-0 flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search events... (agent, tool, args)"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <span className="text-xs text-muted-foreground">
          {events.length} events
        </span>
      </div>

      {/* New events banner */}
      {newEventCount > 0 && (
        <button
          onClick={onShowNewEvents}
          className="mx-3 mt-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
        >
          Show {newEventCount} New Event{newEventCount > 1 ? "s" : ""}
        </button>
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
                  <label className="text-[11px] text-muted-foreground">From</label>
                  <Input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-7 w-[180px] text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">To</label>
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
          <div className="h-[100px] px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histogramData}
                barGap={1}
                onClick={(state) => {
                  if (state?.activePayload?.[0]?.payload) {
                    handleBarClick(state.activePayload[0].payload as HistogramBucket)
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="time"
                  tick={{
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar
                  dataKey="allowed"
                  stackId="a"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                >
                  {histogramData.map((entry) => (
                    <Cell
                      key={`allowed-${entry._index}`}
                      opacity={1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="denied"
                  stackId="a"
                  fill="#ef4444"
                  radius={[0, 0, 0, 0]}
                >
                  {histogramData.map((entry) => (
                    <Cell
                      key={`denied-${entry._index}`}
                      opacity={1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="pending"
                  stackId="a"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                >
                  {histogramData.map((entry) => (
                    <Cell
                      key={`pending-${entry._index}`}
                      opacity={1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="observed"
                  stackId="a"
                  fill="#d97706"
                  radius={[2, 2, 0, 0]}
                >
                  {histogramData.map((entry) => (
                    <Cell
                      key={`observed-${entry._index}`}
                      opacity={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Event List */}
      <div className="px-3 pt-2">
        <div className="space-y-px pb-3">
          {events.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No events found</p>
            </div>
          )}
          {events.map((event) => {
            const isSelected = event.id === selectedEventId
            const argsPreview = extractArgsPreview(event)
            const observe = isObserveFinding(event)
            const prov = extractProvenance(event)
            const label = contractLabel(prov)
            return (
              <button
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                  observe ? "opacity-75" : ""
                } ${
                  isSelected
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
                    className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal border-violet-500/30 text-violet-400"
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
