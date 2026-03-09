import { useNavigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Activity, Clock, ShieldAlert } from "lucide-react"
import { type AgentSummary } from "@/lib/derive-agents"
import { ENV_COLORS } from "@/lib/env-colors"
import { verdictColor, normalizeVerdict } from "@/lib/verdict-helpers"
import { formatRelativeTime } from "@/lib/format"
import { STATUS_CONFIG, StatusDot, MiniSparkline } from "./agent-card-parts"

interface AgentCardProps {
  agent: AgentSummary
  coveragePct?: number
}

export function AgentCard({ agent, coveragePct }: AgentCardProps) {
  const navigate = useNavigate()
  const statusCfg = STATUS_CONFIG[agent.status]
  const StatusIcon = statusCfg.icon
  const isOffline = agent.status === "offline"

  const borderClass = agent.status === "degraded"
    ? "border-amber-500/30"
    : isOffline
      ? "border-border/50 opacity-75"
      : "border-border"

  const sparklineSummary = agent.totalDenials > 0
    ? `${agent.totalEvents} events, ${agent.totalDenials} denied`
    : `${agent.totalEvents} events`

  return (
    <Card
      className={`relative gap-0 overflow-hidden py-0 transition-all hover:shadow-md cursor-pointer ${borderClass}`}
      onClick={() => void navigate(`/dashboard/agents/${encodeURIComponent(agent.name)}`)}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot status={agent.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
              {agent.env !== "unknown" && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 ${ENV_COLORS[agent.env] ?? "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"}`}
                >
                  {agent.env}
                </Badge>
              )}
              {agent.bundleVersion && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 font-mono bg-violet-500/15 text-violet-600 dark:text-violet-400"
                    >
                      {agent.bundleVersion.slice(0, 8)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{agent.bundleVersion}</TooltipContent>
                </Tooltip>
              )}
              {agent.mode === "observe" && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                >
                  observe
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {agent.lastActivity}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
                <StatusIcon className={`h-3.5 w-3.5 ${
                  agent.status === "healthy" ? "text-emerald-600 dark:text-emerald-400"
                    : agent.status === "degraded" ? "text-amber-600 dark:text-amber-400"
                      : "text-zinc-600 dark:text-zinc-400"
                }`} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{statusCfg.label}</TooltipContent>
          </Tooltip>
          {coveragePct !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {coveragePct}% covered
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Events (recent)
          </span>
          <span className="text-[10px] text-muted-foreground">
            {sparklineSummary}
          </span>
        </div>
        <MiniSparkline data={agent.eventCounts} status={agent.status} agentName={agent.name} />
      </div>

      <RecentCallsSection agent={agent} />
    </Card>
  )
}

function RecentCallsSection({ agent }: { agent: AgentSummary }) {
  if (agent.recentTools.length === 0) return null

  const hasDenials = agent.totalDenials > 0
  const allSameVerdict = agent.recentTools.every(
    (c) => normalizeVerdict(c.verdict) === normalizeVerdict(agent.recentTools[0]!.verdict),
  )

  // If all calls have the same verdict and no denials, show condensed summary
  if (allSameVerdict && !hasDenials && agent.totalEvents > 3) {
    const normalized = normalizeVerdict(agent.recentTools[0]!.verdict)
    return (
      <div className="border-t border-border/50 px-4 py-2.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent Calls
        </p>
        <p className="text-[11px] text-muted-foreground">
          {agent.totalEvents} tools, all{" "}
          <span className={normalized === "allowed" ? "text-emerald-600 dark:text-emerald-400" : ""}>
            {normalized}
          </span>
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-border/50 px-4 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent Calls
        </p>
        {hasDenials && (
          <span className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
            <ShieldAlert className="h-3 w-3" />
            {agent.totalDenials} denied
          </span>
        )}
      </div>
      <div className="space-y-1">
        {agent.recentTools.slice(0, 3).map((call, i) => (
          <div key={`${call.tool}-${call.verdict}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            <code className="font-mono font-medium text-foreground truncate max-w-[120px]">{call.tool}</code>
            <Badge
              variant="outline"
              className={`text-[10px] font-medium ${verdictColor(call.verdict)}`}
            >
              {normalizeVerdict(call.verdict)}
            </Badge>
            <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(call.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
