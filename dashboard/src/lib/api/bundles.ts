import { API_BASE, ApiError, request } from "./client"

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

export async function getBundleYaml(version: number): Promise<string> {
  const res = await fetch(`${API_BASE}/bundles/${version}/yaml`, {
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }
  return res.text()
}

export function getCurrentBundle(env: string) {
  return request<BundleResponse>(`/bundles/current?env=${encodeURIComponent(env)}`)
}
