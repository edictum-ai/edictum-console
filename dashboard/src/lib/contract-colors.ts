/**
 * Shared contract type and mode color definitions.
 * Single source of truth — text-*-600 dark:text-*-400 for light/dark compatibility.
 */

/** Contract type badge styles (pre, post, session, sandbox). */
export const CONTRACT_TYPE_COLORS: Record<string, string> = {
  pre: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  post: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  session: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  sandbox: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
}

/** Mode badge styles (enforce, observe). */
export const CONTRACT_MODE_COLORS: Record<string, string> = {
  enforce: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  observe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
}
