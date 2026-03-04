import { request, requestVoid } from "./client"

// --- Composition types ---

export interface CompositionSummary {
  name: string
  description: string | null
  defaults_mode: string
  update_strategy: string
  contract_count: number
  updated_at: string
  created_by: string
}

export interface CompositionItemDetail {
  contract_id: string
  contract_name: string
  contract_type: string
  contract_version: number
  position: number
  mode_override: string | null
  enabled: boolean
  has_newer_version: boolean
}

export interface CompositionDetail extends CompositionSummary {
  id: string
  tenant_id: string
  contracts: CompositionItemDetail[]
  tools_config: Record<string, unknown> | null
  observability: Record<string, unknown> | null
}

export interface PreviewResponse {
  yaml_content: string
  contracts_count: number
  validation_errors: string[]
}

export interface ComposeDeployResponse {
  bundle_name: string
  bundle_version: number
  contracts_assembled: Record<string, unknown>[]
  deployment_id: string
}

// --- Composition API ---

export function listCompositions(): Promise<CompositionSummary[]> {
  return request<CompositionSummary[]>("/compositions")
}

export function getComposition(name: string): Promise<CompositionDetail> {
  return request<CompositionDetail>(
    `/compositions/${encodeURIComponent(name)}`,
  )
}

export function createComposition(body: {
  name: string
  description?: string
  defaults_mode?: string
  update_strategy?: string
}): Promise<CompositionDetail> {
  return request<CompositionDetail>("/compositions", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export interface CompositionItemInput {
  contract_id: string
  position: number
  mode_override: "enforce" | "observe" | null
  enabled: boolean
}

export function updateComposition(
  name: string,
  body: {
    description?: string
    defaults_mode?: string
    update_strategy?: string
    contracts?: CompositionItemInput[]
  },
): Promise<CompositionDetail> {
  return request<CompositionDetail>(
    `/compositions/${encodeURIComponent(name)}`,
    { method: "PUT", body: JSON.stringify(body) },
  )
}

export function deleteComposition(name: string): Promise<void> {
  return requestVoid(`/compositions/${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
}

export function previewComposition(name: string): Promise<PreviewResponse> {
  return request<PreviewResponse>(
    `/compositions/${encodeURIComponent(name)}/preview`,
    { method: "POST" },
  )
}

export function deployComposition(
  name: string,
  env: string,
): Promise<ComposeDeployResponse> {
  return request<ComposeDeployResponse>(
    `/compositions/${encodeURIComponent(name)}/deploy`,
    { method: "POST", body: JSON.stringify({ env }) },
  )
}
