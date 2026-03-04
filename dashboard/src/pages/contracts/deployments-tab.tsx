import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import { Separator } from "@/components/ui/separator"
import { listDeployments, listBundles } from "@/lib/api"
import type { DeploymentResponse, BundleSummary } from "@/lib/api"
import { getAgentStatus } from "@/lib/api/agents"
import { subscribeDashboardSSE } from "@/lib/sse"
import { EnvStatusCards } from "./env-status-cards"
import { DeployHistoryTable } from "./deploy-history-table"

export function DeploymentsTab() {
  const [searchParams] = useSearchParams()
  const [deployments, setDeployments] = useState<DeploymentResponse[]>([])
  const [bundleNames, setBundleNames] = useState<string[]>([])
  const [agentCountByEnv, setAgentCountByEnv] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters — env pre-populated from URL
  const [envFilter, setEnvFilter] = useState(searchParams.get("env") || "all")
  const [bundleFilter, setBundleFilter] = useState("all")
  const fetchGenRef = useRef(0)

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setError(null)
    try {
      const [deps, bundles, fleet] = await Promise.all([
        listDeployments(undefined, undefined, 100),
        listBundles(),
        getAgentStatus(),
      ])
      if (gen !== fetchGenRef.current) return
      setDeployments(deps)
      setBundleNames(bundles.map((b: BundleSummary) => b.name))

      const counts: Record<string, number> = {}
      for (const a of fleet.agents) {
        counts[a.env] = (counts[a.env] ?? 0) + 1
      }
      setAgentCountByEnv(counts)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : "Failed to load deployments")
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { setLoading(true); fetchData() }, [fetchData])

  useEffect(() => {
    return subscribeDashboardSSE({
      bundle_deployed: () => fetchData(),
      composition_changed: () => fetchData(),
    })
  }, [fetchData])

  // Client-side filtering for the history table
  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      if (envFilter !== "all" && d.env !== envFilter) return false
      if (bundleFilter !== "all" && d.bundle_name !== bundleFilter) return false
      return true
    })
  }, [deployments, envFilter, bundleFilter])

  return (
    <div className="space-y-6">
      <EnvStatusCards
        deployments={deployments}
        agentCountByEnv={agentCountByEnv}
        loading={loading}
      />

      <Separator />

      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Deploy History</h3>
        <DeployHistoryTable
          deployments={filteredDeployments}
          bundleNames={bundleNames}
          envFilter={envFilter}
          bundleFilter={bundleFilter}
          onEnvFilterChange={setEnvFilter}
          onBundleFilterChange={setBundleFilter}
          loading={loading}
          error={error}
          onRetry={() => { setLoading(true); fetchData() }}
        />
      </div>
    </div>
  )
}
