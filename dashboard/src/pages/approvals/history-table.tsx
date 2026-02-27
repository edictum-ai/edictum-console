import { useNavigate } from "react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Bot, Clock, MessageSquare } from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"
import { ChannelBadge, StatusBadge, EnvBadge } from "./badges"

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatResponseTime(createdAt: string, decidedAt: string | null): string {
  if (!decidedAt) return "-"
  const diff = new Date(decidedAt).getTime() - new Date(createdAt).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

interface HistoryTableProps {
  approvals: ApprovalResponse[]
  loading?: boolean
}

export function HistoryTable({ approvals, loading }: HistoryTableProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent / Tool</TableHead>
          <TableHead>Contract</TableHead>
          <TableHead>Arguments</TableHead>
          <TableHead>Env</TableHead>
          <TableHead>Decision</TableHead>
          <TableHead>By</TableHead>
          <TableHead>Via</TableHead>
          <TableHead>Response Time</TableHead>
          <TableHead className="text-right">When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {approvals.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => {
              const params = new URLSearchParams()
              params.set("agent_id", item.agent_id)
              params.set("tool_name", item.tool_name)
              params.set("ts", item.decided_at ?? item.created_at)
              void navigate(`/dashboard/events?${params.toString()}`)
            }}
          >
            <TableCell>
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{item.tool_name}</span>
                <div className="flex items-center gap-1">
                  <Bot className="size-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">{item.agent_id}</span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <code className="text-xs font-mono text-muted-foreground">{item.contract_name ?? "\u2014"}</code>
            </TableCell>
            <TableCell className="max-w-xs">
              <code className="text-xs font-mono text-muted-foreground truncate block">
                {item.tool_args
                  ? Object.entries(item.tool_args)
                      .slice(0, 2)
                      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                      .join(", ")
                  : "(no arguments)"}
              </code>
              {item.decision_reason && (
                <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                  <MessageSquare className="size-2.5" />
                  {item.decision_reason}
                </div>
              )}
            </TableCell>
            <TableCell>
              <EnvBadge env={item.env} />
            </TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">{item.decided_by ?? "system"}</span>
            </TableCell>
            <TableCell>
              <ChannelBadge channel={item.decided_via} />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Clock className="size-3 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">
                  {formatResponseTime(item.created_at, item.decided_at)}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-xs text-muted-foreground">
                {item.decided_at ? formatRelativeTime(item.decided_at) : formatRelativeTime(item.created_at)}
              </span>
            </TableCell>
          </TableRow>
        ))}

        {approvals.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No history yet</p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
