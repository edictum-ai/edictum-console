import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CompositionSummary } from "@/lib/api/compositions"
import { CONTRACT_MODE_COLORS } from "@/lib/contract-colors"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

interface CompositionListItemProps {
  composition: CompositionSummary
  selected: boolean
  onClick: () => void
}

const STRATEGY_LABELS: Record<string, string> = {
  manual: "manual",
  auto_deploy: "auto",
  observe_first: "observe first",
}

export function CompositionListItem({
  composition,
  selected,
  onClick,
}: CompositionListItemProps) {
  const modeColor =
    CONTRACT_MODE_COLORS[composition.defaults_mode] ??
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30"

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer py-2.5 transition-colors hover:border-muted-foreground/30",
        selected && "border-l-2 border-l-primary bg-muted/50",
      )}
    >
      <CardContent className="space-y-1.5 px-3 py-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {composition.name}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`${modeColor} text-[10px]`}>
            {composition.defaults_mode}
          </Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {STRATEGY_LABELS[composition.update_strategy] ?? composition.update_strategy}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>
            {composition.contract_count} contract
            {composition.contract_count !== 1 ? "s" : ""}
          </span>
          <span className="mx-0.5">&middot;</span>
          <span>{formatRelativeTime(composition.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
