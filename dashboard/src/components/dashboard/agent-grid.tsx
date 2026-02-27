import { useNavigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Activity,
  Clock,
  Signal,
  AlertTriangle,
  WifiOff,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import type { EventResponse } from "@/lib/api"
import { deriveAgents, type AgentStatus, type AgentSummary } from "@/lib/derive-agents"

const STATUS_CONFIG: Record<AgentStatus, { label: string; dotClass: string; icon: typeof Signal }> = {
  healthy: { label: "Healthy", dotClass: "bg-emerald-500", icon: Signal },
  degraded: { label: "Degraded", dotClass: "bg-amber-500", icon: AlertTriangle },
  offline: { label: "Offline", dotClass: "bg-zinc-500", icon: WifiOff },
}

const ENV_COLORS: Record<string, string> = {
  production: "bg-red-500/15 text-red-400",
  staging: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  development: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
}

function StatusDot({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === "healthy" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dotClass} opacity-40`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dotClass}`} />
    </span>
  )
}

function MiniSparkline({ data, status, agentName }: { data: number[]; status: AgentStatus; agentName: string }) {
  const color = status === "healthy" ? "#10b981" : status === "degraded" ? "#f59e0b" : "#71717a"
  const chartData = data.map((v, i) => ({ i, v }))
  const gradientId = `spark-${agentName}-${status}`
  return (
    <ResponsiveContainer width="100%" height={28}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function AgentCard({ agent }: { agent: AgentSummary }) {
  const navigate = useNavigate()
  const statusCfg = STATUS_CONFIG[agent.status]
  const StatusIcon = statusCfg.icon
  const isOffline = agent.status === "offline"

  const borderClass = agent.status === "degraded"
    ? "border-amber-500/30"
    : isOffline
      ? "border-border/50 opacity-75"
      : "border-border"

  return (
    <Card
      className={`relative gap-0 overflow-hidden py-0 transition-all hover:shadow-md cursor-pointer ${borderClass}`}
      onClick={() => void navigate(`/dashboard/events?agent_id=${agent.name}`)}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot status={agent.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 ${ENV_COLORS[agent.env] ?? "bg-zinc-500/15 text-zinc-400"}`}
              >
                {agent.env}
              </Badge>
              {agent.bundleVersion && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 font-mono bg-violet-500/15 text-violet-400"
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
                  className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400"
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
              <StatusIcon className={`h-3.5 w-3.5 ${
                agent.status === "healthy" ? "text-emerald-500"
                  : agent.status === "degraded" ? "text-amber-500"
                    : "text-zinc-500"
              }`} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{statusCfg.label}</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-4 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Events (recent)
          </span>
          <span className="text-[10px] text-muted-foreground">
            {agent.totalEvents} total
          </span>
        </div>
        <MiniSparkline data={agent.eventCounts} status={agent.status} agentName={agent.name} />
      </div>

      {agent.recentTools.length > 0 && (
        <div className="border-t border-border/50 px-4 py-2.5">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent Calls
          </p>
          <div className="space-y-1">
            {agent.recentTools.slice(0, 3).map((call, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <code className="font-mono font-medium text-foreground">{call.tool}</code>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  call.verdict === "allowed" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : call.verdict === "denied" ? "bg-red-500/15 text-red-500 dark:text-red-400"
                      : "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400"
                }`}>
                  {call.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

interface AgentGridProps {
  events: EventResponse[]
}

export function AgentGrid({ events }: AgentGridProps) {
  const agents = deriveAgents(events)

  if (agents.length === 0) {
    return (
      <div className="overflow-auto px-6 py-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Agent Fleet
        </h2>
        <p className="text-sm text-muted-foreground">
          No agents have connected yet. Create an API key and connect your first agent.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Agent Fleet
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </div>
  )
}
