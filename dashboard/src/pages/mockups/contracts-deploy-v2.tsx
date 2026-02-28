import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  ArrowUpCircle,
  Bot,
  CheckCircle2,
  Clock,
  Layers,
  Rocket,
  User,
} from "lucide-react"
import {
  type CompositionLayer,
  type Deployment,
  type Environment,
  type EnvironmentStatus,
  ENVIRONMENTS,
  ENV_COLORS,
  LATEST_VERSION,
  MOCK_DEPLOYMENTS,
  MOCK_ENV_STATUS,
  relativeTime,
} from "./contracts-data"
import { ContractsTabBar } from "./contracts-tab-bar"

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EnvironmentColumnHeader({ envStatus }: { envStatus: EnvironmentStatus }) {
  const colors = ENV_COLORS[envStatus.env]
  const isCurrent = envStatus.deployed_version === LATEST_VERSION

  return (
    <div className="space-y-3">
      {/* Environment name + dot */}
      <div className="flex items-center gap-2.5">
        <span className={`inline-block size-2.5 rounded-full ${colors.dot}`} />
        <span className="text-base font-semibold capitalize">
          {envStatus.env}
        </span>
      </div>

      {/* Prominent version badge */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-3xl font-bold tracking-tight">
          v{envStatus.deployed_version}
        </span>
        {isCurrent ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            In sync
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="size-3.5" />
            Behind (latest v{LATEST_VERSION})
          </span>
        )}
      </div>
    </div>
  )
}

function AgentSummaryCard({ envStatus }: { envStatus: EnvironmentStatus }) {
  const offlineCount = envStatus.agents_total - envStatus.agents_online
  const versionEntries = Object.entries(envStatus.agents_on_version)
  const driftedCount = versionEntries
    .filter(([v]) => Number(v) !== envStatus.deployed_version)
    .reduce((sum, [, count]) => sum + count, 0)

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Agents</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
          <span className="text-sm font-mono">
            {envStatus.agents_online}/{envStatus.agents_total}
          </span>
          <span className="text-xs text-muted-foreground">online</span>
        </div>
        {offlineCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-zinc-500" />
            <span className="text-xs text-muted-foreground">
              {offlineCount} offline
            </span>
          </div>
        )}
      </div>

      {driftedCount > 0 && (
        <DriftWarning
          driftedCount={driftedCount}
          envStatus={envStatus}
        />
      )}
    </div>
  )
}

function DriftWarning({
  driftedCount,
  envStatus,
}: {
  driftedCount: number
  envStatus: EnvironmentStatus
}) {
  const driftedVersions = Object.entries(envStatus.agents_on_version)
    .filter(([v]) => Number(v) !== envStatus.deployed_version)
    .map(([v, count]) => `${count} on v${v}`)
    .join(", ")

  return (
    <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
      <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <span className="text-xs font-medium text-amber-400">
          {driftedCount} agent{driftedCount !== 1 ? "s" : ""} drifted
        </span>
        <p className="text-[11px] text-amber-400/80">{driftedVersions}</p>
      </div>
    </div>
  )
}

function CompositionStack({ layers }: { layers: CompositionLayer[] }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Composition Stack
      </span>
      <div className="space-y-1">
        {layers.map((layer, idx) => {
          const isObserve = layer.mode === "observe_alongside"
          return (
            <div
              key={idx}
              className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${
                isObserve
                  ? "border-dashed border-blue-500/30 bg-blue-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers
                  className={`size-3 shrink-0 ${
                    isObserve ? "text-blue-400" : "text-amber-400"
                  }`}
                />
                <span className="text-sm font-mono truncate">
                  {layer.bundle_name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  v{layer.version}
                </span>
              </div>
              <Badge
                variant="outline"
                className={
                  isObserve
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/25 text-[10px] shrink-0"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] shrink-0"
                }
              >
                {isObserve ? "observe" : "enforce"}
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeploymentFooter({ envStatus }: { envStatus: EnvironmentStatus }) {
  const isCurrent = envStatus.deployed_version === LATEST_VERSION

  return (
    <div className="space-y-3 pt-1">
      {/* Last deployed */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3" />
        <span>Deployed {relativeTime(envStatus.deployed_at)}</span>
        <span className="text-muted-foreground/60">by</span>
        <User className="size-3" />
        <span className="truncate">{envStatus.deployed_by}</span>
      </div>

      {/* Quick action */}
      {isCurrent ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
          <CheckCircle2 className="size-3" />
          Running latest version
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          <ArrowUpCircle className="size-3.5" />
          Sync to v{LATEST_VERSION}
        </Button>
      )}
    </div>
  )
}

function EnvironmentColumn({ envStatus }: { envStatus: EnvironmentStatus }) {
  const colors = ENV_COLORS[envStatus.env]
  const isCurrent = envStatus.deployed_version === LATEST_VERSION

  // Subtle tinted background — 5% environment color
  const tintClass = isCurrent
    ? "bg-card"
    : `bg-card ${colors.border}`

  return (
    <Card className={`${tintClass} flex flex-col`}>
      <CardContent className="flex flex-col gap-4 p-5">
        <EnvironmentColumnHeader envStatus={envStatus} />
        <AgentSummaryCard envStatus={envStatus} />
        <CompositionStack layers={envStatus.composition} />
        <DeploymentFooter envStatus={envStatus} />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Deploy History Row
// ---------------------------------------------------------------------------

function DeployHistoryRow() {
  const sortedDeploys = [...MOCK_DEPLOYMENTS]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 3)

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recent Deploys
      </h3>
      <div className="flex items-center gap-3">
        {sortedDeploys.map((dep) => (
          <DeployHistoryItem key={dep.id} deployment={dep} />
        ))}
      </div>
    </div>
  )
}

function DeployHistoryItem({ deployment }: { deployment: Deployment }) {
  const envColors = ENV_COLORS[deployment.env as Environment]

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-2.5 flex-1">
      <Rocket className="size-3.5 text-muted-foreground shrink-0" />
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge
          variant="outline"
          className={`${envColors.bg} ${envColors.text} ${envColors.border} capitalize text-[10px] shrink-0`}
        >
          {deployment.env}
        </Badge>
        <span className="font-mono text-sm font-semibold shrink-0">
          v{deployment.bundle_version}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          {relativeTime(deployment.created_at)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground/60 truncate max-w-[140px]">
        {deployment.deployed_by}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsDeployV2() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground">
            What is running where across your environments
          </p>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white">
          <Rocket className="size-4" />
          Deploy Version...
        </Button>
      </div>

      {/* Tab bar */}
      <ContractsTabBar activeTab="deployments" />

      {/* Environment columns */}
      <div className="p-6">
        <div className="grid grid-cols-3 gap-5">
          {ENVIRONMENTS.map((env) => {
            const envStatus = MOCK_ENV_STATUS.find((s) => s.env === env)
            if (!envStatus) return null
            return <EnvironmentColumn key={env} envStatus={envStatus} />
          })}
        </div>

        {/* Compact deploy history */}
        <DeployHistoryRow />
      </div>
    </div>
  )
}
