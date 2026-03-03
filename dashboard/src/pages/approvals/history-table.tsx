import { useNavigate } from "react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Bot, Clock, Loader2, MessageSquare, Shield } from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"
import { ChannelBadge, StatusBadge } from "./badges"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime, formatResponseTime } from "@/lib/format"

interface HistoryTableProps {
  approvals: ApprovalResponse[]
  loading?: boolean
}

export function HistoryTable({ approvals, loading }: HistoryTableProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
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
                <div className="flex items-center gap-1 mt-1 text-xs text-red-600 dark:text-red-400">
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
              <div className="flex flex-col items-center gap-2">
                <Shield className="h-10 w-10 text-muted-foreground" />
                <p className="text-lg font-semibold">No approval history</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Past approval decisions will appear here. This includes approved, denied, and timed-out requests.
                </p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </div>
  )
}
