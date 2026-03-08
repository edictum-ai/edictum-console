import { useNavigate } from "react-router"
import { Activity, ShieldCheck, ShieldOff, Monitor } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/empty-state"
import { ToolCoverageList } from "./tool-coverage-list"
import type { ToolCoverageEntry, CoverageSummary, DeployedBundle } from "@/lib/api/agents"

interface CoverageTabProps {
  tools: ToolCoverageEntry[]
  summary: CoverageSummary
  environment: string
  deployedBundle: DeployedBundle | null
}

export function CoverageTab({ tools, summary, environment, deployedBundle }: CoverageTabProps) {
  const navigate = useNavigate()

  // Empty state: no events at all
  if (tools.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-10 w-10" />}
        title="No events yet"
        description="This agent hasn't generated any events yet. Coverage analysis requires tool usage data."
      />
    )
  }

  // Has tools from events but no console-deployed bundle
  const hasLocalGovernance = tools.some((t) => t.source === "local")
  const allUngoverned = summary.ungoverned === tools.length

  // No console bundle AND no manifest → truly ungoverned
  if (!deployedBundle && !hasLocalGovernance && allUngoverned) {
    return (
      <EmptyState
        icon={<ShieldOff className="h-10 w-10" />}
        title="No contracts deployed"
        description={`No contracts are deployed to ${environment}. All ${tools.length} tools are ungoverned.`}
        action={{
          label: "Deploy a Contract",
          onClick: () => navigate("/dashboard/contracts"),
        }}
      />
    )
  }

  // Celebratory state: all enforced
  const allEnforced = summary.ungoverned === 0 && summary.observed === 0 && summary.enforced > 0

  return (
    <div className="space-y-4">
      {allEnforced && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <AlertDescription className="text-emerald-600 dark:text-emerald-400">
            All {summary.enforced} tools are enforced. Full coverage.
          </AlertDescription>
        </Alert>
      )}

      {hasLocalGovernance && !deployedBundle && (
        <Alert className="border-blue-500/30 bg-blue-500/10">
          <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-600 dark:text-blue-400">
            This agent uses local contracts. Deploy from this console to manage contracts centrally.
          </AlertDescription>
        </Alert>
      )}

      <ToolCoverageList tools={tools} />
    </div>
  )
}
