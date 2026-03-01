type SSEEventHandler = (data: unknown) => void

interface SSEClientOptions {
  url: string
  onEvent: Record<string, SSEEventHandler>
  onError?: (error: Event) => void
  onOpen?: () => void
  onClose?: () => void
}

export class SSEClient {
  private source: EventSource | null = null
  private options: SSEClientOptions
  private reconnectDelay = 1000
  private maxReconnectDelay = 60000
  private shouldReconnect = true

  constructor(options: SSEClientOptions) {
    this.options = options
  }

  connect() {
    this.shouldReconnect = true
    this.createConnection()
  }

  disconnect() {
    this.shouldReconnect = false
    this.source?.close()
    this.source = null
    this.options.onClose?.()
  }

  get connected() {
    return this.source?.readyState === EventSource.OPEN
  }

  private createConnection() {
    if (this.source) {
      this.source.close()
    }

    this.source = new EventSource(this.options.url, {
      withCredentials: true,
    })

    this.source.onopen = () => {
      this.reconnectDelay = 1000
      this.options.onOpen?.()
    }

    this.source.onerror = (event) => {
      this.options.onError?.(event)
      this.source?.close()
      this.source = null

      if (this.shouldReconnect) {
        const jitter = this.reconnectDelay * (0.5 + Math.random())
        setTimeout(() => {
          this.createConnection()
        }, jitter)
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        )
      }
    }

    for (const [eventName, handler] of Object.entries(
      this.options.onEvent,
    )) {
      this.source.addEventListener(eventName, (event) => {
        try {
          const data: unknown = JSON.parse(
            (event as MessageEvent<string>).data,
          )
          handler(data)
        } catch {
          handler((event as MessageEvent<string>).data)
        }
      })
    }
  }
}

export function createDashboardSSE(
  handlers: Record<string, SSEEventHandler>,
) {
  return new SSEClient({
    url: "/api/v1/stream/dashboard",
    onEvent: handlers,
  })
}
