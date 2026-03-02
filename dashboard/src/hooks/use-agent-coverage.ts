import { useState, useEffect, useCallback } from "react"
import { getAgentCoverage, type AgentCoverage } from "@/lib/api/agents"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"

/**
 * Custom hook for per-agent coverage data with auto-refresh.
 * Subscribes to contract_update SSE events and polls every 60s.
 * Uses stale-while-revalidate: existing data stays visible during refresh.
 */
export function useAgentCoverage(
  agentId: string,
  since: string,
  includeVerdicts: boolean,
) {
  const [data, setData] = useState<AgentCoverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getAgentCoverage(agentId, since, includeVerdicts)
      setData(result)
    } catch {
      setError("Failed to load coverage data")
    } finally {
      setLoading(false)
    }
  }, [agentId, since, includeVerdicts])

  // Initial fetch + refetch on param change
  useEffect(() => {
    void fetch()
  }, [fetch])

  // 60s polling for new tool events
  useEffect(() => {
    const id = setInterval(() => {
      void fetch()
    }, 60_000)
    return () => clearInterval(id)
  }, [fetch])

  // SSE: contract deployments change matchers -> refetch
  useDashboardSSE({
    contract_update: () => {
      void fetch()
    },
  })

  return { data, loading, error, refetch: fetch }
}
