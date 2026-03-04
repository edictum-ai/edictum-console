import { request, requestVoid } from "./client"

// --- Contract library types ---

export interface LibraryContractSummary {
  contract_id: string
  name: string
  type: string
  tags: string[]
  version: number
  description: string | null
  created_at: string
  usage_count: number
}

export interface ContractVersionInfo {
  version: number
  created_at: string
  created_by: string
}

export interface LibraryContract extends LibraryContractSummary {
  id: string
  tenant_id: string
  definition: Record<string, unknown>
  is_latest: boolean
  created_by: string
  versions: ContractVersionInfo[]
}

export interface ImportResult {
  contracts_created: string[]
  contracts_updated: string[]
  bundle_composition_created: string | null
}

export interface ContractUsageItem {
  composition_id: string
  composition_name: string
}

// --- Contract library API ---

export function listContracts(params?: {
  type?: string
  tag?: string
  search?: string
}): Promise<LibraryContractSummary[]> {
  const qs = new URLSearchParams()
  if (params?.type) qs.set("type", params.type)
  if (params?.tag) qs.set("tag", params.tag)
  if (params?.search) qs.set("search", params.search)
  const query = qs.toString()
  return request<LibraryContractSummary[]>(`/contracts${query ? `?${query}` : ""}`)
}

export function getContract(contractId: string): Promise<LibraryContract> {
  return request<LibraryContract>(`/contracts/${encodeURIComponent(contractId)}`)
}

export function getContractVersion(
  contractId: string,
  version: number,
): Promise<LibraryContract> {
  return request<LibraryContract>(
    `/contracts/${encodeURIComponent(contractId)}/versions/${version}`,
  )
}

export function createContract(body: {
  contract_id: string
  name: string
  type: string
  definition: Record<string, unknown>
  description?: string
  tags?: string[]
}): Promise<LibraryContract> {
  return request<LibraryContract>("/contracts", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateContract(
  contractId: string,
  body: {
    name?: string
    description?: string
    definition?: Record<string, unknown>
    tags?: string[]
  },
): Promise<LibraryContract> {
  return request<LibraryContract>(
    `/contracts/${encodeURIComponent(contractId)}`,
    { method: "PUT", body: JSON.stringify(body) },
  )
}

export function deleteContract(contractId: string): Promise<void> {
  return requestVoid(`/contracts/${encodeURIComponent(contractId)}`, {
    method: "DELETE",
  })
}

export function importContracts(yamlContent: string): Promise<ImportResult> {
  return request<ImportResult>("/contracts/import", {
    method: "POST",
    body: JSON.stringify({ yaml_content: yamlContent }),
  })
}

export function getContractUsage(
  contractId: string,
): Promise<ContractUsageItem[]> {
  return request<ContractUsageItem[]>(
    `/contracts/${encodeURIComponent(contractId)}/usage`,
  )
}
