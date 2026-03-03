import { useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollText, FileText, History, GitCompare, FlaskConical } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContractsTab } from "./contracts/contracts-tab"
import { VersionsTab } from "./contracts/versions-tab"
import { UploadSheet } from "./contracts/upload-sheet"
import { YamlSheet } from "./contracts/yaml-sheet"
import { DiffTab } from "./contracts/diff-tab"
import { EvaluateTab } from "./contracts/evaluate-tab"
import { useContractsData } from "./contracts/use-contracts-data"

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") ?? "contracts"

  const {
    summaries, selectedBundle, versions, selectedVersion,
    coverage, loading, error, yamlContent, parsedBundle, parseError,
    agentCount,
    refreshSummaries, refreshVersions, handleBundleChange,
    setSelectedVersion, clearError,
  } = useContractsData()

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("tab", tab); return n })
    },
    [setSearchParams],
  )

  // Sync selection state to URL
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedBundle) next.set("bundle", selectedBundle); else next.delete("bundle")
      if (selectedVersion) next.set("version", String(selectedVersion)); else next.delete("version")
      return next
    })
  }, [selectedBundle, selectedVersion, setSearchParams])

  // Auto-switch to contracts tab if current tab becomes disabled
  useEffect(() => {
    if (summaries.length === 0 && activeTab !== "contracts") {
      setTab("contracts")
    }
  }, [summaries.length, activeTab, setTab])

  // SSE handlers
  useDashboardSSE({
    bundle_uploaded: (data: unknown) => {
      const d = data as Record<string, unknown>
      if (typeof d?.bundle_name === "string" && typeof d?.version === "number") {
        toast.success(`${d.bundle_name} v${d.version} uploaded`)
        void refreshSummaries()
        if (d.bundle_name === selectedBundle) void refreshVersions()
      }
    },
    contract_update: (data: unknown) => {
      const d = data as Record<string, unknown>
      if (typeof d?.bundle_name === "string" && typeof d?.version === "number" && typeof d?.env === "string") {
        toast.success(`${d.bundle_name} v${d.version} deployed to ${d.env}`)
        void refreshSummaries()
        if (d.bundle_name === selectedBundle) void refreshVersions()
      }
    },
  })

  if (loading && summaries.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        {/* Tab bar skeleton */}
        <div className="flex gap-4 border-b border-border pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && summaries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { clearError(); void refreshSummaries() }}>
          Retry
        </Button>
      </div>
    )
  }

  const summaryText = summaries.length === 0
    ? "No contract bundles uploaded yet"
    : `${summaries.length} bundle${summaries.length !== 1 ? "s" : ""}${coverage.length > 0 ? ` \u00B7 ${coverage.length} contract${coverage.length !== 1 ? "s" : ""} tracked` : ""}`

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ScrollText className="size-5 text-amber-600 dark:text-amber-400" />
            Contracts
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{summaryText}</p>
        </div>
        <div className="flex items-center gap-2">
          {parsedBundle && yamlContent && selectedBundle && selectedVersion && (
            <YamlSheet bundleName={selectedBundle} version={selectedVersion} yamlContent={yamlContent} />
          )}
          <UploadSheet onRefresh={() => { void refreshSummaries(); void refreshVersions() }} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="contracts"><FileText className="size-3.5" />Contracts</TabsTrigger>
          <TabsTrigger value="versions" disabled={summaries.length === 0}><History className="size-3.5" />Versions</TabsTrigger>
          <TabsTrigger value="diff" disabled={summaries.length === 0}><GitCompare className="size-3.5" />Diff</TabsTrigger>
          <TabsTrigger value="evaluate" disabled={summaries.length === 0}><FlaskConical className="size-3.5" />Evaluate</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4">
          <ContractsTab
            summaries={summaries} bundles={versions}
            selectedBundle={selectedBundle} selectedVersion={selectedVersion}
            onBundleChange={handleBundleChange} onVersionChange={setSelectedVersion}
            coverage={coverage} parsedBundle={parsedBundle}
            parseError={parseError}
            agentCount={agentCount}
          />
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <VersionsTab
            bundleName={selectedBundle}
            bundles={versions}
            onRefresh={() => { void refreshSummaries(); void refreshVersions() }}
          />
        </TabsContent>
        <TabsContent value="diff" className="mt-4">
          <DiffTab bundles={versions} selectedBundle={selectedBundle} />
        </TabsContent>
        <TabsContent value="evaluate" className="mt-4">
          <EvaluateTab bundles={versions} selectedBundle={selectedBundle} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

