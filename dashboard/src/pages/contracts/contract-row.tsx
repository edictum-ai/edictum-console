import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChevronRight } from "lucide-react"
import type { ContractCoverage } from "@/lib/api"
import { CONTRACT_MODE_COLORS } from "@/lib/contract-colors"
import type { ContractType, Mode, ParsedContract } from "./types"
import { ContractDetail } from "./contract-detail"
import {
  EFFECT_TOOLTIPS, TYPE_TOOLTIPS, MODE_TOOLTIPS, withDocTooltip,
} from "./contract-tooltips"

interface ContractRowProps {
  contract: ParsedContract
  coverage: ContractCoverage | null
  defaultMode: Mode
}

const EFFECT_STYLES: Record<string, string> = {
  deny: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  approve: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  redact: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
}

const TYPE_ACCENT: Record<ContractType, string> = {
  pre: "border-l-amber-500",
  post: "border-l-emerald-500",
  session: "border-l-blue-500",
  sandbox: "border-l-orange-500",
}

export function ContractRow({ contract, coverage, defaultMode }: ContractRowProps) {
  const mode = contract.mode ?? defaultMode
  const effect = contract.then?.effect ?? (contract.type === "sandbox" ? (contract.outside ?? "deny") : "deny")
  const tool = contract.tool ?? contract.tools?.join(", ") ?? "*"
  const tags = contract.then?.tags ?? []
  const hasCoverage = coverage && coverage.total_evaluations > 0

  return (
    <TooltipProvider delayDuration={400}>
    <Collapsible>
      <CollapsibleTrigger className={`group flex w-full items-center gap-2 border-l-2 ${TYPE_ACCENT[contract.type]} rounded-r px-3 py-2 text-left transition-colors hover:bg-muted/50`}>
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />

        {/* Contract ID — primary visual weight */}
        <span className="shrink-0 font-mono text-[13px] font-medium">{contract.id}</span>

        {/* Type badge */}
        {withDocTooltip(
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            {contract.type}
          </Badge>,
          TYPE_TOOLTIPS,
          contract.type,
        )}

        {/* Tool — monospace, de-emphasized */}
        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {tool}
        </code>

        {/* Effect — the focal badge */}
        {withDocTooltip(
          <Badge variant="outline" className={`shrink-0 text-[10px] ${EFFECT_STYLES[effect] ?? ""}`}>
            {effect}
          </Badge>,
          EFFECT_TOOLTIPS,
          effect,
        )}

        {/* Mode — only show if different from default */}
        {contract.mode && contract.mode !== defaultMode && withDocTooltip(
          <Badge variant="outline" className={`shrink-0 text-[10px] ${CONTRACT_MODE_COLORS[mode]}`}>
            {mode}
          </Badge>,
          MODE_TOOLTIPS,
          mode,
        )}

        {/* Tags */}
        {tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="secondary" className="shrink-0 text-[10px]">
            {tag}
          </Badge>
        ))}
        {tags.length > 3 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">+{tags.length - 3}</span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Coverage — right-aligned, prominent */}
        {hasCoverage ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {coverage.total_evaluations}
            </span>
            {coverage.total_denials > 0 && (
              <span className="text-red-600 dark:text-red-400">
                ({coverage.total_denials} denied)
              </span>
            )}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground/50">
            <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            untriggered
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ContractDetail contract={contract} coverage={coverage} />
      </CollapsibleContent>
    </Collapsible>
    </TooltipProvider>
  )
}
