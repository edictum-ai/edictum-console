import { Link } from "react-router"
import yaml from "js-yaml"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRight, ExternalLink } from "lucide-react"
import type { ContractCoverage } from "@/lib/api"
import type { ParsedContract } from "./types"
import { renderContractSummary } from "./contract-summary"
import { DetailSection, ExpressionTree } from "./expression-tree"

interface ContractDetailProps {
  contract: ParsedContract
  coverage: ContractCoverage | null
}

export function ContractDetail({ contract, coverage }: ContractDetailProps) {
  const summary = renderContractSummary(contract)
  const contractYaml = yaml.dump(
    Object.fromEntries(Object.entries(contract).filter(([, v]) => v !== undefined)),
    { indent: 2, lineWidth: 120, noRefs: true },
  )

  return (
    <div className="ml-5 space-y-2 border-l-2 border-border py-2 pl-4">
      {/* Summary */}
      <p className="text-sm italic text-muted-foreground">{summary}</p>

      {/* Message template */}
      {contract.then?.message && (
        <div className="flex items-start gap-2 rounded bg-muted/60 px-3 py-2">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">msg</span>
          <code className="text-xs">{contract.then.message}</code>
        </div>
      )}

      {/* Approval details */}
      {contract.then?.effect === "approve" && contract.then.timeout && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Timeout: {contract.then.timeout}s</span>
          {contract.then.timeout_effect && (
            <span>
              on timeout:{" "}
              <Badge variant="outline" className="text-[10px]">{contract.then.timeout_effect}</Badge>
            </span>
          )}
        </div>
      )}

      {/* Condition */}
      {contract.when && (
        <DetailSection label="Condition">
          <ExpressionTree expr={contract.when} depth={0} />
        </DetailSection>
      )}

      {/* Sandbox boundaries */}
      {contract.type === "sandbox" && (
        <DetailSection label="Boundaries">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {contract.within && (
              <>
                <span className="font-medium text-muted-foreground">within</span>
                <span>{contract.within.join(", ")}</span>
              </>
            )}
            {contract.not_within && (
              <>
                <span className="font-medium text-muted-foreground">not within</span>
                <span>{contract.not_within.join(", ")}</span>
              </>
            )}
            {contract.allows?.commands && (
              <>
                <span className="font-medium text-muted-foreground">commands</span>
                <span>
                  {contract.allows.commands.length > 8
                    ? `${contract.allows.commands.slice(0, 8).join(", ")} +${contract.allows.commands.length - 8} more`
                    : contract.allows.commands.join(", ")}
                </span>
              </>
            )}
            {contract.allows?.domains && (
              <>
                <span className="font-medium text-muted-foreground">domains</span>
                <span>{contract.allows.domains.join(", ")}</span>
              </>
            )}
            {contract.not_allows?.domains && (
              <>
                <span className="font-medium text-muted-foreground">blocked</span>
                <span className="text-red-600 dark:text-red-400">{contract.not_allows.domains.join(", ")}</span>
              </>
            )}
          </div>
        </DetailSection>
      )}

      {/* Session limits */}
      {contract.type === "session" && contract.limits && (
        <DetailSection label="Limits">
          <div className="flex flex-wrap gap-4 text-xs">
            {contract.limits.max_tool_calls != null && (
              <span><span className="text-muted-foreground">calls:</span> {contract.limits.max_tool_calls}</span>
            )}
            {contract.limits.max_attempts != null && (
              <span><span className="text-muted-foreground">attempts:</span> {contract.limits.max_attempts}</span>
            )}
            {contract.limits.max_calls_per_tool && (
              <span>
                <span className="text-muted-foreground">per-tool:</span>{" "}
                {Object.entries(contract.limits.max_calls_per_tool).map(([t, n]) => `${t}=${n}`).join(", ")}
              </span>
            )}
          </div>
        </DetailSection>
      )}

      <Separator className="my-1" />

      {/* Footer: YAML + coverage */}
      <div className="flex items-center gap-4 text-xs">
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
            YAML
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1.5 overflow-x-auto rounded bg-muted p-3 text-[11px] leading-relaxed">{contractYaml}</pre>
          </CollapsibleContent>
        </Collapsible>
        <span className="text-border">|</span>
        {coverage && coverage.total_evaluations > 0 ? (
          <Link
            to={`/dashboard/events?decision_name=${encodeURIComponent(contract.id)}`}
            className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            {coverage.total_evaluations} evaluations
            {coverage.total_denials > 0 && `, ${coverage.total_denials} denied`}
            <ExternalLink className="size-3" />
          </Link>
        ) : (
          <span className="text-muted-foreground/50">no events recorded</span>
        )}
      </div>
    </div>
  )
}
