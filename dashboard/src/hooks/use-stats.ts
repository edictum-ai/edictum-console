import { useState, useEffect, useCallback } from "react"
import { getStatsOverview, type StatsOverview, ApiError } from "@/lib/api"

interface StatsState {
  data: StatsOverview | null
  loading: boolean
  error: string | null
}

const POLL_INTERVAL = 15_000

export function useStats() {
  const [state, setState] = useState<StatsState>({
    data: null,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    try {
      const data = await getStatsOverview()
      setState({ data, loading: false, error: null })
    } catch (err) {
      if (err instanceof ApiError) {
        setState((s) => ({
          ...s,
          loading: false,
          error: `Failed to fetch stats (${String(err.status)})`,
        }))
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Failed to fetch stats",
        }))
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  return { ...state, refresh }
}
