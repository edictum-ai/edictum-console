import { useEffect, useCallback } from "react"
import { useSearchParams } from "react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, ScrollText, FileText, History, GitCompare, FlaskConical } from "lucide-react"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContractsTab } from "./contracts/contracts-tab"
import { YamlSheet } from "./contracts/yaml-sheet"
import { useContractsData } from "./contracts/use-contracts-data"

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") ?? "contracts"

  const {
    summaries, selectedBundle, versions, selectedVersion,
    coverage, loading, error, yamlContent, parsedBundle, parseError,
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

  // SSE handlers
  useDashboardSSE({
    bundle_uploaded: (data: unknown) => {
      const d = data as { bundle_name: string; version: number }
      toast.success(`${d.bundle_name} v${d.version} uploaded`)
      void refreshSummaries()
      if (d.bundle_name === selectedBundle) void refreshVersions()
    },
    contract_update: (data: unknown) => {
      const d = data as { bundle_name: string; version: number; env: string }
      toast.success(`${d.bundle_name} v${d.version} deployed to ${d.env}`)
      void refreshSummaries()
      if (d.bundle_name === selectedBundle) void refreshVersions()
    },
  })

  if (loading && summaries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
          <Button variant="outline" size="sm" disabled>Upload</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="contracts"><FileText className="size-3.5" />Contracts</TabsTrigger>
          <TabsTrigger value="versions"><History className="size-3.5" />Versions</TabsTrigger>
          <TabsTrigger value="diff"><GitCompare className="size-3.5" />Diff</TabsTrigger>
          <TabsTrigger value="evaluate"><FlaskConical className="size-3.5" />Evaluate</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4">
          <ContractsTab
            summaries={summaries} bundles={versions}
            selectedBundle={selectedBundle} selectedVersion={selectedVersion}
            onBundleChange={handleBundleChange} onVersionChange={setSelectedVersion}
            coverage={coverage} parsedBundle={parsedBundle}
            parseError={parseError}
          />
        </TabsContent>
        <TabsContent value="versions" className="mt-4"><TabPlaceholder name="Versions" phase="P4" /></TabsContent>
        <TabsContent value="diff" className="mt-4"><TabPlaceholder name="Diff" phase="P5" /></TabsContent>
        <TabsContent value="evaluate" className="mt-4"><TabPlaceholder name="Evaluate" phase="P6" /></TabsContent>
      </Tabs>
    </div>
  )
}

function TabPlaceholder({ name, phase }: { name: string; phase: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{name} tab — coming in {phase}</p>
    </div>
  )
}
