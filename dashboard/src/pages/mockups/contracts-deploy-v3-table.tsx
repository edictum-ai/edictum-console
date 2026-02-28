import {
  type EnvironmentStatus,
  MOCK_ENV_STATUS,
  ENV_COLORS,
  LATEST_VERSION,
  relativeTime,
} from "./contracts-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Eye,
} from "lucide-react"

// -- Table cell components --------------------------------------------------

function StatusCell({ envStatus }: { envStatus: EnvironmentStatus }) {
  const isCurrent = envStatus.deployed_version === LATEST_VERSION
  if (isCurrent) {
    return (
      <span className="flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        <span className="text-xs font-medium">Current</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-amber-400">
      <AlertTriangle className="size-3.5" />
      <span className="text-xs font-medium">Behind</span>
    </span>
  )
}

function AgentsCell({ envStatus }: { envStatus: EnvironmentStatus }) {
  const drifted = Object.entries(envStatus.agents_on_version)
    .filter(([v]) => Number(v) !== envStatus.deployed_version)
    .reduce((sum, [, count]) => sum + count, 0)

  return (
    <span className="text-xs">
      <span className="text-foreground">
        {envStatus.agents_online}/{envStatus.agents_total}
      </span>
      <span className="text-muted-foreground"> online</span>
      {drifted > 0 && (
        <span className="ml-1.5 text-amber-400 font-medium">
          ({drifted} drift)
        </span>
      )}
    </span>
  )
}

function CompositionCell({ envStatus }: { envStatus: EnvironmentStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {envStatus.composition.map((layer, idx) => {
        const isObserve = layer.mode === "observe_alongside"
        return (
          <span key={layer.bundle_name} className="flex items-center gap-1">
            {idx > 0 && (
              <span className="text-muted-foreground/40 mr-0.5">,</span>
            )}
            {isObserve ? (
              <Eye className="size-2.5 text-blue-400 shrink-0" />
            ) : (
              <Shield className="size-2.5 text-amber-400 shrink-0" />
            )}
            <span className="text-xs font-mono text-foreground truncate max-w-[140px]">
              {layer.bundle_name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              v{layer.version}
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 leading-tight ${
                isObserve
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/25"
              }`}
            >
              {isObserve ? "observe" : "enforce"}
            </Badge>
          </span>
        )
      })}
    </div>
  )
}

// -- Environment Table (hero of the compact dashboard) ---------------------

export function EnvironmentTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs w-[120px]">Environment</TableHead>
          <TableHead className="text-xs w-[70px]">Version</TableHead>
          <TableHead className="text-xs w-[90px]">Status</TableHead>
          <TableHead className="text-xs w-[140px]">Agents</TableHead>
          <TableHead className="text-xs">Composition</TableHead>
          <TableHead className="text-xs w-[80px]">Deployed</TableHead>
          <TableHead className="text-xs w-[100px] text-right">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {MOCK_ENV_STATUS.map((envStatus) => {
          const colors = ENV_COLORS[envStatus.env]
          const isCurrent = envStatus.deployed_version === LATEST_VERSION
          const envLabel =
            envStatus.env.charAt(0).toUpperCase() + envStatus.env.slice(1)

          return (
            <TableRow key={envStatus.env}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full shrink-0 ${colors.dot}`}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {envLabel}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`font-mono text-[11px] ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  v{envStatus.deployed_version}
                </Badge>
              </TableCell>
              <TableCell>
                <StatusCell envStatus={envStatus} />
              </TableCell>
              <TableCell>
                <AgentsCell envStatus={envStatus} />
              </TableCell>
              <TableCell>
                <CompositionCell envStatus={envStatus} />
              </TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground font-mono cursor-default">
                        {relativeTime(envStatus.deployed_at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>
                        {new Date(envStatus.deployed_at).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">
                        by {envStatus.deployed_by}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-right">
                {!isCurrent ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Rocket className="size-3 mr-1" />
                    Deploy v{LATEST_VERSION}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground/50">--</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
