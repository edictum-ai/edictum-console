import { ContractsTabBar } from "./contracts-tab-bar"
import { Button } from "@/components/ui/button"
import { Rocket } from "lucide-react"
import { SummaryRow, DriftDetail, RecentDeploysRow } from "./contracts-deploy-v3-parts"
import { EnvironmentTable } from "./contracts-deploy-v3-table"

// ---------------------------------------------------------------------------
// Variation 3: Compact Dashboard (Bloomberg-density)
//
// "What's running where?" — everything visible in one viewport, no scrolling.
// No cards — just a tight table and supplemental rows.
// Color coding does the heavy lifting (env dots, status icons, drift amber).
// ---------------------------------------------------------------------------

export default function ContractsDeployV3() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white">
          <Rocket className="size-3.5" />
          Deploy Version...
        </Button>
      </div>

      {/* Tab bar */}
      <ContractsTabBar activeTab="deployments" />

      {/* Summary row — one-line stat chips */}
      <SummaryRow />

      {/* Environment table — the hero section */}
      <div className="px-6 pt-4 pb-3">
        <EnvironmentTable />
      </div>

      {/* Drift detail — only renders when drift exists */}
      <DriftDetail />

      {/* Recent deploys — compact inline badge row pinned to bottom */}
      <div className="mt-auto">
        <RecentDeploysRow />
      </div>
    </div>
  )
}
