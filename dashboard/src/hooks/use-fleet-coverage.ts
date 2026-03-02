import { useState, useEffect, useCallback, useRef } from "react"
import { getFleetCoverage, type FleetCoverage, ApiError } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { PRESETS, type PresetKey } from "@/lib/histogram"

interface FleetCoverageState {
  data: FleetCoverage | null
  loading: boolean
  error: string | null
}

/** Poll interval — matches backend Redis cache TTL. */
const POLL_INTERVAL = 60_000

/** Compute a fresh ISO "since" string from a preset key. Called at fetch time, not memoized. */
function presetToSince(key: PresetKey): string {
  return new Date(Date.now() - PRESETS[key].windowMs).toISOString()
}

export function useFleetCoverage(since: PresetKey, env?: string) {
  const [state, setState] = useState<FleetCoverageState>({
    data: null,
    loading: true,
    error: null,
  })

  // Track params in ref so the stable fetchCoverage reads latest values
  const paramsRef = useRef({ since, env })
  paramsRef.current = { since, env }

  const fetchCoverage = useCallback(async () => {
    try {
      // Don't clear existing data while reloading (loading does NOT hide existing data)
      setState((s) => ({ ...s, loading: true, error: null }))
      // Compute "since" fresh each fetch — avoids drift on 60s polls
      const sinceIso = presetToSince(paramsRef.current.since)
      const data = await getFleetCoverage(sinceIso, paramsRef.current.env)
      setState({ data, loading: false, error: null })
    } catch (err) {
      const msg = err instanceof ApiError
        ? `Failed to fetch fleet coverage (${String(err.status)})`
        : "Failed to fetch fleet coverage"
      setState((s) => ({ ...s, loading: false, error: msg }))
    }
  }, [])

  // Fetch on mount and when params change
  useEffect(() => {
    void fetchCoverage()
  }, [since, env, fetchCoverage])

  // Poll every 60s — each poll computes a fresh "since"
  useEffect(() => {
    const id = setInterval(() => void fetchCoverage(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchCoverage])

  // SSE: contract_update -> refetch (deployment changed -> matchers changed)
  useDashboardSSE({
    contract_update: () => {
      void fetchCoverage()
    },
  })

  return { ...state, refetch: fetchCoverage }
}
