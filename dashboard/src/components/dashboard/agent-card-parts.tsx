import {
  Signal,
  AlertTriangle,
  WifiOff,
} from "lucide-react"
import { Area, AreaChart } from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { type AgentStatus } from "@/lib/derive-agents"

export const STATUS_CONFIG: Record<AgentStatus, { label: string; dotClass: string; icon: typeof Signal }> = {
  healthy: { label: "Healthy", dotClass: "bg-emerald-500", icon: Signal },
  degraded: { label: "Degraded", dotClass: "bg-amber-500", icon: AlertTriangle },
  offline: { label: "Offline", dotClass: "bg-zinc-500", icon: WifiOff },
}

export function StatusDot({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === "healthy" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dotClass} opacity-40`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dotClass}`} />
    </span>
  )
}

export const sparklineConfig = {
  v: { label: "Events", color: "var(--color-emerald-500, #10b981)" },
} satisfies ChartConfig

export function MiniSparkline({ data, status, agentName }: { data: number[]; status: AgentStatus; agentName: string }) {
  const color = status === "healthy" ? "var(--success)" : status === "degraded" ? "var(--warning)" : "var(--muted-foreground)"
  const chartData = data.map((v, i) => ({ i, v }))
  const gradientId = `spark-${agentName}-${status}`
  return (
    <ChartContainer config={sparklineConfig} className="h-7 w-full [&>div]:!aspect-auto">
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
