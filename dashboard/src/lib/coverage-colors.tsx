/**
 * Coverage status color definitions, icons, and badges.
 * Single source of truth — text-*-600 dark:text-*-400 for light/dark compatibility.
 */

import { Eye, ShieldCheck, ShieldOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"

/** Badge-style classes for coverage status (bg + text + border). Light/dark safe. */
export const COVERAGE_STYLES = {
  enforced: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  observed: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  ungoverned: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
} as const

export type CoverageStatus = keyof typeof COVERAGE_STYLES

/** Coverage status icon component. Light/dark safe. */
export function CoverageIcon({ status, className = "h-3.5 w-3.5" }: { status: CoverageStatus; className?: string }) {
  switch (status) {
    case "enforced":
      return <ShieldCheck className={`${className} text-emerald-600 dark:text-emerald-400`} />
    case "observed":
      return <Eye className={`${className} text-amber-600 dark:text-amber-400`} />
    case "ungoverned":
      return <ShieldOff className={`${className} text-red-600 dark:text-red-400`} />
  }
}

/** Coverage status badge using shadcn Badge. */
export function CoverageBadge({ status }: { status: CoverageStatus }) {
  return (
    <Badge variant="outline" className={`${COVERAGE_STYLES[status]} text-[10px]`}>
      {status}
    </Badge>
  )
}

/** Dot color class for filter indicators (mirrors verdictDot pattern). */
export function coverageDot(status: CoverageStatus): string {
  switch (status) {
    case "enforced":
      return "bg-emerald-500"
    case "observed":
      return "bg-amber-500"
    case "ungoverned":
      return "bg-red-500"
  }
}
