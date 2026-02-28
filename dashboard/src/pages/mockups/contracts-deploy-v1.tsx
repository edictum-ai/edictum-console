import {
  type EnvironmentStatus,
  type CompositionLayer,
  type Environment,
  MOCK_ENV_STATUS,
  MOCK_DEPLOYMENTS,
  MOCK_AGENTS,
  ENV_COLORS,
  relativeTime,
} from "./contracts-data"
import { ContractsTabBar } from "./contracts-tab-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Rocket,
  Circle,
  AlertTriangle,
  Layers,
  Eye,
  Shield,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Fleet summary calculations
// ---------------------------------------------------------------------------

function useFleetSummary() {
  const totalAgents = MOCK_AGENTS.length
  const onlineAgents = MOCK_AGENTS.filter((a) => a.status === "online").length
  const driftCount = MOCK_ENV_STATUS.reduce((acc, env) => {
    const versions = Object.entries(env.agents_on_version)
    const drifted = versions
      .filter(([v]) => Number(v) !== env.deployed_version)
      .reduce((sum, [, count]) => sum + count, 0)
    return acc + drifted
  }, 0)
  return { totalAgents, onlineAgents, driftCount }
}

// ---------------------------------------------------------------------------
// Fleet Summary Strip
// ---------------------------------------------------------------------------

function FleetSummaryStrip() {
  const { totalAgents, onlineAgents, driftCount } = useFleetSummary()

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2">
      <Layers className="size-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{totalAgents}</span> agents
        {" · "}
        <span className="font-medium text-emerald-400">{onlineAgents}</span> online
      </span>
      {driftCount > 0 && (
        <>
          <span className="text-sm text-muted-foreground">{" · "}</span>
          <span className="flex items-center gap-1 text-sm">
            <Circle className="size-2 fill-amber-400 text-amber-400" />
            <span className="font-medium text-amber-400">{driftCount}</span>
            <span className="text-muted-foreground">version drift</span>
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composition Layer Row
// ---------------------------------------------------------------------------

function CompositionLayerRow({ layer }: { layer: CompositionLayer }) {
  const isObserve = layer.mode === "observe_alongside"

  return (
    <div
      className={`flex items-center justify-between py-1.5 ${
        isObserve ? "border-l-2 border-dashed border-blue-500/50 pl-2.5" : "pl-0"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isObserve ? (
          <Eye className="size-3 shrink-0 text-blue-400" />
        ) : (
          <Shield className="size-3 shrink-0 text-amber-400" />
        )}
        <span className="truncate text-xs font-mono text-foreground">
          {layer.bundle_name}
        </span>
        <span className="text-xs text-muted-foreground">v{layer.version}</span>
      </div>
      <Badge
        variant="outline"
        className={
          isObserve
            ? "bg-blue-500/15 text-blue-400 border-blue-500/25 text-[10px] px-1.5"
            : "bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] px-1.5"
        }
      >
        {isObserve ? "observe" : "enforce"}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Environment Card
// ---------------------------------------------------------------------------

function EnvironmentCard({ envStatus }: { envStatus: EnvironmentStatus }) {
  const colors = ENV_COLORS[envStatus.env]
  const driftVersions = Object.entries(envStatus.agents_on_version).filter(
    ([v]) => Number(v) !== envStatus.deployed_version,
  )
  const hasDrift = driftVersions.length > 0
  const envLabel = envStatus.env.charAt(0).toUpperCase() + envStatus.env.slice(1)

  return (
    <Card
      className={`relative overflow-hidden py-0 ${
        hasDrift ? "border-l-2 border-l-amber-500/60" : ""
      }`}
    >
      {/* Colored top bar */}
      <div className={`h-0.5 ${colors.dot}`} />

      <CardContent className="px-4 pt-3.5 pb-4">
        {/* Environment name + version */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{envLabel}</span>
          <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border}`}>
            v{envStatus.deployed_version}
          </Badge>
        </div>

        {/* Deployed meta */}
        <p className="mt-1 text-xs text-muted-foreground">
          {relativeTime(envStatus.deployed_at)} by {envStatus.deployed_by}
        </p>

        {/* Agents row */}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Circle className="size-2 fill-emerald-400 text-emerald-400" />
            <span className="text-xs text-foreground">
              {envStatus.agents_online} online
            </span>
            <span className="text-xs text-muted-foreground">
              / {envStatus.agents_total} total
            </span>
          </div>
          {hasDrift &&
            driftVersions.map(([version, count]) => (
              <Badge
                key={version}
                variant="outline"
                className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] px-1.5"
              >
                <AlertTriangle className="size-2.5 mr-0.5" />
                {count} on v{version}
              </Badge>
            ))}
        </div>

        {/* Composition stack */}
        <Separator className="my-3" />
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Composition
          </span>
          <div className="mt-1">
            {envStatus.composition.map((layer) => (
              <CompositionLayerRow key={`${layer.bundle_name}-${layer.version}`} layer={layer} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recent Deployments
// ---------------------------------------------------------------------------

function RecentDeployments() {
  const recent = MOCK_DEPLOYMENTS.slice(0, 5)

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="mb-3 flex items-center gap-2">
          <Rocket className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Recent Deployments</span>
        </div>
        <div className="divide-y divide-border">
          {recent.map((d) => {
            const envKey = d.env as Environment
            const colors = ENV_COLORS[envKey]
            return (
              <div key={d.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <Badge
                  variant="outline"
                  className={`${colors.bg} ${colors.text} ${colors.border} text-[10px] w-24 justify-center`}
                >
                  {d.env}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{d.bundle_version}
                </Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  by {d.deployed_by}
                </span>
                <span className="shrink-0 text-xs font-mono text-muted-foreground/60">
                  {relativeTime(d.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsDeployV1() {
  return (
    <div className="min-h-screen bg-background">
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

      {/* Content */}
      <div className="space-y-5 px-6 pt-5 pb-6">
        {/* Fleet summary strip */}
        <FleetSummaryStrip />

        {/* Environment cards — 3 column grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MOCK_ENV_STATUS.map((envStatus) => (
            <EnvironmentCard key={envStatus.env} envStatus={envStatus} />
          ))}
        </div>

        {/* Recent deployments */}
        <RecentDeployments />
      </div>
    </div>
  )
}
