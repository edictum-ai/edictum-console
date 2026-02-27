import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Timer } from "lucide-react"

type TimerZone = "green" | "amber" | "red" | "expired"

interface TimerState {
  remaining: number
  remainingPct: number
  timeStr: string
  zone: TimerZone
}

export function getTimerState(createdAt: string, timeoutSeconds: number): TimerState {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  const remaining = Math.max(timeoutSeconds - elapsed, 0)
  const remainingPct = timeoutSeconds > 0 ? (remaining / timeoutSeconds) * 100 : 0
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const timeStr = `${minutes}:${String(seconds).padStart(2, "0")}`

  let zone: TimerZone = "green"
  if (remaining === 0) zone = "expired"
  else if (remainingPct < 20) zone = "red"
  else if (remainingPct < 60) zone = "amber"

  return { remaining, remainingPct, timeStr, zone }
}

export function useTimerTick(createdAt: string, timeoutSeconds: number): TimerState {
  const [state, setState] = useState(() => getTimerState(createdAt, timeoutSeconds))

  useEffect(() => {
    setState(getTimerState(createdAt, timeoutSeconds))
    const id = setInterval(() => {
      const next = getTimerState(createdAt, timeoutSeconds)
      setState(next)
      if (next.remaining === 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [createdAt, timeoutSeconds])

  return state
}

const zoneTextColor: Record<TimerZone, string> = {
  green: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
  expired: "text-zinc-500",
}

const zoneBadgeStyle: Record<TimerZone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  red: "bg-red-500/15 text-red-400 border-red-500/25 animate-pulse",
  expired: "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
}

const zoneBarColor: Record<TimerZone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  expired: "bg-zinc-500",
}

export function TimerBadge({ createdAt, timeoutSeconds }: { createdAt: string; timeoutSeconds: number }) {
  const { timeStr, zone } = useTimerTick(createdAt, timeoutSeconds)

  return (
    <Badge variant="outline" className={`${zoneBadgeStyle[zone]} font-mono gap-1.5`}>
      <Timer className="size-3" />
      {zone === "expired" ? "Expired" : timeStr}
    </Badge>
  )
}

export function TimerBar({
  createdAt,
  timeoutSeconds,
  showLabel = true,
}: {
  createdAt: string
  timeoutSeconds: number
  showLabel?: boolean
}) {
  const { timeStr, zone, remainingPct } = useTimerTick(createdAt, timeoutSeconds)

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 min-w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${zoneBarColor[zone]} ${zone === "red" ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(remainingPct, 2)}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-mono whitespace-nowrap ${zoneTextColor[zone]}`}>
          {zone === "expired" ? "Expired" : timeStr}
        </span>
      )}
    </div>
  )
}
