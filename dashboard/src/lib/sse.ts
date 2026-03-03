/**
 * Dashboard SSE — shared singleton pool.
 *
 * One EventSource connection for all useDashboardSSE() calls.
 * Multiple components on the same page share a single connection
 * instead of each opening their own EventSource.
 */

type SSEEventHandler = (data: unknown) => void
type SubscriptionId = number

interface Subscription {
  handlers: Record<string, SSEEventHandler>
}

const DASHBOARD_SSE_URL = "/api/v1/stream/dashboard"

class DashboardSSEPool {
  private source: EventSource | null = null
  private subs = new Map<SubscriptionId, Subscription>()
  private knownEvents = new Set<string>()
  private nextId = 0
  private reconnectDelay = 1000
  private maxReconnectDelay = 60000
  private shouldReconnect = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  subscribe(handlers: Record<string, SSEEventHandler>): SubscriptionId {
    const id = this.nextId++
    this.subs.set(id, { handlers })

    // Register listeners for any event names we haven't seen yet
    for (const name of Object.keys(handlers)) {
      if (!this.knownEvents.has(name)) {
        this.knownEvents.add(name)
        this.attachListener(name)
      }
    }

    // First subscriber — open connection
    if (this.subs.size === 1) {
      this.open()
    }

    return id
  }

  unsubscribe(id: SubscriptionId) {
    this.subs.delete(id)

    // Last subscriber — tear down
    if (this.subs.size === 0) {
      this.close()
    }
  }

  private open() {
    this.shouldReconnect = true
    this.createConnection()
  }

  private close() {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
    this.knownEvents.clear()
    this.reconnectDelay = 1000
  }

  private createConnection() {
    this.source?.close()

    this.source = new EventSource(DASHBOARD_SSE_URL, { withCredentials: true })

    this.source.onopen = () => {
      this.reconnectDelay = 1000
    }

    this.source.onerror = () => {
      this.source?.close()
      this.source = null

      if (this.shouldReconnect) {
        const jitter = this.reconnectDelay * (0.5 + Math.random())
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.createConnection()
        }, jitter)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      }
    }

    // Re-attach listeners for all known event names on the new source
    for (const name of this.knownEvents) {
      this.attachListener(name)
    }
  }

  /** Add a named event listener that fans out to all matching subscribers. */
  private attachListener(eventName: string) {
    if (!this.source) return

    this.source.addEventListener(eventName, (event) => {
      let data: unknown
      try {
        data = JSON.parse((event as MessageEvent<string>).data)
      } catch {
        data = (event as MessageEvent<string>).data
      }

      for (const sub of this.subs.values()) {
        try {
          sub.handlers[eventName]?.(data)
        } catch {
          // Isolate subscriber failures — one bad handler must not break fan-out
        }
      }
    })
  }
}

const dashboardPool = new DashboardSSEPool()

/**
 * Subscribe to dashboard SSE events via the shared singleton connection.
 * Returns an unsubscribe function.
 */
export function subscribeDashboardSSE(
  handlers: Record<string, SSEEventHandler>,
): () => void {
  const id = dashboardPool.subscribe(handlers)
  return () => dashboardPool.unsubscribe(id)
}
