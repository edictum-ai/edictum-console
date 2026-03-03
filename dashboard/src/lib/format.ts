/**
 * Shared formatting utilities.
 * Single source of truth — no duplicates allowed elsewhere.
 */

/** Relative time string like "5s ago", "3m ago", "2h ago", "1d ago". Handles empty/missing/invalid timestamps and clock skew. */
export function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return "never"
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return "invalid date"
  const diff = Date.now() - date.getTime()
  if (diff < 0) return "just now"
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Format ISO timestamp to HH:MM:SS (24h). */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/** Truncate string to `len` chars, appending "..." if trimmed. */
export function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "..." : s
}

/** Format duration between two ISO timestamps as "Xs" or "Xm Ys". */
export function formatResponseTime(createdAt: string, decidedAt: string | null): string {
  if (!decidedAt) return "-"
  const diff = new Date(decidedAt).getTime() - new Date(createdAt).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

/** Format tool_args as inline "key=value, key=value" string. */
export function formatArgs(args: Record<string, unknown> | null): string {
  if (!args) return ""
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ")
}

/** Pretty-print tool_args as indented JSON. */
export function formatToolArgs(toolArgs: Record<string, unknown> | null): string {
  if (!toolArgs) return "(no arguments)"
  return JSON.stringify(toolArgs, null, 2)
}

/** Format a duration in seconds to human-readable string like "5 minutes" or "2h 30m". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours} hour${hours !== 1 ? "s" : ""}`
}

/** Convert a relative time string like "24h" or "7d" to an ISO timestamp. */
export function sinceToIso(since: string): string {
  const units: Record<string, number> = { h: 3600000, d: 86400000 }
  const match = since.match(/^(\d+)([hd])$/)
  if (!match) return new Date(Date.now() - 86400000).toISOString()
  return new Date(Date.now() - parseInt(match[1]) * units[match[2]]).toISOString()
}

