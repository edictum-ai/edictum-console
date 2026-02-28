import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight } from "lucide-react"
import { EVAL_PRESETS } from "./evaluate-presets"

export interface ToolCallFields {
  toolName: string
  toolArgsStr: string
  argsError: string | null
  environment: string
  agentId: string
  showAdvanced: boolean
  principalUserId: string
  principalRole: string
  principalClaimsStr: string
}

interface ToolCallBuilderProps {
  fields: ToolCallFields
  onChange: (patch: Partial<ToolCallFields>) => void
}

export function ToolCallBuilder({ fields, onChange }: ToolCallBuilderProps) {
  const { toolName, toolArgsStr, argsError, environment, agentId, showAdvanced, principalUserId, principalRole, principalClaimsStr } = fields

  const validateArgs = useCallback(() => {
    try {
      JSON.parse(toolArgsStr)
      onChange({ argsError: null })
    } catch {
      onChange({ argsError: "Invalid JSON" })
    }
  }, [toolArgsStr, onChange])

  const handlePreset = useCallback((presetIndex: string) => {
    const preset = EVAL_PRESETS[Number(presetIndex)]
    if (!preset) return
    onChange({
      toolName: preset.tool_name,
      toolArgsStr: JSON.stringify(preset.tool_args, null, 2),
      argsError: null,
      ...(preset.environment ? { environment: preset.environment } : {}),
      ...(preset.principal
        ? {
            showAdvanced: true,
            principalRole: preset.principal.role ?? "",
            principalUserId: preset.principal.user_id ?? "",
            principalClaimsStr: preset.principal.claims ? JSON.stringify(preset.principal.claims, null, 2) : "{}",
          }
        : { principalRole: "", principalUserId: "" }),
    })
  }, [onChange])

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <Label className="text-xs font-medium text-muted-foreground">Tool Call</Label>

      <div className="space-y-1">
        <Label className="text-xs">Preset</Label>
        <Select onValueChange={handlePreset}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a preset..." />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Basic</SelectLabel>
              {EVAL_PRESETS.map((p, i) => p.group === "basic" && (
                <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Advanced (governance-v5)</SelectLabel>
              {EVAL_PRESETS.map((p, i) => p.group === "advanced" && (
                <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Tool name</Label>
          <Input value={toolName} onChange={(e) => onChange({ toolName: e.target.value })} placeholder="read_file" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Environment</Label>
          <Select value={environment} onValueChange={(v) => onChange({ environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="production">production</SelectItem>
              <SelectItem value="staging">staging</SelectItem>
              <SelectItem value="development">development</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Arguments (JSON)</Label>
        <Textarea
          className="font-mono text-xs"
          rows={3}
          value={toolArgsStr}
          onChange={(e) => onChange({ toolArgsStr: e.target.value, argsError: null })}
          onBlur={validateArgs}
        />
        {argsError && <p className="text-xs text-red-600 dark:text-red-400">{argsError}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Agent ID</Label>
        <Input value={agentId} onChange={(e) => onChange({ agentId: e.target.value })} className="w-48" />
      </div>

      <Collapsible open={showAdvanced} onOpenChange={(v) => onChange({ showAdvanced: v })}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className={`size-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
          Advanced (Principal)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3 pl-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">user_id</Label>
              <Input value={principalUserId} onChange={(e) => onChange({ principalUserId: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">role</Label>
              <Input value={principalRole} onChange={(e) => onChange({ principalRole: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">claims (JSON)</Label>
            <Textarea className="font-mono text-xs" rows={2} value={principalClaimsStr} onChange={(e) => onChange({ principalClaimsStr: e.target.value })} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
