import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import type { BundleWithDeployments } from "@/lib/api"
import { EvaluateManual } from "./evaluate-manual"
import { EvaluateReplay } from "./evaluate-replay"
import { AiChatPanel } from "./ai-chat-panel"

interface EvaluateTabProps {
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
  bundleNames?: string[]
  onBundleChange?: (name: string) => void
}

export function EvaluateTab({ bundles, selectedBundle, bundleNames, onBundleChange }: EvaluateTabProps) {
  const [showAi, setShowAi] = useState(false)

  if (bundles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Upload a contract bundle to start evaluating.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-0" style={{ minHeight: "500px" }}>
      <div className={showAi ? "w-[60%]" : "w-full"}>
        <div className="flex items-center justify-between mb-2">
          <Tabs defaultValue="manual" className="flex-1">
            <div className="flex items-center justify-between">
              <TabsList className="h-8">
                <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
                <TabsTrigger value="replay" className="text-xs">Replay</TabsTrigger>
              </TabsList>
              <Button
                variant={showAi ? "secondary" : "outline"} size="sm"
                onClick={() => setShowAi(!showAi)} className="h-7 text-xs"
              >
                <Sparkles className="mr-1.5 size-3" />
                AI Assistant
              </Button>
            </div>
            <TabsContent value="manual" className="mt-4">
              <EvaluateManual bundles={bundles} selectedBundle={selectedBundle} bundleNames={bundleNames} onBundleChange={onBundleChange} />
            </TabsContent>
            <TabsContent value="replay" className="mt-4">
              <EvaluateReplay bundles={bundles} selectedBundle={selectedBundle} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {showAi && (
        <div className="w-[40%]">
          <AiChatPanel
            onApplyYaml={() => {
              // In evaluate tab, applying YAML is a no-op since there's no direct editor.
              // Users can copy from the chat panel.
            }}
          />
        </div>
      )}
    </div>
  )
}
