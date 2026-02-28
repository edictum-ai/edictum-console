import { request } from "./client"

export interface AgentStatusEntry {
  agent_id: string
  env: string
  bundle_name: string | null
  policy_version: string | null
  status: "current" | "drift" | "unknown"
  connected_at: string
}

export interface AgentFleetStatus {
  agents: AgentStatusEntry[]
}

export function getAgentStatus(bundleName?: string) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  return request<AgentFleetStatus>(`/agents/status?${params}`)
}
