/**
 * Shared verdict-related helpers: colors, icons, styles, dots.
 * All colors use text-*-600 dark:text-*-400 for light/dark compatibility.
 *
 * The edictum SDK sends AuditAction values as verdicts:
 *   call_allowed, call_denied, call_would_deny, call_executed, etc.
 * normalizeVerdict() maps these to display keys used for styling.
 */

import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Eye,
} from "lucide-react"

/**
 * Map SDK AuditAction verdict strings to display keys.
 * Handles both raw SDK values and already-normalized values.
 */
export function normalizeVerdict(v: string): string {
  switch (v) {
    case "call_allowed":
    case "allowed":
    case "allow":
      return "allowed"
    case "call_denied":
    case "denied":
    case "deny":
      return "denied"
    case "call_would_deny":
    case "would_deny":
      return "would_deny"
    case "call_executed":
    case "executed":
      return "allowed"
    case "pending":
      return "pending"
    case "timeout":
      return "timeout"
    default:
      return v
  }
}

/** Badge-style classes for verdict (bg + text + border). Light/dark safe. */
export function verdictColor(v: string): string {
  return VERDICT_STYLES[normalizeVerdict(v)] ?? VERDICT_STYLES["timeout"] ?? ""
}

/** Small shield icon colored by verdict. Light/dark safe. */
export function VerdictIcon({ verdict, className = "h-3.5 w-3.5" }: { verdict: string; className?: string }) {
  switch (normalizeVerdict(verdict)) {
    case "allowed":
      return <ShieldCheck className={`${className} text-emerald-600 dark:text-emerald-400`} />
    case "denied":
      return <ShieldAlert className={`${className} text-red-600 dark:text-red-400`} />
    case "would_deny":
      return <Eye className={`${className} text-orange-600 dark:text-orange-400`} />
    case "pending":
      return <ShieldQuestion className={`${className} text-amber-600 dark:text-amber-400`} />
    default:
      return <Shield className={`${className} text-zinc-600 dark:text-zinc-400`} />
  }
}

/** Full badge styling record (bg + text + border). Light/dark safe. */
export const VERDICT_STYLES: Record<string, string> = {
  allowed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  denied: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  would_deny: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  timeout: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
}

/** Dot color class for verdict filter indicators. */
export function verdictDot(v: string): string {
  switch (normalizeVerdict(v)) {
    case "allowed":
      return "bg-emerald-500"
    case "denied":
      return "bg-red-500"
    case "would_deny":
      return "bg-orange-500"
    case "pending":
      return "bg-amber-500"
    default:
      return "bg-zinc-500"
  }
}
