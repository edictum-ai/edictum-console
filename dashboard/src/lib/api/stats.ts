import { request } from "./client"

export interface StatsOverview {
  pending_approvals: number
  active_agents: number
  total_agents: number
  events_24h: number
  denials_24h: number
  observe_findings_24h: number
  contracts_triggered_24h: number
}

export function getStatsOverview() {
  return request<StatsOverview>("/stats/overview")
}

// --- Contract Coverage Stats ---

export interface ContractCoverage {
  decision_name: string
  total_evaluations: number
  total_denials: number
  total_warnings: number
  last_triggered: string | null
}

export interface ContractStatsResponse {
  coverage: ContractCoverage[]
  total_events: number
  period_start: string
  period_end: string
}

export function getContractStats(since?: string, until?: string) {
  const params = new URLSearchParams()
  if (since) params.set("since", since)
  if (until) params.set("until", until)
  const qs = params.toString()
  return request<ContractStatsResponse>(`/stats/contracts${qs ? `?${qs}` : ""}`)
}
