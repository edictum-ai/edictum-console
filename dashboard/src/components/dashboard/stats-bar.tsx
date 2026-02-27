import { Separator } from "@/components/ui/separator"
import {
  ShieldAlert,
  Bot,
  Activity,
  ShieldX,
  BarChart3,
  Eye,
  FileText,
} from "lucide-react"
import type { StatsOverview } from "@/lib/api"

interface StatItemProps {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
  highlight?: boolean
}

function StatItem({ icon, label, value, subtext, highlight }: StatItemProps) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground"
          }`}
        >
          {value}
        </span>
        {subtext && (
          <span className="text-xs text-muted-foreground">({subtext})</span>
        )}
      </div>
    </div>
  )
}

interface StatsBarProps {
  stats: StatsOverview | null
  loading: boolean
}

export function StatsBar({ stats, loading }: StatsBarProps) {
  if (loading || !stats) {
    return (
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center gap-6 text-sm">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  const approvalRate =
    stats.events_24h > 0
      ? (((stats.events_24h - stats.denials_24h) / stats.events_24h) * 100).toFixed(1)
      : "100"

  return (
    <div className="shrink-0 border-b border-border bg-card/50 px-6 py-3">
      <div className="flex items-center gap-6 text-sm">
        <StatItem
          icon={<ShieldAlert className="size-4 text-amber-500" />}
          label="Pending"
          value={stats.pending_approvals}
          highlight={stats.pending_approvals > 0}
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<Bot className="size-4 text-emerald-500" />}
          label="Agents"
          value={`${stats.active_agents}/${stats.total_agents}`}
          subtext={
            stats.total_agents - stats.active_agents > 0
              ? `${stats.total_agents - stats.active_agents} offline`
              : undefined
          }
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<Activity className="size-4 text-blue-500" />}
          label="Events (24h)"
          value={stats.events_24h.toLocaleString()}
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<ShieldX className="size-4 text-red-500" />}
          label="Denials (24h)"
          value={stats.denials_24h}
          subtext={
            stats.denials_24h > 0
              ? `${(100 - Number(approvalRate)).toFixed(1)}% rate`
              : undefined
          }
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<BarChart3 className="size-4 text-muted-foreground" />}
          label="Approval Rate"
          value={`${approvalRate}%`}
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<Eye className="size-4 text-amber-500" />}
          label="Observe Findings"
          value={stats.observe_findings_24h ?? 0}
          highlight={(stats.observe_findings_24h ?? 0) > 0}
        />
        <Separator orientation="vertical" className="h-5" />
        <StatItem
          icon={<FileText className="size-4 text-violet-500" />}
          label="Contracts Triggered"
          value={stats.contracts_triggered_24h ?? 0}
        />
      </div>
    </div>
  )
}
