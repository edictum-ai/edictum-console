/**
 * Filter bar for the agents page — search, env, coverage, drift, and time window selects.
 */

import { Search } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { PRESETS, PRESET_KEYS, type PresetKey } from "@/lib/histogram"
import type { AgentFilters, CoverageFilter, DriftFilter } from "@/hooks/use-agent-filters"

interface AgentFiltersBarProps {
  search: string
  env: string
  coverage: CoverageFilter
  drift: DriftFilter
  since: PresetKey
  onUpdate: <K extends keyof AgentFilters>(key: K, value: AgentFilters[K]) => void
}

export function AgentFiltersBar({ search, env, coverage, drift, since, onUpdate }: AgentFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
      <InputGroup className="w-full sm:w-[200px]">
        <InputGroupAddon>
          <Search className="h-4 w-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search agents..."
          value={search}
          onChange={(e) => onUpdate("search", e.target.value)}
        />
      </InputGroup>

      <Select value={env} onValueChange={(v) => onUpdate("env", v)}>
        <SelectTrigger className="w-full sm:w-[130px] h-9">
          <SelectValue placeholder="Environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Envs</SelectItem>
          <SelectItem value="production">Production</SelectItem>
          <SelectItem value="staging">Staging</SelectItem>
          <SelectItem value="development">Development</SelectItem>
        </SelectContent>
      </Select>

      <Select value={coverage} onValueChange={(v) => onUpdate("coverage", v as CoverageFilter)}>
        <SelectTrigger className="w-full sm:w-[150px] h-9">
          <SelectValue placeholder="Coverage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Coverage</SelectItem>
          <SelectItem value="has_ungoverned">Has Ungoverned</SelectItem>
          <SelectItem value="fully_enforced">Fully Enforced</SelectItem>
          <SelectItem value="observe_only">Observe Only</SelectItem>
        </SelectContent>
      </Select>

      <Select value={drift} onValueChange={(v) => onUpdate("drift", v as DriftFilter)}>
        <SelectTrigger className="w-full sm:w-[120px] h-9">
          <SelectValue placeholder="Drift" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Drift</SelectItem>
          <SelectItem value="current">Current</SelectItem>
          <SelectItem value="drift">Drifted</SelectItem>
        </SelectContent>
      </Select>

      <Select value={since} onValueChange={(v) => onUpdate("since", v as PresetKey)}>
        <SelectTrigger className="w-full sm:w-[110px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {PRESETS[key].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
