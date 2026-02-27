import { request } from "./client"

export interface ApprovalResponse {
  id: string
  status: "pending" | "approved" | "denied" | "timeout"
  agent_id: string
  tool_name: string
  tool_args: Record<string, unknown> | null
  message: string
  env: string
  timeout_seconds: number
  timeout_effect: "deny" | "allow"
  decided_by: string | null
  decided_at: string | null
  decision_reason: string | null
  decision_source: string | null
  contract_name: string | null
  decided_via: string | null
  created_at: string
}

export interface ApprovalFilters {
  status?: string
  agent_id?: string
  tool_name?: string
  env?: string
  limit?: number
  offset?: number
}

export function listApprovals(filters: ApprovalFilters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return request<ApprovalResponse[]>(`/approvals${qs ? `?${qs}` : ""}`)
}

export function getApproval(id: string) {
  return request<ApprovalResponse>(`/approvals/${id}`)
}

export function submitDecision(
  id: string,
  approved: boolean,
  decidedBy?: string,
  reason?: string,
) {
  return request<ApprovalResponse>(`/approvals/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      approved,
      decided_by: decidedBy ?? null,
      reason: reason ?? null,
    }),
  })
}
