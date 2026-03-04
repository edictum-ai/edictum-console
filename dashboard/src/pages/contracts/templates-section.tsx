import { useState } from "react"
import { ChevronDown, Eye, Loader2, Package, X } from "lucide-react"
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
  const [importingPack, setImportingPack] = useState<string | null>(null)
  const [hiddenPacks, setHiddenPacks] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("edictum:hidden-packs")
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set()
    } catch { return new Set() }
  })
  const showExpanded = contractCount < 3

  const visiblePacks = STARTER_PACKS.filter((p) => !hiddenPacks.has(p.name))

  const handleUse = async (pack: StarterPack) => {
    setImportingPack(pack.name)
    try {
      await onImport(pack.yamlContent)
    } finally {
      setImportingPack(null)
    }
  }

  const handleDismiss = (packName: string) => {
    const next = new Set(hiddenPacks)
    next.add(packName)
    setHiddenPacks(next)
    try { localStorage.setItem("edictum:hidden-packs", JSON.stringify([...next])) } catch { /* */ }
  }

  if (visiblePacks.length === 0) return null

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
            {visiblePacks.map((pack) => (
              <PackCard
                key={pack.name}
                pack={pack}
                onPreview={() => setPreviewPack(pack)}
                onUse={() => handleUse(pack)}
                onDismiss={() => handleDismiss(pack.name)}
                importing={importingPack === pack.name}
                disabled={importing || (importingPack !== null && importingPack !== pack.name)}
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
  onDismiss,
  importing,
  disabled,
}: {
  pack: StarterPack
  onPreview: () => void
  onUse: () => void
  onDismiss: () => void
  importing: boolean
  disabled: boolean
}) {
  return (
    <Card className="relative gap-3 py-4">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-0.5 rounded-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label={`Dismiss ${pack.name}`}
      >
        <X className="size-3" />
      </button>
      <CardHeader className="pb-0 pt-0 px-4 gap-1">
        <CardTitle className="text-sm pr-4">{pack.name}</CardTitle>
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
          <Button size="sm" onClick={onUse} disabled={importing || disabled}>
            {importing && <Loader2 className="mr-1 size-3 animate-spin" />}
            Use
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
