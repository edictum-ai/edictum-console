import type { EventResponse } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"

export type AgentStatus = "healthy" | "degraded" | "offline"

export interface AgentSummary {
  name: string
  status: AgentStatus
  env: string
  lastActivity: string
  eventCounts: number[]
  recentTools: { tool: string; verdict: string }[]
  totalEvents: number
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
    const deniedCount = sorted.filter((e) => e.verdict === "denied").length
    const deniedRate = sorted.length > 0 ? deniedCount / sorted.length : 0

    let status: AgentStatus = "healthy"
    if (msSinceLastActivity > 30 * 60 * 1000) status = "offline"
    else if (deniedRate > 0.3 && deniedCount >= 3) status = "degraded"

    // Build sparkline from 12 time buckets (5-minute intervals)
    const now = Date.now()
    const bucketDuration = 5 * 60 * 1000
    const counts: number[] = []
    for (let i = 11; i >= 0; i--) {
      const start = now - (i + 1) * bucketDuration
      const end = now - i * bucketDuration
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

    agents.push({
      name,
      status,
      env: env ?? "unknown",
      lastActivity: formatRelativeTime(lastTs),
      eventCounts: counts,
      recentTools: sorted.slice(0, 3).map((e) => ({
        tool: e.tool_name,
        verdict: e.verdict,
      })),
      totalEvents: sorted.length,
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
