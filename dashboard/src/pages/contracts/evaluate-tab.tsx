import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BundleWithDeployments } from "@/lib/api"
import { EvaluateManual } from "./evaluate-manual"
import { EvaluateReplay } from "./evaluate-replay"

interface EvaluateTabProps {
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
}

export function EvaluateTab({ bundles, selectedBundle }: EvaluateTabProps) {
  if (bundles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Upload a contract bundle to start evaluating.</p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="manual">
      <TabsList className="h-8">
        <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
        <TabsTrigger value="replay" className="text-xs">Replay</TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="mt-4">
        <EvaluateManual bundles={bundles} selectedBundle={selectedBundle} />
      </TabsContent>
      <TabsContent value="replay" className="mt-4">
        <EvaluateReplay bundles={bundles} selectedBundle={selectedBundle} />
      </TabsContent>
    </Tabs>
  )
}
