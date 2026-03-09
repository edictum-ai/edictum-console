import type { EventResponse } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { normalizeVerdict } from "@/lib/verdict-helpers"

/** Agent is considered offline if no activity for this duration. */
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

/** Denied rate above which an agent is considered degraded. */
const DEGRADED_DENIED_RATE = 0.3 // 30%

/** Minimum denied count before degraded status applies. */
const DEGRADED_MIN_DENIED = 3

/** Duration of each sparkline time bucket. */
const SPARKLINE_BUCKET_MS = 5 * 60 * 1000 // 5 minutes

/** Number of sparkline time buckets (1 hour total). */
const SPARKLINE_BUCKET_COUNT = 12

export type AgentStatus = "healthy" | "degraded" | "offline"

export interface RecentToolCall {
  tool: string
  verdict: string
  timestamp: string
}

export interface AgentSummary {
  name: string
  status: AgentStatus
  env: string
  lastActivity: string
  eventCounts: number[]
  recentTools: RecentToolCall[]
  totalEvents: number
  totalDenials: number
  bundleVersion: string | null
  mode: string | null
}

export function deriveAgents(events: EventResponse[]): AgentSummary[] {
  const agentMap = new Map<string, EventResponse[]>()
  for (const e of events) {
    const existing = agentMap.get(e.agent_id) ?? []
    existing.push(e)
    agentMap.set(e.agent_id, existing)
  }

  const agents: AgentSummary[] = []
  for (const [name, agentEvents] of agentMap) {
    const sorted = [...agentEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    const lastTs = sorted[0]?.timestamp ?? ""
    const msSinceLastActivity = lastTs ? Date.now() - new Date(lastTs).getTime() : Infinity
    const deniedCount = sorted.filter((e) => normalizeVerdict(e.verdict) === "denied").length
    const deniedRate = sorted.length > 0 ? deniedCount / sorted.length : 0

    let status: AgentStatus = "healthy"
    if (msSinceLastActivity > OFFLINE_THRESHOLD_MS) status = "offline"
    else if (deniedRate > DEGRADED_DENIED_RATE && deniedCount >= DEGRADED_MIN_DENIED) status = "degraded"

    // Build sparkline from time buckets
    const now = Date.now()
    const counts: number[] = []
    for (let i = SPARKLINE_BUCKET_COUNT - 1; i >= 0; i--) {
      const start = now - (i + 1) * SPARKLINE_BUCKET_MS
      const end = now - i * SPARKLINE_BUCKET_MS
      counts.push(
        sorted.filter((e) => {
          const t = new Date(e.timestamp).getTime()
          return t >= start && t < end
        }).length,
      )
    }

    const env = sorted[0]?.payload?.["environment"] as string | undefined
    const bundleVersion = (sorted[0]?.payload?.["policy_version"] as string | undefined) ?? null
    const mode = sorted[0]?.mode ?? null

    // Build recent tools: denials first, then deduplicated by tool+verdict
    const deniedEvents = sorted.filter((e) => normalizeVerdict(e.verdict) === "denied")
    const nonDeniedEvents = sorted.filter((e) => normalizeVerdict(e.verdict) !== "denied")
    const prioritized = [...deniedEvents, ...nonDeniedEvents]

    const seen = new Set<string>()
    const recentTools: RecentToolCall[] = []
    for (const e of prioritized) {
      const key = `${e.tool_name}:${normalizeVerdict(e.verdict)}`
      if (seen.has(key)) continue
      seen.add(key)
      recentTools.push({ tool: e.tool_name, verdict: e.verdict, timestamp: e.timestamp })
      if (recentTools.length >= 3) break
    }

    agents.push({
      name,
      status,
      env: env ?? "unknown",
      lastActivity: formatRelativeTime(lastTs),
      eventCounts: counts,
      recentTools,
      totalEvents: sorted.length,
      totalDenials: deniedCount,
      bundleVersion,
      mode,
    })
  }

  // Sort: degraded first, then healthy, then offline
  return agents.sort((a, b) => {
    const priority = (s: AgentStatus) =>
      s === "degraded" ? 0 : s === "healthy" ? 1 : 2
    return priority(a.status) - priority(b.status)
  })
}
