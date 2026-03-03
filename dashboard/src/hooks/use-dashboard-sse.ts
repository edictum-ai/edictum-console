import { useEffect, useRef } from "react"
import { subscribeDashboardSSE } from "@/lib/sse"

/**
 * Hook for subscribing to dashboard SSE events.
 * Accepts a map of SSE event names to handler functions.
 *
 * All useDashboardSSE() calls share a single EventSource connection
 * via DashboardSSEPool — safe to call from multiple components on the
 * same page without opening duplicate connections.
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

    return subscribeDashboardSSE(proxyHandlers)
  }, [handlerKeys])
}
