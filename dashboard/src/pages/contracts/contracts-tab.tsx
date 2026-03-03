import { useMemo, useState } from "react"
import { AlertCircle, FileText, Search } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { BundleSummary, BundleWithDeployments, ContractCoverage } from "@/lib/api"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import type { ContractBundle, ContractType } from "./types"
import { BundleHeader } from "./bundle-header"
import { renderContractSummary } from "./contract-summary"
import { BundleSelector, VersionSelector } from "./contracts-selectors"
import { ContractsAccordion } from "./contracts-accordion"

interface ContractsTabProps {
  summaries: BundleSummary[]
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
  selectedVersion: number | null
  onBundleChange: (name: string) => void
  onVersionChange: (version: number) => void
  coverage: ContractCoverage[]
  parsedBundle: ContractBundle | null
  parseError: string | null
  agentCount: number | null
}

const TYPE_ORDER: ContractType[] = ["pre", "post", "session", "sandbox"]
const TYPE_META: Record<ContractType, { label: string }> = {
  pre: { label: "Preconditions" }, post: { label: "Postconditions" },
  session: { label: "Session Limits" }, sandbox: { label: "Sandboxes" },
}

export function ContractsTab({
  summaries, bundles, selectedBundle, selectedVersion,
  onBundleChange, onVersionChange, coverage, parsedBundle, parseError, agentCount,
}: ContractsTabProps) {
  const [search, setSearch] = useState("")

  const coverageMap = useMemo(() => {
    const map = new Map<string, ContractCoverage>()
    for (const c of coverage) map.set(c.decision_name, c)
    return map
  }, [coverage])

  const filtered = useMemo(() => {
    if (!parsedBundle) return []
    if (!search.trim()) return parsedBundle.contracts
    const q = search.toLowerCase()
    return parsedBundle.contracts.filter((c) => {
      if (c.id.toLowerCase().includes(q)) return true
      if (c.tool?.toLowerCase().includes(q)) return true
      if (c.tools?.some((t) => t.toLowerCase().includes(q))) return true
      if (c.then?.tags?.some((t) => t.toLowerCase().includes(q))) return true
      if (renderContractSummary(c).toLowerCase().includes(q)) return true
      return false
    })
  }, [parsedBundle, search])

  const grouped = useMemo(() => {
    const g: Record<ContractType, typeof filtered> = { pre: [], post: [], session: [], sandbox: [] }
    for (const c of filtered) g[c.type]?.push(c)
    return g
  }, [filtered])
  const nonEmptyTypes = TYPE_ORDER.filter((t) => grouped[t].length > 0)

  if (summaries.length === 0) return (
    <EmptyState
      icon={<FileText className="h-10 w-10" />}
      title="No contract bundles yet"
      description="Contracts are YAML rules that enforce boundaries on what your AI agents can do — preconditions before execution, sandboxes for file paths, session limits, and postcondition checks. Upload your first bundle to start."
    />
  )

  const bundleSelector = summaries.length > 1
    ? <BundleSelector summaries={summaries} selectedBundle={selectedBundle} onBundleChange={onBundleChange} />
    : null

  if (parseError || !parsedBundle) return (
    <div className="space-y-4">
      {bundleSelector}
      <VersionSelector bundles={bundles} selectedVersion={selectedVersion} onVersionChange={onVersionChange} />
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{parseError} — try a different version.</AlertDescription>
        </Alert>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      {bundleSelector}

      <BundleHeader
        bundleName={selectedBundle ?? parsedBundle.metadata.name}
        bundles={bundles} selectedVersion={selectedVersion}
        onVersionChange={onVersionChange} parsedBundle={parsedBundle}
        coverage={coverage} agentCount={agentCount}
      />

      {/* Search + summary bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name, tool, tag..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {nonEmptyTypes.map((type, i) => (
            <span key={type} className="flex items-center gap-1">
              {i > 0 && <Separator orientation="vertical" className="mx-1 h-3" />}
              <Badge variant="outline" className={`text-[10px] ${CONTRACT_TYPE_COLORS[type]}`}>
                {grouped[type].length}
              </Badge>
              {TYPE_META[type].label}
            </span>
          ))}
        </div>
      </div>

      {filtered.length === 0 && search && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No contracts match "<span className="font-medium">{search}</span>"
        </p>
      )}

      <ContractsAccordion
        nonEmptyTypes={nonEmptyTypes} grouped={grouped}
        coverageMap={coverageMap} defaultMode={parsedBundle.defaults.mode}
      />
    </div>
  )
}
