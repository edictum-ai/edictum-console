import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Rocket } from "lucide-react"
import {
  type ConnectedAgent,
  type Environment,
  type EnvironmentStatus,
  ENV_COLORS,
  MOCK_DEPLOYMENTS,
  relativeTime,
} from "./contracts-data"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function envLabel(env: Environment): string {
  return env.charAt(0).toUpperCase() + env.slice(1)
}

export function deployedVersionForEnv(
  envStatuses: EnvironmentStatus[],
  env: Environment,
): number {
  return envStatuses.find((s) => s.env === env)?.deployed_version ?? 0
}

export function hasDrift(envStatus: EnvironmentStatus): boolean {
  return Object.keys(envStatus.agents_on_version).some(
    (v) => Number(v) !== envStatus.deployed_version,
  )
}

// ---------------------------------------------------------------------------
// Agent Table Row (right panel)
// ---------------------------------------------------------------------------

export function AgentRow({
  agent,
  expectedVersion,
}: {
  agent: ConnectedAgent
  expectedVersion: number
}) {
  const isDrifted = agent.contract_version !== expectedVersion
  const isOnline = agent.status === "online"

  return (
    <div
      className={`flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 ${
        isDrifted ? "bg-amber-500/5" : ""
      }`}
    >
      <span
        className={`inline-block size-2 shrink-0 rounded-full ${
          isOnline ? "bg-emerald-400" : "bg-zinc-500"
        }`}
      />
      <span className="w-[140px] shrink-0 truncate font-mono text-xs text-foreground">
        {agent.agent_id}
      </span>
      <Badge
        variant="outline"
        className={`shrink-0 text-[10px] font-mono ${
          isDrifted
            ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
        }`}
      >
        {isDrifted && <AlertTriangle className="mr-0.5 size-2.5" />}
        v{agent.contract_version}
      </Badge>
      <span className="w-[60px] shrink-0 text-right font-mono text-xs text-muted-foreground">
        {agent.events_24h}
      </span>
      <span
        className={`w-[40px] shrink-0 text-right font-mono text-xs ${
          agent.denials_24h > 0 ? "text-red-400" : "text-muted-foreground"
        }`}
      >
        {agent.denials_24h}
      </span>
      <span className="flex-1 text-right text-xs text-muted-foreground/60">
        {relativeTime(agent.last_seen)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent Deploys Strip (bottom)
// ---------------------------------------------------------------------------

export function RecentDeploysStrip() {
  const recent = [...MOCK_DEPLOYMENTS]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 3)

  return (
    <div className="flex items-center gap-3 border-t border-border bg-muted/20 px-6 py-2.5">
      <Rocket className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Recent
      </span>
      {recent.map((d, idx) => {
        const colors = ENV_COLORS[d.env as Environment]
        return (
          <div key={d.id} className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={`${colors.bg} ${colors.text} ${colors.border} capitalize text-[9px] px-1.5`}
            >
              {d.env}
            </Badge>
            <span className="font-mono text-xs font-semibold text-foreground">
              v{d.bundle_version}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(d.created_at)}
            </span>
            {idx < recent.length - 1 && (
              <span className="text-muted-foreground/30">|</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
