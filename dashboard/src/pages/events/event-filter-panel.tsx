import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { EventResponse } from "@/lib/api"
import { extractUniqueContracts } from "@/lib/payload-helpers"

type Verdict = "allowed" | "denied" | "pending"

interface FacetValue {
  label: string
  key: string
  count: number
}

interface Facet {
  name: string
  field: string
  values: FacetValue[]
}

function verdictDot(v: Verdict) {
  switch (v) {
    case "allowed":
      return "bg-emerald-400"
    case "denied":
      return "bg-red-400"
    case "pending":
      return "bg-amber-400"
  }
}

function buildFacets(events: EventResponse[]): Facet[] {
  const countField = (field: keyof EventResponse) => {
    const counts = new Map<string, number>()
    for (const e of events) {
      const val = String(e[field] ?? "")
      if (val) counts.set(val, (counts.get(val) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([key, count]) => ({
      label: key,
      key,
      count,
    }))
  }

  const contractCounts = extractUniqueContracts(events)
  const contractValues = Array.from(contractCounts.entries()).map(([key, count]) => ({
    label: key,
    key,
    count,
  }))

  return [
    { name: "Agent", field: "agent_id", values: countField("agent_id") },
    { name: "Tool", field: "tool_name", values: countField("tool_name") },
    { name: "Verdict", field: "verdict", values: countField("verdict") },
    { name: "Mode", field: "mode", values: countField("mode") },
    { name: "Contract", field: "_contract", values: contractValues },
  ]
}

interface EventFilterPanelProps {
  events: EventResponse[]
  activeFilters: Record<string, Set<string>>
  collapsedFacets: Set<string>
  onToggleFilter: (field: string, value: string) => void
  onToggleFacetCollapse: (name: string) => void
  onClearAll: () => void
}

export function EventFilterPanel({
  events,
  activeFilters,
  collapsedFacets,
  onToggleFilter,
  onToggleFacetCollapse,
  onClearAll,
}: EventFilterPanelProps) {
  const facets = useMemo(() => buildFacets(events), [events])

  const activeFilterCount = Object.values(activeFilters).reduce(
    (sum, set) => sum + set.size,
    0,
  )

  return (
    <div className="h-full border-r border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </span>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      <ScrollArea className="h-[calc(100%-41px)]">
        <div className="p-2">
          {facets.map((facet) => {
            const isCollapsed = collapsedFacets.has(facet.name)
            const activeSet = activeFilters[facet.field] ?? new Set<string>()

            return (
              <div key={facet.name} className="mb-1">
                <button
                  onClick={() => onToggleFacetCollapse(facet.name)}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                  {facet.name}
                </button>

                {!isCollapsed && (
                  <div className="ml-1 space-y-0.5 pb-2">
                    {facet.values
                      .filter((v) => v.count > 0)
                      .sort((a, b) => b.count - a.count)
                      .map((value) => {
                        const isActive = activeSet.has(value.key)
                        return (
                          <button
                            key={value.key}
                            onClick={() =>
                              onToggleFilter(facet.field, value.key)
                            }
                            className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors ${
                              isActive
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {facet.field === "verdict" && (
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${verdictDot(value.key as Verdict)}`}
                                />
                              )}
                              <span className="truncate">{value.label}</span>
                            </span>
                            <span
                              className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                isActive
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {value.count}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
