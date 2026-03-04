import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Plus, Eye, Rocket, Save, Loader2, AlertCircle, HelpCircle, Layers } from "lucide-react"
import type { CompositionDetail } from "@/lib/api/compositions"
import { CONTRACT_MODE_COLORS } from "@/lib/contract-colors"
import { CompositionItemRow } from "./composition-item-row"
import { ContractPickerDialog } from "./contract-picker-dialog"
import { PreviewDialog } from "./preview-dialog"
import { ComposeDeployDialog } from "./compose-deploy-dialog"
import { useCompositionEditor } from "./use-composition-editor"

interface CompositionEditorProps {
  composition: CompositionDetail
  onSaved: () => void
  onDeployed: () => void
}

export function CompositionEditor({
  composition,
  onSaved,
  onDeployed,
}: CompositionEditorProps) {
  const ed = useCompositionEditor(composition, onSaved)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)

  const modeColor =
    CONTRACT_MODE_COLORS[ed.mode] ??
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30"

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {composition.name}
        </h2>
        {composition.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {composition.description}
          </p>
        )}
      </div>

      {/* Settings row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <Select value={ed.mode} onValueChange={ed.setMode}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enforce">enforce</SelectItem>
              <SelectItem value="observe">observe</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className={`${modeColor} text-[10px]`}>
            {ed.mode}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Strategy:</span>
          <Select value={ed.strategy} onValueChange={ed.setStrategy}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">manual</SelectItem>
              <SelectItem value="auto_deploy">auto deploy</SelectItem>
              <SelectItem value="observe_first">observe first</SelectItem>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <strong>manual:</strong> Review updates before deploying.
              <br />
              <strong>auto deploy:</strong> Auto-deploy on new versions.
              <br />
              <strong>observe first:</strong> Shadow-test before promoting.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Separator />

      {/* Updates banner */}
      {ed.updatesAvailable > 0 && (
        <Alert>
          <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription>
            {ed.updatesAvailable} contract
            {ed.updatesAvailable !== 1 ? "s have" : " has"} newer versions
            available.
          </AlertDescription>
        </Alert>
      )}

      {/* Contract list */}
      {ed.items.length === 0 ? (
        <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border">
          <Layers className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No contracts yet. Add from the library.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {ed.items.map((item, idx) => (
            <CompositionItemRow
              key={`${item.contract_id}-${idx}`}
              item={item}
              isFirst={idx === 0}
              isLast={idx === ed.items.length - 1}
              onModeChange={(m) => ed.updateItem(idx, { mode_override: m })}
              onEnabledChange={(en) => ed.updateItem(idx, { enabled: en })}
              onRemove={() => ed.removeItem(idx)}
              onMoveUp={() => ed.moveItem(idx, idx - 1)}
              onMoveDown={() => ed.moveItem(idx, idx + 1)}
              onDragStart={(e) => {
                ed.setDragIdx(idx)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (ed.dragIdx !== null && ed.dragIdx !== idx) {
                  ed.moveItem(ed.dragIdx, idx)
                }
                ed.setDragIdx(null)
              }}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4 mr-1.5" /> Add Contracts
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={ed.items.length === 0}>
          <Eye className="size-4 mr-1.5" /> Preview
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDeployOpen(true)} disabled={ed.items.length === 0}>
          <Rocket className="size-4 mr-1.5" /> Deploy
        </Button>
        <Button size="sm" onClick={ed.handleSave} disabled={ed.saving}>
          {ed.saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />}
          Save
        </Button>
      </div>

      <ContractPickerDialog open={pickerOpen} onOpenChange={setPickerOpen}
        existingContractIds={ed.existingIds} onAdd={ed.addContract} />
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen}
        compositionName={composition.name} onDeploy={() => setDeployOpen(true)} />
      <ComposeDeployDialog open={deployOpen} onOpenChange={setDeployOpen}
        compositionName={composition.name} contractCount={ed.items.length} onDeployed={onDeployed} />
    </div>
  )
}
