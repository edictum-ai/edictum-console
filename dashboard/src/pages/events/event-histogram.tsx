import { useCallback, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Clock, X } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
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

const LEGEND_ITEMS = [
  { color: "bg-emerald-500", label: "Allowed" },
  { color: "bg-red-500", label: "Denied" },
  { color: "bg-amber-500", label: "Pending" },
  { color: "bg-amber-600", label: "Observed" },
] as const

interface EventHistogramProps {
  histogramData: HistogramBucket[]
  timeWindow: TimeWindow
  onTimeWindowChange: (tw: TimeWindow) => void
}

export function EventHistogram({
  histogramData,
  timeWindow,
  onTimeWindowChange,
}: EventHistogramProps) {
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
  const customLabel = timeWindow.kind === "custom" ? formatCustomLabel(timeWindow.start, timeWindow.end) : null

  return (
    <Card className="mx-3 mt-3 rounded-lg border-border bg-card/50 py-0">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Verdict Distribution</span>
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
            {LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={`inline-block h-2 w-2 rounded-sm ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
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
            <XAxis dataKey="time" tickLine={false} tickMargin={10} axisLine={false} />
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
  )
}
