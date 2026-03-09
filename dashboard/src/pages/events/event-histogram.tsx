import { useCallback } from "react"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { histogramConfig, type HistogramBucket } from "@/lib/histogram"

const LEGEND_ITEMS = [
  { color: "bg-emerald-500", label: "Allowed" },
  { color: "bg-red-500", label: "Denied" },
  { color: "bg-amber-500", label: "Pending" },
  { color: "bg-amber-600", label: "Observed" },
] as const

interface EventHistogramProps {
  histogramData: HistogramBucket[]
  onBarClick?: (bucket: HistogramBucket) => void
}

export function EventHistogram({ histogramData, onBarClick }: EventHistogramProps) {
  const handleBarClick = useCallback(
    (data: HistogramBucket) => {
      onBarClick?.(data)
    },
    [onBarClick],
  )

  return (
    <Card className="mx-3 mt-3 rounded-lg border-border bg-card/50 py-0">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={`inline-block h-2 w-2 rounded-sm ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
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
            style={{ cursor: onBarClick ? "pointer" : undefined }}
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
