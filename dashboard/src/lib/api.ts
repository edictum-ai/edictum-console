const API_BASE = "/api/v1"

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public retryAfter?: number,
  ) {
    super(`API Error ${status}: ${body}`)
    this.name = "ApiError"
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text()
    const retryAfter = res.headers.get("Retry-After")
    throw new ApiError(
      res.status,
      body,
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// --- Health ---

export interface HealthResponse {
  status: string
  version: string
  auth_provider: string
  bootstrap_complete: boolean
}

export function getHealth() {
  return request<HealthResponse>("/health")
}

// --- Auth ---

export interface UserInfo {
  user_id: string
  tenant_id: string
  email: string
  is_admin: boolean
}

export function login(email: string, password: string) {
  return request<{ message: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export function logout() {
  return request<{ message: string }>("/auth/logout", {
    method: "POST",
  })
}

export function getMe() {
  return request<UserInfo>("/auth/me")
}

// --- Setup (Bootstrap) ---

export interface SetupResponse {
  message: string
  user_id: string
  tenant_id: string
}

export function setup(
  email: string,
  password: string,
  tenant_name?: string,
) {
  return request<SetupResponse>("/setup", {
    method: "POST",
    body: JSON.stringify({ email, password, tenant_name }),
  })
}

// --- API Keys ---

export interface ApiKeyInfo {
  id: string
  prefix: string
  env: string
  label: string | null
  created_at: string
}

export interface CreateKeyResponse extends ApiKeyInfo {
  key: string
}

export function listKeys() {
  return request<ApiKeyInfo[]>("/keys")
}

export function createKey(env: string, label?: string) {
  return request<CreateKeyResponse>("/keys", {
    method: "POST",
    body: JSON.stringify({ env, label: label ?? null }),
  })
}

export function deleteKey(keyId: string) {
  return request<void>(`/keys/${keyId}`, { method: "DELETE" })
}

// --- Bundles ---

export interface BundleResponse {
  id: string
  tenant_id: string
  version: number
  revision_hash: string
  signature_hex: string | null
  uploaded_by: string
  created_at: string
}

export interface BundleWithDeployments extends BundleResponse {
  deployed_envs: string[]
}

export interface DeploymentResponse {
  id: string
  env: string
  bundle_version: number
  deployed_by: string
  created_at: string
}

export function listBundles() {
  return request<BundleWithDeployments[]>("/bundles")
}

export function uploadBundle(yamlContent: string) {
  return request<BundleResponse>("/bundles", {
    method: "POST",
    body: JSON.stringify({ yaml_content: yamlContent }),
  })
}

export function deployBundle(version: number, env: string) {
  return request<DeploymentResponse>(`/bundles/${version}/deploy`, {
    method: "POST",
    body: JSON.stringify({ env }),
  })
}

// --- Events ---

export interface EventResponse {
  id: string
  call_id: string
  agent_id: string
  tool_name: string
  verdict: string
  mode: string
  timestamp: string
  payload: Record<string, unknown> | null
  created_at: string
}

export interface EventFilters {
  agent_id?: string
  tool_name?: string
  verdict?: string
  mode?: string
  since?: string
  until?: string
  limit?: number
  offset?: number
}

export function listEvents(filters: EventFilters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return request<EventResponse[]>(`/events${qs ? `?${qs}` : ""}`)
}

// --- Approvals ---

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

// --- Stats ---

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
