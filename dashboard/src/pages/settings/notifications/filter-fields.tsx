import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ChannelFilters } from "@/lib/api"

interface FilterFieldsProps {
  filters: ChannelFilters | null
  onChange: (filters: ChannelFilters | null) => void
}

const ENVS = ["production", "staging", "development"] as const

function hasActiveFilters(f: ChannelFilters | null): boolean {
  if (!f) return false
  return (
    (f.environments?.length ?? 0) > 0 ||
    (f.agent_patterns?.length ?? 0) > 0 ||
    (f.contract_names?.length ?? 0) > 0
  )
}

function normalize(f: ChannelFilters): ChannelFilters | null {
  const out: ChannelFilters = {}
  if (f.environments?.length) out.environments = f.environments
  if (f.agent_patterns?.length) out.agent_patterns = f.agent_patterns
  if (f.contract_names?.length) out.contract_names = f.contract_names
  return Object.keys(out).length > 0 ? out : null
}

export function FilterFields({ filters, onChange }: FilterFieldsProps) {
  const [open, setOpen] = useState(hasActiveFilters(filters))
  const active = hasActiveFilters(filters)
  const envs = filters?.environments ?? []

  function toggleEnv(env: string, checked: boolean) {
    const next = checked ? [...envs, env] : envs.filter((e) => e !== env)
    onChange(normalize({ ...filters, environments: next }))
  }

  function setPatterns(key: "agent_patterns" | "contract_names", raw: string) {
    const vals = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []
    onChange(normalize({ ...filters, [key]: vals }))
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        Routing Filters
        {active && <Badge variant="outline" className="ml-1 text-blue-600 dark:text-blue-400 border-blue-600/30 dark:border-blue-400/30">active</Badge>}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Environments</Label>
          <div className="flex gap-4">
            {ENVS.map((env) => (
              <Label key={env} className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={envs.includes(env)}
                  onCheckedChange={(c) => toggleEnv(env, !!c)}
                />
                <span className="capitalize">{env}</span>
              </Label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Unchecked = all environments.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-agents" className="text-muted-foreground">Agent Patterns</Label>
          <Input
            id="filter-agents"
            value={(filters?.agent_patterns ?? []).join(", ")}
            onChange={(e) => setPatterns("agent_patterns", e.target.value)}
            placeholder="e.g., team-a-*, agent-billing-*"
          />
          <p className="text-xs text-muted-foreground">Comma-separated glob patterns. Empty = all agents.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-contracts" className="text-muted-foreground">Contract Patterns</Label>
          <Input
            id="filter-contracts"
            value={(filters?.contract_names ?? []).join(", ")}
            onChange={(e) => setPatterns("contract_names", e.target.value)}
            placeholder="e.g., security-*, pii-*"
          />
          <p className="text-xs text-muted-foreground">Comma-separated glob patterns. Empty = all contracts.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
