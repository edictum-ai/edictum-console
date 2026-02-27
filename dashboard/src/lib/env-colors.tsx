/**
 * Environment color definitions and EnvBadge component.
 * Single source of truth — text-*-600 dark:text-*-400 for light/dark compatibility.
 */

import { Badge } from "@/components/ui/badge"

/** Standardized env colors: bg/15, border/30, text-600 dark:text-400. */
export const ENV_COLORS: Record<string, string> = {
  production: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  staging: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  development: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
}

const DEFAULT_ENV_STYLE = "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30"

export function EnvBadge({ env }: { env: string }) {
  const style = ENV_COLORS[env] ?? DEFAULT_ENV_STYLE
  return (
    <Badge variant="outline" className={`${style} text-[10px]`}>
      {env}
    </Badge>
  )
}
