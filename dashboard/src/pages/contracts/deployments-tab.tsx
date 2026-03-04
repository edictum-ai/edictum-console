import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { ChevronRight, Users, GitBranch } from "lucide-react"
import { listDeployments, listBundles } from "@/lib/api"
import type { DeploymentResponse, BundleSummary } from "@/lib/api"
import { getAgentStatus } from "@/lib/api/agents"
import { subscribeDashboardSSE } from "@/lib/sse"
import { EnvStatusCards } from "./env-status-cards"
import { DeployHistoryTable } from "./deploy-history-table"
import { DeploymentsAgentsSection } from "./deployments-agents-section"
import { AssignmentRulesSection } from "./assignment-rules-section"

export function DeploymentsTab() {
  const [searchParams] = useSearchParams()
  const [deployments, setDeployments] = useState<DeploymentResponse[]>([])
  const [bundleNames, setBundleNames] = useState<string[]>([])
  const [agentCountByEnv, setAgentCountByEnv] = useState<Record<string, number>>({})
  const [agentBundlesByEnv, setAgentBundlesByEnv] = useState<Record<string, Record<string, number>>>({})
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
      const bundleCounts: Record<string, Record<string, number>> = {}
      for (const a of fleet.agents) {
        counts[a.env] = (counts[a.env] ?? 0) + 1
        if (a.bundle_name) {
          if (!bundleCounts[a.env]) bundleCounts[a.env] = {}
          bundleCounts[a.env]![a.bundle_name] = (bundleCounts[a.env]![a.bundle_name] ?? 0) + 1
        }
      }
      setAgentCountByEnv(counts)
      setAgentBundlesByEnv(bundleCounts)
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
        agentBundlesByEnv={agentBundlesByEnv}
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

      <Separator />

      <CollapsibleSection
        icon={<Users className="size-4" />}
        title="Agent Assignments"
        defaultOpen
      >
        <DeploymentsAgentsSection bundleNames={bundleNames} />
      </CollapsibleSection>

      <Separator />

      <CollapsibleSection
        icon={<GitBranch className="size-4" />}
        title="Assignment Rules"
      >
        <AssignmentRulesSection bundleNames={bundleNames} />
      </CollapsibleSection>
    </div>
  )
}

function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-sm font-medium text-foreground hover:text-foreground/80">
        <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        {icon}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
