import { Badge } from "@/components/ui/badge"
import { Clock, Hash, MessageCircle, Monitor, ShieldCheck, ShieldX, Timer } from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"

// Re-export EnvBadge from shared module for backwards compatibility
export { EnvBadge } from "@/lib/env-colors"

export function StatusBadge({ status }: { status: ApprovalResponse["status"] }) {
  const config = {
    pending: {
      label: "Pending",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
      icon: <Timer className="size-3" />,
    },
    approved: {
      label: "Approved",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
      icon: <ShieldCheck className="size-3" />,
    },
    denied: {
      label: "Denied",
      className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
      icon: <ShieldX className="size-3" />,
    },
    timeout: {
      label: "Timed Out",
      className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25",
      icon: <Timer className="size-3" />,
    },
  }

  const c = config[status]
  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

const CHANNEL_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  console: {
    icon: <Monitor className="size-3" />,
    label: "Console",
    className: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  },
  telegram: {
    icon: <MessageCircle className="size-3" />,
    label: "Telegram",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  slack: {
    icon: <Hash className="size-3" />,
    label: "Slack",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  system: {
    icon: <Clock className="size-3" />,
    label: "System",
    className: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  },
}

export function ChannelBadge({ channel }: { channel: string | null | undefined }) {
  if (!channel) return null

  const config = CHANNEL_CONFIG[channel]
  if (config) {
    return (
      <Badge variant="outline" className={`${config.className} text-[10px]`}>
        {config.icon}
        {config.label}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20 text-[10px]">
      {channel}
    </Badge>
  )
}
