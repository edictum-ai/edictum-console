import { useEffect, useRef } from "react"
import { createDashboardSSE, type SSEClient } from "@/lib/sse"

/**
 * Hook for subscribing to dashboard SSE events.
 * Accepts a map of SSE event names to handler functions.
 * Handles connect/disconnect/cleanup automatically.
 */
export function useDashboardSSE(handlers: Record<string, (data: unknown) => void>) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const handlerKeys = Object.keys(handlers).sort().join(",")

  useEffect(() => {
    if (!handlerKeys) return

    // Proxy through ref so latest handlers are always called
    const proxyHandlers: Record<string, (data: unknown) => void> = {}
    for (const key of handlerKeys.split(",")) {
      proxyHandlers[key] = (data) => handlersRef.current[key]?.(data)
    }

    let client: SSEClient | null = createDashboardSSE(proxyHandlers)
    client.connect()

    return () => {
      client?.disconnect()
      client = null
    }
  }, [handlerKeys])
}
