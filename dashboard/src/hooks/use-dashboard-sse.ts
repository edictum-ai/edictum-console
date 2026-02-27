import { useEffect, useRef } from "react"
import { createDashboardSSE, type SSEClient } from "@/lib/sse"

interface DashboardSSECallbacks {
  onStatsUpdate?: (data: unknown) => void
  onNewEvent?: (data: unknown) => void
  onApprovalUpdate?: (data: unknown) => void
  onAgentStatus?: (data: unknown) => void
}

export function useDashboardSSE(callbacks: DashboardSSECallbacks) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  useEffect(() => {
    const handlers: Record<string, (data: unknown) => void> = {}

    if (callbacksRef.current.onStatsUpdate) {
      handlers["stats_update"] = (data) =>
        callbacksRef.current.onStatsUpdate?.(data)
    }
    if (callbacksRef.current.onNewEvent) {
      handlers["new_event"] = (data) =>
        callbacksRef.current.onNewEvent?.(data)
    }
    if (callbacksRef.current.onApprovalUpdate) {
      handlers["approval_update"] = (data) =>
        callbacksRef.current.onApprovalUpdate?.(data)
    }
    if (callbacksRef.current.onAgentStatus) {
      handlers["agent_status"] = (data) =>
        callbacksRef.current.onAgentStatus?.(data)
    }

    if (Object.keys(handlers).length === 0) return

    let client: SSEClient | null = createDashboardSSE(handlers)
    client.connect()

    return () => {
      client?.disconnect()
      client = null
    }
  }, [])
}
