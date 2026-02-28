import {
  type Environment,
  MOCK_ENV_STATUS,
  MOCK_DEPLOYMENTS,
  MOCK_AGENTS,
  ENV_COLORS,
  LATEST_VERSION,
  relativeTime,
  driftedAgents,
} from "./contracts-data"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Rocket, AlertTriangle, Search } from "lucide-react"

// ---------------------------------------------------------------------------
// Summary stats helper
// ---------------------------------------------------------------------------

function useSummaryStats() {
  const totalAgents = MOCK_AGENTS.length
  const onlineAgents = MOCK_AGENTS.filter((a) => a.status === "online").length
  const driftCount = MOCK_ENV_STATUS.reduce((acc, env) => {
    const drifted = Object.entries(env.agents_on_version)
      .filter(([v]) => Number(v) !== env.deployed_version)
      .reduce((sum, [, count]) => sum + count, 0)
    return acc + drifted
  }, 0)
  return { totalAgents, onlineAgents, driftCount }
}

// ---------------------------------------------------------------------------
// Summary Row — one-line stat chips
// ---------------------------------------------------------------------------

export function SummaryRow() {
  const { totalAgents, onlineAgents, driftCount } = useSummaryStats()

  return (
    <div className="flex items-center gap-3 px-6 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border">
      <span>
        Latest:{" "}
        <span className="font-mono font-medium text-foreground">
          v{LATEST_VERSION}
        </span>
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>
        <span className="font-medium text-foreground">{totalAgents}</span>{" "}
        agents
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>
        <span className="font-medium text-emerald-400">{onlineAgents}</span>{" "}
        online
      </span>
      {driftCount > 0 && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <span className="flex items-center gap-1">
            <AlertTriangle className="size-3 text-amber-400" />
            <span className="font-medium text-amber-400">{driftCount}</span>{" "}
            drift
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drift Detail — compact amber-bordered section
// ---------------------------------------------------------------------------

export function DriftDetail() {
  const allDrifted = MOCK_ENV_STATUS.flatMap((env) => {
    const agents = driftedAgents(env.env, env.deployed_version)
    return agents.map((a) => ({ ...a, expectedVersion: env.deployed_version }))
  })

  if (allDrifted.length === 0) return null

  return (
    <div className="mx-6 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle className="size-3.5 text-amber-400" />
        <span className="text-xs font-medium text-foreground">
          {allDrifted.length} agent{allDrifted.length > 1 ? "s" : ""} running
          outdated contracts
        </span>
      </div>
      <div className="space-y-1">
        {allDrifted.map((agent) => (
          <div
            key={agent.agent_id}
            className="flex items-center gap-2 text-xs pl-5"
          >
            <span className="font-mono font-medium text-foreground">
              {agent.agent_id}
            </span>
            <span className="text-muted-foreground">{agent.env}</span>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-muted-foreground">
              running{" "}
              <span className="font-mono text-amber-400">
                v{agent.contract_version}
              </span>{" "}
              (expected{" "}
              <span className="font-mono">v{agent.expectedVersion}</span>)
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
            >
              <Search className="size-2.5 mr-0.5" />
              Investigate
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent Deploys — inline badge row
// ---------------------------------------------------------------------------

export function RecentDeploysRow() {
  const recent = MOCK_DEPLOYMENTS.slice(0, 3)

  return (
    <div className="flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground border-t border-border bg-muted/20">
      <Rocket className="size-3 text-muted-foreground/60 shrink-0" />
      <span className="text-muted-foreground/60 shrink-0">Recent:</span>
      {recent.map((d, idx) => {
        const envKey = d.env as Environment
        const colors = ENV_COLORS[envKey]
        return (
          <span key={d.id} className="flex items-center gap-1">
            {idx > 0 && (
              <span className="text-muted-foreground/30 mr-1">|</span>
            )}
            <span className={`${colors.text} font-medium`}>{d.env}</span>
            <span className="text-muted-foreground/40">&larr;</span>
            <span className="font-mono text-foreground">
              v{d.bundle_version}
            </span>
            <span className="font-mono text-muted-foreground/60">
              {relativeTime(d.created_at)}
            </span>
          </span>
        )
      })}
    </div>
  )
}
