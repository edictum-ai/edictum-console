import { request } from "./client"

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
