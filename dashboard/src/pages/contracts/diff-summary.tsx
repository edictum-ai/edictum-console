import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import type { ContractDiff } from "./types"

interface DiffSummaryProps {
  diff: ContractDiff
}

export function DiffSummary({ diff }: DiffSummaryProps) {
  const [showUnchanged, setShowUnchanged] = useState(false)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 text-sm font-medium">
        {diff.added.length > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">+{diff.added.length} added</span>
        )}
        {diff.removed.length > 0 && (
          <span className="text-red-600 dark:text-red-400">-{diff.removed.length} removed</span>
        )}
        {diff.modified.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400">~{diff.modified.length} modified</span>
        )}
        <span className="text-muted-foreground">{diff.unchanged.length} unchanged</span>
      </div>

      {/* Detail list */}
      <div className="space-y-2">
        {diff.added.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">+</span>
            <span className="font-mono text-sm">{c.id}</span>
            <Badge variant="outline" className={CONTRACT_TYPE_COLORS[c.type]}>
              {c.type}
            </Badge>
          </div>
        ))}

        {diff.removed.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-red-600 dark:text-red-400">-</span>
            <span className="font-mono text-sm line-through text-muted-foreground">{c.id}</span>
            <Badge variant="outline" className={CONTRACT_TYPE_COLORS[c.type]}>
              {c.type}
            </Badge>
          </div>
        ))}

        {diff.modified.map((m) => (
          <div key={m.id} className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-amber-600 dark:text-amber-400">~</span>
              <span className="font-mono text-sm">{m.id}</span>
            </div>
            <ul className="ml-5 space-y-0.5">
              {m.changes.map((change, i) => (
                <li key={i} className="text-xs text-muted-foreground">{change}</li>
              ))}
            </ul>
          </div>
        ))}

        {/* Unchanged — collapsible */}
        {diff.unchanged.length > 0 && (
          <Collapsible open={showUnchanged} onOpenChange={setShowUnchanged}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRight className={`size-3 transition-transform ${showUnchanged ? "rotate-90" : ""}`} />
              {diff.unchanged.length} unchanged contract{diff.unchanged.length !== 1 ? "s" : ""}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-4 mt-1 space-y-0.5">
                {diff.unchanged.map((id) => (
                  <p key={id} className="font-mono text-xs text-muted-foreground">{id}</p>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty diff */}
        {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
          <p className="text-sm text-muted-foreground">No contract-level changes between these versions.</p>
        )}
      </div>
    </div>
  )
}
