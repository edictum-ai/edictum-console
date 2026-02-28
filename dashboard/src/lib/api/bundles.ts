import { API_BASE, ApiError, request } from "./client"

// --- Bundle summary (from GET /bundles) ---

export interface BundleSummary {
  name: string
  latest_version: number
  version_count: number
  last_updated: string
  deployed_envs: string[]
}

// --- Bundle response ---

export interface BundleResponse {
  id: string
  tenant_id: string
  name: string
  version: number
  revision_hash: string
  signature_hex: string | null
  source_hub_slug: string | null
  source_hub_revision: string | null
  uploaded_by: string
  created_at: string
}

export interface BundleWithDeployments extends BundleResponse {
  deployed_envs: string[]
}

export interface DeploymentResponse {
  id: string
  env: string
  bundle_name: string
  bundle_version: number
  deployed_by: string
  created_at: string
}

/** List distinct bundle names with summaries. */
export function listBundles() {
  return request<BundleSummary[]>("/bundles")
}

/** List all versions for a named bundle. */
export function listBundleVersions(name: string) {
  return request<BundleWithDeployments[]>(
    `/bundles/${encodeURIComponent(name)}`,
  )
}

/** Upload a new bundle version (name extracted from YAML metadata). */
export function uploadBundle(yamlContent: string) {
  return request<BundleResponse>("/bundles", {
    method: "POST",
    body: JSON.stringify({ yaml_content: yamlContent }),
  })
}

/** Deploy a bundle version to an environment. */
export function deployBundle(name: string, version: number, env: string) {
  return request<DeploymentResponse>(
    `/bundles/${encodeURIComponent(name)}/${version}/deploy`,
    { method: "POST", body: JSON.stringify({ env }) },
  )
}

/** Get raw YAML for a specific bundle version. */
export async function getBundleYaml(
  name: string,
  version: number,
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/bundles/${encodeURIComponent(name)}/${version}/yaml`,
    { credentials: "include" },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.text()
}

/** Get currently deployed bundle for a (name, env). */
export function getCurrentBundle(name: string, env: string) {
  return request<BundleResponse>(
    `/bundles/${encodeURIComponent(name)}/current?env=${encodeURIComponent(env)}`,
  )
}

// --- Evaluate (playground) ---

export interface EvaluateRequest {
  yaml_content: string
  tool_name: string
  tool_args: Record<string, unknown>
  environment?: string
  agent_id?: string
  principal?: {
    user_id?: string
    role?: string
    claims?: Record<string, unknown>
  }
}

export interface ContractEvaluation {
  id: string
  type: "pre" | "post" | "session" | "sandbox"
  matched: boolean
  effect: "deny" | "warn" | "approve" | "redact" | null
  message: string | null
}

export interface EvaluateResponse {
  verdict: string
  mode: string
  contracts_evaluated: ContractEvaluation[]
  deciding_contract: string | null
  policy_version: string
  evaluation_time_ms: number
}

export function evaluateBundle(body: EvaluateRequest) {
  return request<EvaluateResponse>("/bundles/evaluate", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

// --- Deployments ---

export function listDeployments(
  bundleName?: string,
  env?: string,
  limit = 50,
) {
  const params = new URLSearchParams()
  if (bundleName) params.set("bundle_name", bundleName)
  if (env) params.set("env", env)
  params.set("limit", String(limit))
  return request<DeploymentResponse[]>(`/deployments?${params}`)
}
