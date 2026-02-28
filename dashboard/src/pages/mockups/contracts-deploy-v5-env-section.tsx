import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  ArrowUpCircle,
  Circle,
  Eye,
  Shield,
} from "lucide-react"
import {
  type CompositionLayer,
  type EnvironmentStatus,
  ENV_COLORS,
  LATEST_VERSION,
  relativeTime,
} from "./contracts-data"
import { envLabel, hasDrift } from "./contracts-deploy-v5-parts"

// ---------------------------------------------------------------------------
// Inline Composition Row
// ---------------------------------------------------------------------------

function InlineComposition({ layers }: { layers: CompositionLayer[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {layers.map((layer) => {
        const isObserve = layer.mode === "observe_alongside"
        return (
          <div
            key={`${layer.bundle_name}-${layer.version}`}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 ${
              isObserve
                ? "border-dashed border-blue-500/30 bg-blue-500/5"
                : "border-amber-500/20 bg-amber-500/5"
            }`}
          >
            {isObserve ? (
              <Eye className="size-2.5 text-blue-400" />
            ) : (
              <Shield className="size-2.5 text-amber-400" />
            )}
            <span className="font-mono text-[11px] text-foreground">
              {layer.bundle_name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              v{layer.version}
            </span>
            <Badge
              variant="outline"
              className={`h-4 px-1 text-[9px] ${
                isObserve
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/25"
              }`}
            >
              {isObserve ? "observe" : "enforce"}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Environment Section (left panel)
// ---------------------------------------------------------------------------

export function EnvironmentSection({
  envStatus,
  isSelected,
  onSelect,
}: {
  envStatus: EnvironmentStatus
  isSelected: boolean
  onSelect: () => void
}) {
  const colors = ENV_COLORS[envStatus.env]
  const drift = hasDrift(envStatus)
  const isCurrent = envStatus.deployed_version === LATEST_VERSION

  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 ${
        isSelected
          ? "border-l-2 border-l-primary bg-primary/5"
          : "border-l-2 border-l-transparent hover:bg-accent/30"
      }`}
    >
      {/* Row 1: Name + version + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${colors.dot}`} />
          <span className="text-sm font-semibold text-foreground">
            {envLabel(envStatus.env)}
          </span>
          <Badge
            variant="outline"
            className={`${colors.bg} ${colors.text} ${colors.border} text-[10px]`}
          >
            v{envStatus.deployed_version}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {relativeTime(envStatus.deployed_at)}
          </span>
        </div>
        {!isCurrent && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 border-amber-500/30 px-2 text-[10px] text-amber-400 hover:bg-amber-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowUpCircle className="size-3" />
            Deploy v{LATEST_VERSION}
          </Button>
        )}
      </div>

      {/* Row 2: Composition stack (compact inline) */}
      <div className="mt-2.5">
        <InlineComposition layers={envStatus.composition} />
      </div>

      {/* Row 3: Agent summary + drift warning */}
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle className="size-1.5 fill-emerald-400 text-emerald-400" />
          <span className="text-xs text-foreground">
            {envStatus.agents_online} online
          </span>
          <span className="text-xs text-muted-foreground">
            / {envStatus.agents_total} total
          </span>
        </div>
        {drift && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="size-3" />
            drift
          </span>
        )}
      </div>
    </button>
  )
}
