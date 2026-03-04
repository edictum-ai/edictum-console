import { useCallback } from "react"
import { useSearchParams } from "react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Layers, Rocket, FlaskConical, ScrollText } from "lucide-react"
import { LibraryTab } from "./contracts/library-tab"
import { BundlesTab } from "./contracts/bundles-tab"
import { DeploymentsTab } from "./contracts/deployments-tab"
import { EvaluateTab } from "./contracts/evaluate-tab"
import { useContractsData } from "./contracts/use-contracts-data"

const VALID_TABS = new Set(["library", "bundles", "deployments", "evaluate"])

/** Wrapper that defers bundle data fetching until the Evaluate tab mounts. */
function EvaluateTabConnected() {
  const { versions, selectedBundle, summaries, handleBundleChange } = useContractsData()
  const bundleNames = summaries.map((s) => s.name)
  return (
    <EvaluateTab
      bundles={versions}
      selectedBundle={selectedBundle}
      bundleNames={bundleNames}
      onBundleChange={handleBundleChange}
    />
  )
}

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get("tab")
  const activeTab = raw && VALID_TABS.has(raw) ? raw : "library"

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("tab", tab)
        return next
      })
    },
    [setSearchParams],
  )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ScrollText className="size-5 text-amber-600 dark:text-amber-400" />
          Contracts
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Author, compose, deploy, and test contract bundles.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="library">
            <BookOpen className="size-3.5" />
            Library
          </TabsTrigger>
          <TabsTrigger value="bundles">
            <Layers className="size-3.5" />
            Bundles
          </TabsTrigger>
          <TabsTrigger value="deployments">
            <Rocket className="size-3.5" />
            Deployments
          </TabsTrigger>
          <TabsTrigger value="evaluate">
            <FlaskConical className="size-3.5" />
            Evaluate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="bundles" className="mt-4">
          <BundlesTab />
        </TabsContent>
        <TabsContent value="deployments" className="mt-4">
          <DeploymentsTab />
        </TabsContent>
        <TabsContent value="evaluate" className="mt-4">
          <EvaluateTabConnected />
        </TabsContent>
      </Tabs>
    </div>
  )
}
