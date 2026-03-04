import { useState } from "react"
import { ChevronDown, Eye, Loader2, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { YamlEditor } from "@/components/yaml-editor"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import { STARTER_PACKS, type StarterPack } from "./templates"

interface TemplatesSectionProps {
  contractCount: number
  onImport: (yamlContent: string) => Promise<void>
  importing: boolean
}

export function TemplatesSection({
  contractCount,
  onImport,
  importing,
}: TemplatesSectionProps) {
  const [previewPack, setPreviewPack] = useState<StarterPack | null>(null)
  const showExpanded = contractCount < 3

  return (
    <>
      <Collapsible defaultOpen={contractCount === 0}>
        {!showExpanded && (
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Package className="size-3.5" />
            Starter Packs
            <ChevronDown className="size-3.5" />
          </CollapsibleTrigger>
        )}

        {showExpanded && (
          <div className="flex items-center gap-2 mb-3">
            <Package className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">
              Get started with a template
            </h3>
          </div>
        )}

        <CollapsibleContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {STARTER_PACKS.map((pack) => (
              <PackCard
                key={pack.name}
                pack={pack}
                onPreview={() => setPreviewPack(pack)}
                onUse={() => onImport(pack.yamlContent)}
                importing={importing}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog
        open={!!previewPack}
        onOpenChange={(open) => {
          if (!open) setPreviewPack(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewPack?.name}</DialogTitle>
          </DialogHeader>
          {previewPack && (
            <div className="flex-1 overflow-auto">
              <YamlEditor
                value={previewPack.yamlContent}
                readOnly
                height="400px"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PackCard({
  pack,
  onPreview,
  onUse,
  importing,
}: {
  pack: StarterPack
  onPreview: () => void
  onUse: () => void
  importing: boolean
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-0 pt-0 px-4 gap-1">
        <CardTitle className="text-sm">{pack.name}</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {pack.description}
        </p>
      </CardHeader>
      <CardContent className="px-4 space-y-3">
        <div className="flex flex-wrap gap-1">
          {pack.types.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${CONTRACT_TYPE_COLORS[t] ?? ""}`}
            >
              {t}
            </Badge>
          ))}
          <span className="text-[10px] text-muted-foreground self-center ml-1">
            {pack.contractCount} contracts
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPreview}>
            <Eye className="mr-1 size-3" />
            Preview
          </Button>
          <Button size="sm" onClick={onUse} disabled={importing}>
            {importing && <Loader2 className="mr-1 size-3 animate-spin" />}
            Use
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
