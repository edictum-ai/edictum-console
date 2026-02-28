import { request } from "./client"

// --- Notification Channels ---

export interface NotificationChannelInfo {
  id: string
  name: string
  channel_type: "telegram" | "slack" | "webhook"
  config: Record<string, unknown>
  enabled: boolean
  created_at: string
  last_test_at: string | null
  last_test_ok: boolean | null
}

export interface CreateChannelRequest {
  name: string
  channel_type: "telegram" | "slack" | "webhook"
  config: Record<string, unknown>
}

export interface UpdateChannelRequest {
  name?: string
  config?: Record<string, unknown>
  enabled?: boolean
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
  return request<void>(`/notifications/channels/${id}`, { method: "DELETE" })
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
