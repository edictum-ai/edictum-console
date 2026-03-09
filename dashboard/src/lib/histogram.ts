/**
 * Histogram builder for event distribution charts.
 * Canonical implementation from events feed — supports presets and custom windows.
 */

import type { ChartConfig } from "@/components/ui/chart"
import { isObserveFinding } from "@/lib/payload-helpers"
import { normalizeVerdict } from "@/lib/verdict-helpers"

// -- Types ------------------------------------------------------------------

export interface HistogramBucket {
  time: string
  allowed: number
  denied: number
  pending: number
  observed: number
  _start: number
  _end: number
  _index: number
}

// -- Timeframe config -------------------------------------------------------

export type PresetKey = "15m" | "30m" | "1h" | "3h" | "6h" | "12h" | "24h" | "7d"

interface TimeframeConfig {
  label: string
  windowMs: number
  bucketCount: number
  bucketMs: number
}

export const PRESETS: Record<PresetKey, TimeframeConfig> = {
  "15m": { label: "Last 15m", windowMs: 15 * 60_000, bucketCount: 15, bucketMs: 60_000 },
  "30m": { label: "Last 30m", windowMs: 30 * 60_000, bucketCount: 15, bucketMs: 2 * 60_000 },
  "1h":  { label: "Last 1h",  windowMs: 1 * 60 * 60 * 1000,  bucketCount: 12, bucketMs: 5 * 60 * 1000 },
  "3h":  { label: "Last 3h",  windowMs: 3 * 60 * 60_000, bucketCount: 12, bucketMs: 15 * 60_000 },
  "6h":  { label: "Last 6h",  windowMs: 6 * 60 * 60 * 1000,  bucketCount: 12, bucketMs: 30 * 60 * 1000 },
  "12h": { label: "Last 12h", windowMs: 12 * 60 * 60 * 1000, bucketCount: 12, bucketMs: 60 * 60 * 1000 },
  "24h": { label: "Last 24h", windowMs: 24 * 60 * 60 * 1000, bucketCount: 12, bucketMs: 2 * 60 * 60 * 1000 },
  "7d":  { label: "Last 7d",  windowMs: 7 * 24 * 60 * 60 * 1000, bucketCount: 14, bucketMs: 12 * 60 * 60 * 1000 },
}

export const PRESET_KEYS: PresetKey[] = ["15m", "30m", "1h", "3h", "6h", "12h", "24h", "7d"]

export const TOOLBAR_PRESET_KEYS: PresetKey[] = ["15m", "1h", "6h", "24h", "7d"]

/** Unified time window — either a preset or a custom absolute range. */
export type TimeWindow =
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; start: number; end: number }

export const DEFAULT_TIME_WINDOW: TimeWindow = { kind: "preset", key: "24h" }

/** Resolve the absolute start/end timestamps for any TimeWindow. */
export function resolveWindow(tw: TimeWindow): { start: number; end: number } {
  if (tw.kind === "custom") return { start: tw.start, end: tw.end }
  const cfg = PRESETS[tw.key]
  const now = Date.now()
  return { start: now - cfg.windowMs, end: now }
}

// -- Chart config (CSS variable colors, not hardcoded hex) ------------------

export const histogramConfig = {
  allowed: { label: "Allowed", color: "var(--color-emerald-500, #10b981)" },
  denied: { label: "Denied", color: "var(--color-red-500, #ef4444)" },
  pending: { label: "Pending", color: "var(--color-amber-500, #f59e0b)" },
  observed: { label: "Observed", color: "var(--color-amber-600, #d97706)" },
} satisfies ChartConfig

/** Simpler 3-series config for dashboard mini-chart. */
export const activityChartConfig = {
  allowed: { label: "Allowed", color: "var(--color-emerald-500, #10b981)" },
  denied: { label: "Denied", color: "var(--color-red-500, #ef4444)" },
  observed: { label: "Observed", color: "var(--color-amber-500, #f59e0b)" },
} satisfies ChartConfig

// -- Bucket label formatters ------------------------------------------------

function formatBucketLabelForWindow(date: Date, windowMs: number): string {
  const oneDay = 24 * 60 * 60 * 1000
  if (windowMs > 3 * oneDay) {
    return date.toLocaleDateString("en-US", { weekday: "short" }) +
      " " +
      date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
  }
  if (windowMs > 6 * 60 * 60 * 1000) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
  }
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function bestBucketConfig(windowMs: number): { bucketCount: number; bucketMs: number } {
  const targets = [
    5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000,
    2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000,
  ]
  for (const bucketMs of targets) {
    const count = Math.ceil(windowMs / bucketMs)
    if (count >= 4 && count <= 20) return { bucketCount: count, bucketMs }
  }
  return { bucketCount: 12, bucketMs: Math.ceil(windowMs / 12) }
}

// -- Custom time range helpers ----------------------------------------------

/** Format a compact label for a custom time window (shown in the selector). */
export function formatCustomLabel(start: number, end: number): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  if (s.toDateString() === e.toDateString()) {
    return `${fmtDate(s)} ${fmtTime(s)} - ${fmtTime(e)}`
  }
  return `${fmtDate(s)} ${fmtTime(s)} - ${fmtDate(e)} ${fmtTime(e)}`
}

/** Convert a Date to a `datetime-local` input value (YYYY-MM-DDThh:mm). */
export function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// -- Histogram builder (full version) ---------------------------------------

export interface EventForHistogram {
  timestamp: string
  verdict: string
  mode: string
  payload: Record<string, unknown> | null
}

export function buildHistogram(events: EventForHistogram[], tw: TimeWindow): HistogramBucket[] {
  let bucketCount: number
  let bucketMs: number
  let windowStart: number
  let windowEnd: number

  if (tw.kind === "preset") {
    const cfg = PRESETS[tw.key]
    bucketCount = cfg.bucketCount
    bucketMs = cfg.bucketMs
    windowEnd = Date.now()
    windowStart = windowEnd - cfg.windowMs
  } else {
    const windowMs = tw.end - tw.start
    const best = bestBucketConfig(windowMs)
    bucketCount = best.bucketCount
    bucketMs = best.bucketMs
    windowStart = tw.start
    windowEnd = tw.end
  }

  const windowMs = windowEnd - windowStart
  const buckets: HistogramBucket[] = []

  for (let i = 0; i < bucketCount; i++) {
    const start = windowStart + i * bucketMs
    const end = Math.min(start + bucketMs, windowEnd)
    const bucket: HistogramBucket = {
      time: formatBucketLabelForWindow(new Date(end), windowMs),
      allowed: 0, denied: 0, pending: 0, observed: 0,
      _start: start, _end: end, _index: i,
    }
    for (const e of events) {
      const t = new Date(e.timestamp).getTime()
      if (t >= start && t < end) {
        if (isObserveFinding(e)) {
          bucket.observed++
        } else {
          const v = normalizeVerdict(e.verdict)
          if (v === "allowed") bucket.allowed++
          else if (v === "denied" || v === "would_deny") bucket.denied++
          else if (v === "pending") bucket.pending++
        }
      }
    }
    buckets.push(bucket)
  }
  return buckets
}

/** Simple 24h histogram (12 × 2h buckets) for dashboard mini-charts. */
export function buildSimpleHistogram(events: EventForHistogram[]): HistogramBucket[] {
  return buildHistogram(events, DEFAULT_TIME_WINDOW)
}
