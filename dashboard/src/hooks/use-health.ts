import { useState, useEffect } from "react"
import { getHealth, type HealthResponse } from "@/lib/api"

interface HealthState {
  health: HealthResponse | null
  loading: boolean
  error: string | null
}

export function useHealth() {
  const [state, setState] = useState<HealthState>({
    health: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const health = await getHealth()
        if (!cancelled) {
          setState({ health, loading: false, error: null })
        }
      } catch {
        if (!cancelled) {
          setState({
            health: null,
            loading: false,
            error: "Cannot connect to server",
          })
        }
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
