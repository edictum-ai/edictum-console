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
