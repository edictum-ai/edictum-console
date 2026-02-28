import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Wifi,
} from "lucide-react"
import {
  type CompositionLayer,
  ENV_COLORS,
  type EnvironmentStatus,
  LATEST_VERSION,
  relativeTime,
  agentsByEnv,
  onlineAgentsByEnv,
  driftedAgents,
} from "./contracts-data"

type SyncStatus = "synced" | "out_of_sync"

function getSyncStatus(envStatus: EnvironmentStatus): SyncStatus {
  return envStatus.deployed_version === LATEST_VERSION ? "synced" : "out_of_sync"
}

const SYNC_VISUALS: Record<
  SyncStatus,
  { label: string; border: string; glow: string; iconColor: string; labelColor: string }
> = {
  synced: {
    label: "In Sync",
    border: "border-emerald-500/40",
    glow: "shadow-[0_0_24px_-6px_rgba(16,185,129,0.15)]",
    iconColor: "text-emerald-400",
    labelColor: "text-emerald-400",
  },
  out_of_sync: {
    label: "Out of Sync",
    border: "border-amber-500/40",
    glow: "shadow-[0_0_24px_-6px_rgba(245,158,11,0.15)]",
    iconColor: "text-amber-400",
    labelColor: "text-amber-400",
  },
}

function CompactComposition({ layers }: { layers: CompositionLayer[] }) {
  return (
    <div className="space-y-1">
      {layers.map((layer, i) => {
        const isObserve = layer.mode === "observe_alongside"
        return (
          <div
            key={i}
            className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
              isObserve
                ? "border border-dashed border-blue-500/30 bg-blue-500/5"
                : "bg-muted/50"
            }`}
          >
            <Layers className="size-3 shrink-0 text-muted-foreground" />
            <span className="font-mono text-foreground truncate">
              {layer.bundle_name}
            </span>
            <span className="text-muted-foreground shrink-0">v{layer.version}</span>
            {isObserve && (
              <Badge
                variant="outline"
                className="ml-auto border-dashed border-blue-500/30 bg-blue-500/15 text-blue-400 text-[10px] px-1"
              >
                observe
              </Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SyncTile({ envStatus }: { envStatus: EnvironmentStatus }) {
  const status = getSyncStatus(envStatus)
  const visual = SYNC_VISUALS[status]
  const envColor = ENV_COLORS[envStatus.env]
  const envAgents = agentsByEnv(envStatus.env)
  const onlineCount = onlineAgentsByEnv(envStatus.env).length
  const drifted = driftedAgents(envStatus.env, envStatus.deployed_version)

  return (
    <div
      className={`rounded-xl border-2 ${visual.border} ${visual.glow} bg-card p-6 flex flex-col gap-4 transition-all`}
    >
      {/* Top: env label + sync status hero */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${envColor.dot}`} />
          <span className="text-sm font-semibold capitalize text-foreground">
            {envStatus.env}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {status === "synced" ? (
            <CheckCircle2 className={`size-5 ${visual.iconColor}`} />
          ) : (
            <AlertTriangle className={`size-5 ${visual.iconColor}`} />
          )}
          <span className={`text-sm font-medium ${visual.labelColor}`}>
            {visual.label}
          </span>
        </div>
      </div>

      {/* Version display — hero element */}
      <div className="text-center py-2">
        {status === "synced" ? (
          <>
            <span className="text-4xl font-bold font-mono text-foreground">
              v{envStatus.deployed_version}
            </span>
            <p className="text-xs text-muted-foreground mt-1">running latest</p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <div className="text-center">
              <span className="text-2xl font-bold font-mono text-muted-foreground">
                v{envStatus.deployed_version}
              </span>
              <p className="text-[10px] text-muted-foreground">deployed</p>
            </div>
            <ArrowRight className="size-5 text-amber-400" />
            <div className="text-center">
              <span className="text-2xl font-bold font-mono text-amber-400">
                v{LATEST_VERSION}
              </span>
              <p className="text-[10px] text-amber-400/80">available</p>
            </div>
          </div>
        )}
      </div>

      {/* Agent info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Wifi className="size-3" />
          <span>
            <span className="font-mono text-foreground">{onlineCount}</span>
            {" / "}
            <span className="font-mono">{envAgents.length}</span> agents
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="size-3" />
          <span>{relativeTime(envStatus.deployed_at)}</span>
        </div>
      </div>

      {/* Drift alert */}
      {drifted.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300">
            {drifted.length} agent{drifted.length !== 1 ? "s" : ""} still on v
            {drifted[0]!.contract_version}
          </span>
        </div>
      )}

      {/* Composition stack */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Composition
        </p>
        <CompactComposition layers={envStatus.composition} />
      </div>

      {/* Action */}
      {status === "out_of_sync" && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
              <Check className="size-3.5" />
              Sync to v{LATEST_VERSION}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              {envAgents.length} agent{envAgents.length !== 1 ? "s" : ""} will
              receive update
            </p>
          </div>
        </>
      )}
    </div>
  )
}
