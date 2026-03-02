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

// --- Coverage Types ---

export interface ToolCoverageEntry {
  tool_name: string
  status: "enforced" | "observed" | "ungoverned"
  contract_name: string | null
  contract_type: string | null
  mode: string | null
  bundle_name: string | null
  event_count: number
  last_used: string
  deny_count?: number
  allow_count?: number
  observe_count?: number
}

export interface CoverageSummary {
  total_tools: number
  enforced: number
  observed: number
  ungoverned: number
  coverage_pct: number
}

export interface DeployedBundle {
  name: string
  version: number
  revision_hash: string
}

export interface AgentCoverage {
  agent_id: string
  environment: string
  time_window: { since: string; until: string }
  deployed_bundle: DeployedBundle | null
  tools: ToolCoverageEntry[]
  summary: CoverageSummary
}

export interface AgentCoverageSummaryEntry {
  agent_id: string
  environment: string
  total_tools: number
  enforced: number
  observed: number
  ungoverned: number
  coverage_pct: number
  drift_status: "current" | "drift" | "unknown"
  last_seen?: string
  event_count_24h?: number
}

export interface UngovernedToolEntry {
  tool_name: string
  agent_count: number
  agent_ids: string[]
}

export interface FleetSummaryData {
  total_agents: number
  fully_enforced: number
  with_ungoverned: number
  with_drift: number
  total_ungoverned_tools: number
  ungoverned_tools: UngovernedToolEntry[]
}

export interface FleetCoverage {
  time_window: { since: string; until: string }
  agents: AgentCoverageSummaryEntry[]
  fleet_summary: FleetSummaryData
}

export interface HistoryEvent {
  type: "deployment" | "drift_detected" | "drift_resolved" | "first_seen"
  timestamp: string
  bundle_name?: string
  bundle_version?: number
  deployed_by?: string
  changes_summary?: string
  policy_version?: string
  drift_duration_seconds?: number
  expected_version?: string
  actual_version?: string
  environment?: string
}

export interface AgentHistory {
  agent_id: string
  environment: string
  events: HistoryEvent[]
}

/** Per-agent coverage analysis. */
export function getAgentCoverage(agentId: string, since?: string, includeVerdicts?: boolean) {
  const params = new URLSearchParams()
  if (since) params.set("since", since)
  if (includeVerdicts) params.set("include_verdicts", "true")
  return request<AgentCoverage>(`/agents/${encodeURIComponent(agentId)}/coverage?${params}`)
}

/** Fleet-level coverage summary. */
export function getFleetCoverage(since?: string, env?: string) {
  const params = new URLSearchParams()
  if (since) params.set("since", since)
  if (env) params.set("env", env)
  return request<FleetCoverage>(`/agents/fleet-coverage?${params}`)
}

/** Agent contract change history and drift events. */
export function getAgentHistory(agentId: string, limit?: number) {
  const params = new URLSearchParams()
  if (limit) params.set("limit", String(limit))
  return request<AgentHistory>(`/agents/${encodeURIComponent(agentId)}/history?${params}`)
}
