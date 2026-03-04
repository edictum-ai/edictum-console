import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Loader2 } from "lucide-react"
import type { AgentRegistration } from "@/lib/api/agents"
import { formatRelativeTime } from "@/lib/format"

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  explicit: { label: "Explicit", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  rule: { label: "Rule", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  agent_provided: { label: "Agent", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30" },
  none: { label: "None", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30" },
}

interface AgentRegistrationRowProps {
  agent: AgentRegistration
  selected: boolean
  onToggleSelect: () => void
  bundleNames: string[]
  updating: boolean
  onAssignBundle: (bundleName: string | null) => void
}

export function AgentRegistrationRow({
  agent,
  selected,
  onToggleSelect,
  bundleNames,
  updating,
  onAssignBundle,
}: AgentRegistrationRowProps) {
  const sourceInfo = SOURCE_LABELS[resolveSource(agent)] ?? SOURCE_LABELS.none!

  return (
    <TableRow>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      </TableCell>
      <TableCell className="font-mono text-sm">{agent.agent_id}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {agent.display_name ?? "-"}
      </TableCell>
      <TableCell>
        <TagBadges tags={agent.tags} />
      </TableCell>
      <TableCell>
        {updating ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Select
            value={agent.bundle_name ?? "none"}
            onValueChange={(v) => onAssignBundle(v)}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Not assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Not assigned</span>
              </SelectItem>
              {bundleNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>
      <TableCell>
        {agent.resolved_bundle ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{agent.resolved_bundle}</span>
            <Badge variant="outline" className={`text-[10px] ${sourceInfo.color}`}>
              {sourceInfo.label}
            </Badge>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger className="text-sm text-muted-foreground">
            {agent.last_seen_at ? formatRelativeTime(agent.last_seen_at) : "never"}
          </TooltipTrigger>
          <TooltipContent>
            {agent.last_seen_at
              ? new Date(agent.last_seen_at).toLocaleString()
              : "Never connected"}
          </TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

function resolveSource(agent: AgentRegistration): string {
  if (agent.bundle_name) return "explicit"
  if (agent.resolved_bundle) return "rule"
  return "none"
}

function TagBadges({ tags }: { tags: Record<string, string> }) {
  const entries = Object.entries(tags)
  if (entries.length === 0) return <span className="text-sm text-muted-foreground">-</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 3).map(([k, v]) => (
        <Badge key={k} variant="outline" className="text-[10px]">
          {k}={v}
        </Badge>
      ))}
      {entries.length > 3 && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          +{entries.length - 3}
        </Badge>
      )}
    </div>
  )
}
