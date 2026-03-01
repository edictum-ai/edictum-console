import { Send, Hash, Webhook, Mail, MoreHorizontal, Pencil, Trash2, Power, PowerOff } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format"
import type { NotificationChannelInfo, ChannelFilters } from "@/lib/api"
import { TestButton } from "./test-button"

const TYPE_META: Record<string, { icon: typeof Send; label: string }> = {
  telegram: { icon: Send, label: "Telegram" },
  slack: { icon: Hash, label: "Slack" },
  webhook: { icon: Webhook, label: "Webhook" },
  email: { icon: Mail, label: "Email" },
}

interface ChannelTableProps {
  channels: NotificationChannelInfo[]
  onEdit: (channel: NotificationChannelInfo) => void
  onDelete: (channel: NotificationChannelInfo) => void
  onToggleEnabled: (channel: NotificationChannelInfo) => void
}

function filterSummary(f: ChannelFilters | null): string | null {
  if (!f) return null
  const parts: string[] = []
  if (f.environments?.length) parts.push(f.environments.join(", "))
  if (f.agent_patterns?.length) parts.push(`agents: ${f.agent_patterns.join(", ")}`)
  if (f.contract_names?.length) parts.push(`contracts: ${f.contract_names.join(", ")}`)
  return parts.length > 0 ? parts.join(" · ") : null
}

export function ChannelTable({ channels, onEdit, onDelete, onToggleEnabled }: ChannelTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Tested</TableHead>
          <TableHead className="w-[140px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {channels.map((ch) => {
          const meta = TYPE_META[ch.channel_type] ?? TYPE_META.webhook
          const Icon = meta.icon
          const summary = filterSummary(ch.filters)
          return (
            <TableRow key={ch.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {ch.name}
                  {summary && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-600/30 dark:border-blue-400/30">
                          filtered
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">{summary}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {meta.label}
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      ch.enabled
                        ? "bg-emerald-600 dark:bg-emerald-500"
                        : "bg-zinc-400 dark:bg-zinc-600"
                    }`}
                  />
                  {ch.enabled ? "Active" : "Disabled"}
                </span>
              </TableCell>
              <TableCell>
                {ch.last_test_ok === false ? (
                  <span className="text-red-600 dark:text-red-400">Failed</span>
                ) : ch.last_test_at ? (
                  <span className="text-muted-foreground">
                    {formatRelativeTime(ch.last_test_at)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Never</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <TestButton channelId={ch.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="size-8 p-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(ch)}>
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggleEnabled(ch)}>
                        {ch.enabled ? (
                          <><PowerOff className="mr-2 size-4" />Disable</>
                        ) : (
                          <><Power className="mr-2 size-4" />Enable</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(ch)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
