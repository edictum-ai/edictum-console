import { Link } from "react-router"
import { ChevronDown, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { CoverageIcon, type CoverageStatus } from "@/lib/coverage-colors"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import { formatRelativeTime } from "@/lib/format"
import type { ToolCoverageEntry } from "@/lib/api/agents"

interface ToolCoverageListProps {
  tools: ToolCoverageEntry[]
}

const SECTION_ORDER: CoverageStatus[] = ["enforced", "observed", "ungoverned"]

const SECTION_BORDERS: Record<CoverageStatus, string> = {
  enforced: "border-l-2 border-emerald-500",
  observed: "border-l-2 border-amber-500",
  ungoverned: "border-l-2 border-red-500",
}

const SECTION_LABELS: Record<CoverageStatus, string> = {
  enforced: "Enforced",
  observed: "Observed",
  ungoverned: "Ungoverned",
}

export function ToolCoverageList({ tools }: ToolCoverageListProps) {
  const grouped = SECTION_ORDER.map((status) => ({
    status,
    items: tools.filter((t) => t.status === status),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-4">
      {grouped.map(({ status, items }) => (
        <Collapsible key={status} defaultOpen>
          <div className={`${SECTION_BORDERS[status]} pl-3`}>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 py-2 text-sm font-medium hover:bg-muted/50 rounded-r-md px-2 -ml-1 transition-colors">
              <CoverageIcon status={status} />
              <span>{SECTION_LABELS[status]} ({items.length} tool{items.length !== 1 ? "s" : ""})</span>
              {status === "ungoverned" && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                  ACTION NEEDED
                </Badge>
              )}
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className={status === "ungoverned" ? "pb-2" : "space-y-1 pb-2"}>
                {items.map((tool) => (
                  status === "ungoverned"
                    ? <UngovernedToolRow key={tool.tool_name} tool={tool} />
                    : <GovernedToolRow key={tool.tool_name} tool={tool} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </div>
  )
}

function GovernedToolRow({ tool }: { tool: ToolCoverageEntry }) {
  const contractLink = tool.contract_name && tool.bundle_name
    ? `/dashboard/contracts?bundle=${encodeURIComponent(tool.bundle_name)}&tab=bundles`
    : null

  const typeStyle = tool.contract_type
    ? CONTRACT_TYPE_COLORS[tool.contract_type as keyof typeof CONTRACT_TYPE_COLORS]
    : null

  return (
    <div className="px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3 text-sm">
        <code className="font-mono text-sm font-medium min-w-[120px]">{tool.tool_name}</code>

        {tool.contract_name && (
          <span className="flex items-center gap-1.5">
            {contractLink ? (
              <Link to={contractLink} className="text-primary hover:underline text-xs truncate max-w-[180px]">
                {tool.contract_name}
              </Link>
            ) : (
              <span className="text-xs text-foreground truncate max-w-[180px]">{tool.contract_name}</span>
            )}
            {tool.source === "local" && (
              <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
                local
              </Badge>
            )}
          </span>
        )}

        {typeStyle && tool.contract_type && (
          <Badge variant="outline" className={`${typeStyle} text-[10px]`}>
            {tool.contract_type}
          </Badge>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {tool.event_count} event{tool.event_count !== 1 ? "s" : ""}
        </span>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(tool.last_used)}
        </span>
      </div>

      {tool.status === "observed" && (
        <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">
          Observe mode only — not enforced.{" "}
          {tool.observe_count != null && tool.observe_count > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {tool.observe_count} would-deny event{tool.observe_count !== 1 ? "s" : ""}.
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function UngovernedToolRow({ tool }: { tool: ToolCoverageEntry }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1 text-sm">
      <code className="font-mono text-sm text-muted-foreground">{tool.tool_name}</code>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {tool.event_count} event{tool.event_count !== 1 ? "s" : ""}
      </span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeTime(tool.last_used)}
      </span>
    </div>
  )
}
