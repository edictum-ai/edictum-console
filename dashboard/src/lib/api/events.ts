import { request } from "./client"

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

export interface HistogramBucketResponse {
  bucket_start: string
  allowed: number
  denied: number
  pending: number
  observed: number
}

export interface HistogramFilters {
  since: string
  until: string
  bucket_seconds: number
  agent_id?: string
  tool_name?: string
  verdict?: string
}

export function getEventHistogram(filters: HistogramFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return request<HistogramBucketResponse[]>(`/events/histogram?${params}`)
}
