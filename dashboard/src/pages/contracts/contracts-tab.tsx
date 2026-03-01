import { useMemo, useState } from "react"
import { AlertCircle, FileText, Search, Shield } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BundleSummary, BundleWithDeployments, ContractCoverage } from "@/lib/api"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import type { ContractBundle, ContractType } from "./types"
import { BundleHeader } from "./bundle-header"
import { ContractRow } from "./contract-row"
import { renderContractSummary } from "./contract-summary"

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
}

const TYPE_ORDER: ContractType[] = ["pre", "post", "session", "sandbox"]
const TYPE_LABELS: Record<ContractType, string> = { pre: "Preconditions", post: "Postconditions", session: "Session Limits", sandbox: "Sandboxes" }
const TYPE_DESC: Record<ContractType, string> = { pre: "before execution", post: "after execution", session: "aggregate limits", sandbox: "restrict operations" }

export function ContractsTab({
  summaries,
  bundles,
  selectedBundle,
  selectedVersion,
  onBundleChange,
  onVersionChange,
  coverage,
  parsedBundle,
  parseError,
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

  // Empty state: no bundles at all
  if (summaries.length === 0) return (
    <EmptyState
      icon={<FileText className="h-10 w-10" />}
      title="No contract bundles yet"
      description="Contracts are YAML rules that enforce boundaries on what your AI agents can do — preconditions before execution, sandboxes for file paths, session limits, and postcondition checks. Upload your first bundle to start."
    />
  )

  // Bundle name selector (only shown when multiple bundles exist)
  const bundleSelector = summaries.length > 1 ? (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm text-muted-foreground">Bundle:</span>
      <Select value={selectedBundle ?? ""} onValueChange={onBundleChange}>
        <SelectTrigger className="h-8 w-52 text-sm">
          <SelectValue placeholder="Select a bundle" />
        </SelectTrigger>
        <SelectContent>
          {summaries.map((s) => (
            <SelectItem key={s.name} value={s.name}>
              <span className="font-mono">{s.name}</span>
              <span className="ml-2 text-muted-foreground">
                v{s.latest_version} · {s.version_count} version{s.version_count !== 1 ? "s" : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null

  // Parse error or no parsed bundle
  if (parseError || !parsedBundle) return (
    <div className="space-y-4">
      {bundleSelector}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Version:</span>
        <Select value={selectedVersion ? String(selectedVersion) : ""} onValueChange={(v) => onVersionChange(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {bundles.map((b) => (
              <SelectItem key={b.version} value={String(b.version)}>v{b.version}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{parseError} — try a different version.</AlertDescription>
        </Alert>
      )}
    </div>
  )

  const sectionStats = (type: ContractType) => {
    const cs = grouped[type]
    const enforcing = cs.filter((c) => (c.mode ?? parsedBundle.defaults.mode) === "enforce").length
    const triggered = cs.filter((c) => coverageMap.has(c.id) && coverageMap.get(c.id)!.total_evaluations > 0).length
    return { enforcing, observing: cs.length - enforcing, triggered, total: cs.length }
  }

  return (
    <div className="space-y-3">
      {bundleSelector}

      <BundleHeader
        bundleName={selectedBundle ?? parsedBundle.metadata.name}
        bundles={bundles}
        selectedVersion={selectedVersion}
        onVersionChange={onVersionChange}
        parsedBundle={parsedBundle}
        coverage={coverage}
      />

      {/* Search + summary bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name, tool, tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              {TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      </div>

      {filtered.length === 0 && search && (
        <p className="py-8 text-center text-sm text-muted-foreground">No contracts match "<span className="font-medium">{search}</span>"</p>
      )}

      {/* Accordion sections by type */}
      <Accordion type="multiple" defaultValue={nonEmptyTypes}>
        {nonEmptyTypes.map((type) => {
          const stats = sectionStats(type)
          return (
            <AccordionItem key={type} value={type} className="border-b-0 mb-1">
              <AccordionTrigger className="rounded-md bg-muted/30 px-3 py-2 text-sm hover:bg-muted/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${CONTRACT_TYPE_COLORS[type]}`}>
                    {stats.total}
                  </Badge>
                  <span className="font-medium">{TYPE_LABELS[type]}</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {TYPE_DESC[type]}
                  </span>
                </div>
                <div className="ml-auto mr-2 flex items-center gap-3 text-[11px] text-muted-foreground font-normal">
                  <span className="flex items-center gap-1">
                    <Shield className="size-3 text-emerald-600 dark:text-emerald-400" />
                    {stats.enforcing}
                  </span>
                  {stats.observing > 0 && (
                    <span className="flex items-center gap-1">
                      <Shield className="size-3 text-amber-600 dark:text-amber-400" />
                      {stats.observing}
                    </span>
                  )}
                  {stats.total - stats.triggered > 0 && (
                    <span className="text-muted-foreground/50">
                      {stats.total - stats.triggered} untriggered
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-0">
                <div className="space-y-px">
                  {grouped[type].map((contract) => (
                    <ContractRow
                      key={contract.id}
                      contract={contract}
                      coverage={coverageMap.get(contract.id) ?? null}
                      defaultMode={parsedBundle.defaults.mode}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
