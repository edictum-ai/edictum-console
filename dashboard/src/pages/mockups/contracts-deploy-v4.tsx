import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Rocket,
} from "lucide-react"
import {
  type Environment,
  ENV_COLORS,
  MOCK_AGENTS,
  MOCK_ENV_STATUS,
  MOCK_DEPLOYMENTS,
  relativeTime,
} from "./contracts-data"
import { ContractsTabBar } from "./contracts-tab-bar"
import { SyncTile } from "./contracts-deploy-v4-tile"

// ---------------------------------------------------------------------------
// Fleet Overview Strip
// ---------------------------------------------------------------------------

function FleetStrip() {
  const total = MOCK_AGENTS.length
  const online = MOCK_AGENTS.filter((a) => a.status === "online").length
  const envCount = new Set(MOCK_AGENTS.map((a) => a.env)).size

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground px-1 py-2">
      <Bot className="size-3.5" />
      <span>
        Fleet: <span className="font-mono text-foreground">{total}</span> agents
        across <span className="font-mono text-foreground">{envCount}</span>{" "}
        environments
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="font-mono text-foreground">{online}</span> online
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deploy History (collapsed by default)
// ---------------------------------------------------------------------------

function DeployHistory() {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...MOCK_DEPLOYMENTS]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div className="mt-6 rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
      >
        <Rocket className="size-4 text-muted-foreground" />
        Recent deploys
        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 bg-muted/50">
          {sorted.length}
        </Badge>
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-2 space-y-0">
          {sorted.map((dep) => {
            const envColor = ENV_COLORS[dep.env as Environment]
            return (
              <div
                key={dep.id}
                className="flex items-center gap-3 py-2 text-xs"
              >
                <span
                  className={`size-2 rounded-full shrink-0 ${envColor?.dot ?? "bg-zinc-500"}`}
                />
                <span className="capitalize text-foreground w-24">{dep.env}</span>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] px-1.5 bg-muted/50"
                >
                  v{dep.bundle_version}
                </Badge>
                <span className="text-muted-foreground truncate">
                  {dep.deployed_by}
                </span>
                <span className="ml-auto text-muted-foreground/60 font-mono shrink-0">
                  {relativeTime(dep.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsDeployV4() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <Button>
          <Rocket className="size-4" />
          Deploy Version...
        </Button>
      </div>

      {/* Tab bar */}
      <ContractsTabBar activeTab="deployments" />

      {/* Content */}
      <div className="px-6 py-6">
        {/* Sync status tiles — hero grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {MOCK_ENV_STATUS.map((envStatus) => (
            <SyncTile key={envStatus.env} envStatus={envStatus} />
          ))}
        </div>

        {/* Fleet overview strip */}
        <FleetStrip />

        {/* Deploy history (collapsed) */}
        <DeployHistory />
      </div>
    </div>
  )
}
