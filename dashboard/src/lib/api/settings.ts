import { request, requestVoid } from "./client"

// --- Notification Channels ---

export type ChannelType = "telegram" | "slack" | "slack_app" | "webhook" | "email" | "discord"

export interface ChannelFilters {
  environments?: string[]
  agent_patterns?: string[]
  contract_names?: string[]
}

export interface NotificationChannelInfo {
  id: string
  name: string
  channel_type: ChannelType
  config: Record<string, unknown>
  enabled: boolean
  filters: ChannelFilters | null
  created_at: string
  last_test_at: string | null
  last_test_ok: boolean | null
}

export interface CreateChannelRequest {
  name: string
  channel_type: ChannelType
  config: Record<string, unknown>
  filters?: ChannelFilters | null
}

export interface UpdateChannelRequest {
  name?: string
  config?: Record<string, unknown>
  enabled?: boolean
  filters?: ChannelFilters | null
}

export interface TestChannelResult {
  success: boolean
  message: string
}

export function listChannels() {
  return request<NotificationChannelInfo[]>("/notifications/channels")
}

export function createChannel(data: CreateChannelRequest) {
  return request<NotificationChannelInfo>("/notifications/channels", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateChannel(id: string, data: UpdateChannelRequest) {
  return request<NotificationChannelInfo>(`/notifications/channels/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export function deleteChannel(id: string) {
  return requestVoid(`/notifications/channels/${id}`, { method: "DELETE" })
}

export function testChannel(id: string) {
  return request<TestChannelResult>(`/notifications/channels/${id}/test`, {
    method: "POST",
  })
}

// --- Settings Actions ---

export interface RotateKeyResponse {
  public_key: string
  rotated_at: string
  deployments_re_signed: number
}

export function rotateSigningKey() {
  return request<RotateKeyResponse>("/settings/rotate-signing-key", {
    method: "POST",
  })
}

export interface PurgeEventsResponse {
  deleted_count: number
  cutoff: string
}

export function purgeEvents(olderThanDays: number) {
  return request<PurgeEventsResponse>(
    `/settings/purge-events?older_than_days=${olderThanDays}`,
    { method: "DELETE" },
  )
}

// --- AI Configuration ---

export interface AiConfigResponse {
  provider: string
  api_key_masked: string
  model: string | null
  base_url: string | null
  configured: boolean
}

export interface UpdateAiConfigRequest {
  provider: string
  api_key?: string
  model?: string | null
  base_url?: string | null
}

export interface TestAiResult {
  ok: boolean
  model?: string
  latency_ms?: number
  error?: string
}

export function getAiConfig() {
  return request<AiConfigResponse>("/settings/ai")
}

export function updateAiConfig(data: UpdateAiConfigRequest) {
  return request<{ configured: boolean }>("/settings/ai", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export function deleteAiConfig() {
  return requestVoid("/settings/ai", { method: "DELETE" })
}

export function testAiConnection() {
  return request<TestAiResult>("/settings/ai/test", { method: "POST" })
}
