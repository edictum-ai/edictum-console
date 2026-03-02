import { useState, useCallback } from "react"
import { useSearchParams } from "react-router"
import type { PresetKey } from "@/lib/histogram"
import type { AgentCoverageSummaryEntry } from "@/lib/api"

export type CoverageFilter = "all" | "has_ungoverned" | "fully_enforced" | "observe_only"
export type DriftFilter = "all" | "current" | "drift"

export interface AgentFilters {
  search: string
  env: string
  coverage: CoverageFilter
  drift: DriftFilter
  since: PresetKey
}

const DEFAULTS: AgentFilters = {
  search: "",
  env: "all",
  coverage: "all",
  drift: "all",
  since: "24h",
}

export function useAgentFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = useState<AgentFilters>(() => ({
    search: searchParams.get("q") ?? DEFAULTS.search,
    env: searchParams.get("env") ?? DEFAULTS.env,
    coverage: (searchParams.get("coverage") as CoverageFilter) ?? DEFAULTS.coverage,
    drift: (searchParams.get("drift") as DriftFilter) ?? DEFAULTS.drift,
    since: (searchParams.get("since") as PresetKey) ?? DEFAULTS.since,
  }))

  const syncToUrl = useCallback(
    (next: AgentFilters) => {
      const params = new URLSearchParams()
      if (next.search !== DEFAULTS.search) params.set("q", next.search)
      if (next.env !== DEFAULTS.env) params.set("env", next.env)
      if (next.coverage !== DEFAULTS.coverage) params.set("coverage", next.coverage)
      if (next.drift !== DEFAULTS.drift) params.set("drift", next.drift)
      if (next.since !== DEFAULTS.since) params.set("since", next.since)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const updateFilter = useCallback(
    <K extends keyof AgentFilters>(key: K, value: AgentFilters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value }
        syncToUrl(next)
        return next
      })
    },
    [syncToUrl],
  )

  const resetFilters = useCallback(() => {
    setFilters(DEFAULTS)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const filterAgents = useCallback(
    (agents: AgentCoverageSummaryEntry[]): AgentCoverageSummaryEntry[] => {
      let filtered = agents

      if (filters.search.trim()) {
        const q = filters.search.toLowerCase()
        filtered = filtered.filter((a) => a.agent_id.toLowerCase().includes(q))
      }

      if (filters.env !== "all") {
        filtered = filtered.filter((a) => a.environment === filters.env)
      }

      if (filters.coverage === "has_ungoverned") {
        filtered = filtered.filter((a) => a.ungoverned > 0)
      } else if (filters.coverage === "fully_enforced") {
        filtered = filtered.filter((a) => a.ungoverned === 0 && a.observed === 0 && a.total_tools > 0)
      } else if (filters.coverage === "observe_only") {
        filtered = filtered.filter((a) => a.observed > 0 && a.ungoverned === 0)
      }

      if (filters.drift === "current") {
        filtered = filtered.filter((a) => a.drift_status === "current")
      } else if (filters.drift === "drift") {
        filtered = filtered.filter((a) => a.drift_status === "drift")
      }

      return filtered
    },
    [filters],
  )

  return { filters, updateFilter, resetFilters, filterAgents }
}
