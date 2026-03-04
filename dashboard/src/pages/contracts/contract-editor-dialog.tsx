import { useState, useEffect } from "react"
import * as yaml from "js-yaml"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { YamlEditor } from "@/components/yaml-editor"
import { useYamlValidation } from "@/hooks/use-yaml-validation"
import { createContract, updateContract, type LibraryContract } from "@/lib/api/contracts"
import { AiChatPanel } from "./ai-chat-panel"

const CONTRACT_TYPES = ["pre", "post", "session", "sandbox"] as const
const ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/

export interface FromEventContext {
  tool_name: string
  tool_args?: Record<string, unknown>
  verdict: "call_allowed" | "call_denied" | string
}

function buildEventMessage(ctx: FromEventContext): string {
  const argsStr = ctx.tool_args ? JSON.stringify(ctx.tool_args) : "{}"
  const verdictText = ctx.verdict === "call_allowed" ? "allowed" : "denied"
  const suggestedType = "pre"
  const action = ctx.verdict === "call_allowed"
    ? "denies similar calls" : "reinforces this as a reusable rule"
  return `An agent called \`${ctx.tool_name}(${argsStr})\` and it was ${verdictText}. Generate a ${suggestedType} contract that ${action}.`
}

interface ContractEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract?: LibraryContract
  initialDefinition?: string
  fromEvent?: FromEventContext
  onSaved: () => void
}

export function ContractEditorDialog({
  open, onOpenChange, contract, initialDefinition, fromEvent, onSaved,
}: ContractEditorDialogProps) {
  const isEdit = !!contract
  const [showAi, setShowAi] = useState(false)
  const [contractId, setContractId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<string>("pre")
  const [tags, setTags] = useState("")
  const [definition, setDefinition] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { validation, validate, reset } = useYamlValidation()

  // Reset form when dialog opens or contract changes
  useEffect(() => {
    if (!open) return
    if (contract) {
      setContractId(contract.contract_id)
      setName(contract.name)
      setDescription(contract.description ?? "")
      setType(contract.type)
      setTags(contract.tags.join(", "))
      try { setDefinition(yaml.dump(contract.definition, { lineWidth: -1 })) }
      catch { setDefinition("") }
      setShowAi(false)
    } else {
      setContractId("")
      setName("")
      setDescription("")
      setType("pre")
      setTags("")
      setDefinition(initialDefinition ?? "")
      setShowAi(!!fromEvent)
    }
    setError(null)
    setSaving(false)
    reset()
  }, [contract?.contract_id, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDefinitionChange = (val: string) => {
    setDefinition(val)
    validate(val)
  }

  const idValid = !contractId || ID_REGEX.test(contractId)

  const handleSave = async () => {
    if (!contractId.trim() || !name.trim()) {
      setError("Contract ID and name are required.")
      return
    }
    if (!idValid) {
      setError("ID must be lowercase alphanumeric, hyphens, or underscores.")
      return
    }
    if (!definition.trim()) { setError("Definition is required."); return }

    let parsed: Record<string, unknown>
    try {
      const raw = yaml.load(definition)
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        setError("Definition must be a YAML mapping (not a scalar or list)."); return
      }
      parsed = raw as Record<string, unknown>
    } catch { setError("Definition contains invalid YAML."); return }

    setSaving(true)
    setError(null)
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean)
      if (isEdit) {
        await updateContract(contract.contract_id, {
          name, description: description || undefined, definition: parsed, tags: tagList,
        })
        toast.success("Contract updated")
      } else {
        await createContract({
          contract_id: contractId, name, type, definition: parsed,
          description: description || undefined, tags: tagList,
        })
        toast.success("Contract created")
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save contract.")
    } finally {
      setSaving(false)
    }
  }

  const aiInitialMessage = fromEvent && !isEdit ? buildEventMessage(fromEvent) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${showAi ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}>
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>{isEdit ? `Edit: ${contract.name}` : "New Contract"}</DialogTitle>
            {!isEdit && (
              <Button
                variant={showAi ? "secondary" : "outline"} size="sm"
                onClick={() => setShowAi(!showAi)} className="h-7 text-xs"
              >
                <Sparkles className="mr-1.5 size-3" />
                AI Assistant
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className={showAi ? "flex gap-4" : ""}>
          <div className={showAi ? "w-[60%]" : "w-full"}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contract-id">Contract ID</Label>
                  <Input
                    id="contract-id" value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    disabled={isEdit} placeholder="my-contract" aria-invalid={!idValid}
                  />
                  {!idValid && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Lowercase letters, numbers, hyphens, underscores only.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType} disabled={isEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contract-name">Name</Label>
                <Input id="contract-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Human-readable name" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contract-desc">Description</Label>
                  <Input id="contract-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contract-tags">Tags</Label>
                  <Input id="contract-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="safety, pii, finance" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Definition (YAML)</Label>
                <YamlEditor value={definition} onChange={handleDefinitionChange} validation={validation} height="200px" placeholder="# Enter contract definition YAML..." />
              </div>

              {error && (
                <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
              )}
            </div>
          </div>

          {showAi && (
            <div className="w-[40%] max-h-[60vh] min-h-[400px]">
              <AiChatPanel
                onApplyYaml={handleDefinitionChange}
                currentYaml={definition}
                initialMessage={aiInitialMessage}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !validation.valid}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
