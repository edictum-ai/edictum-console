/**
 * Segmented coverage bar — shows enforced/observed/ungoverned proportions.
 * Reusable in both agent list and agent detail views.
 */

interface CoverageBarProps {
  enforced: number
  observed: number
  ungoverned: number
  /** Show the "5/7" text label. Default true. */
  showLabel?: boolean
  /** Compact mode for table cells. Default false. */
  compact?: boolean
}

export function CoverageBar({ enforced, observed, ungoverned, showLabel = true, compact = false }: CoverageBarProps) {
  const total = enforced + observed + ungoverned
  const barHeight = compact ? "h-1.5" : "h-2"
  const gap = compact ? "gap-1.5" : "gap-2"

  if (total === 0) {
    return (
      <div className={`flex items-center ${gap}`}>
        <div className={`flex-1 ${barHeight} rounded-full bg-muted`} />
        {showLabel && <span className="text-xs tabular-nums text-muted-foreground">0/0</span>}
      </div>
    )
  }

  const enforcedPct = (enforced / total) * 100
  const observedPct = (observed / total) * 100
  const ungovernedPct = (ungoverned / total) * 100

  return (
    <div
      className={`flex items-center ${gap}`}
      role="img"
      aria-label={`Coverage: ${enforced} of ${total} tools enforced`}
    >
      <div className={`flex flex-1 ${barHeight} overflow-hidden rounded-full`}>
        {enforcedPct > 0 && (
          <div className="bg-emerald-500" style={{ width: `${enforcedPct}%` }} />
        )}
        {observedPct > 0 && (
          <div className="bg-amber-500" style={{ width: `${observedPct}%` }} />
        )}
        {ungovernedPct > 0 && (
          <div className="bg-red-500" style={{ width: `${ungovernedPct}%` }} />
        )}
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {enforced}/{total}
        </span>
      )}
    </div>
  )
}
