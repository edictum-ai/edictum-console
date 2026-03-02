import { useNavigate } from "react-router"
import { Activity, ShieldCheck, ShieldOff } from "lucide-react"
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

  // Empty state: no events and no contracts
  if (tools.length === 0 && !deployedBundle) {
    return (
      <EmptyState
        icon={<Activity className="h-10 w-10" />}
        title="No events yet"
        description="This agent hasn't generated any events yet. Coverage analysis requires tool usage data."
      />
    )
  }

  // Empty state: no contracts deployed but has tools
  if (!deployedBundle && tools.length > 0) {
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

  // Empty state: no events but has contracts
  if (tools.length === 0 && deployedBundle) {
    return (
      <EmptyState
        icon={<Activity className="h-10 w-10" />}
        title="No events yet"
        description="This agent hasn't generated any events yet. Coverage analysis requires tool usage data."
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

      <ToolCoverageList tools={tools} />
    </div>
  )
}
