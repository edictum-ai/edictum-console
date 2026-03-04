import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { GripVertical, ChevronUp, ChevronDown, Trash2 } from "lucide-react"
import type { CompositionItemDetail } from "@/lib/api/compositions"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import { cn } from "@/lib/utils"

interface CompositionItemRowProps {
  item: CompositionItemDetail
  onModeChange: (mode: string | null) => void
  onEnabledChange: (enabled: boolean) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export function CompositionItemRow({
  item,
  onModeChange,
  onEnabledChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  onDragStart,
  onDragOver,
  onDrop,
}: CompositionItemRowProps) {
  const typeColor =
    CONTRACT_TYPE_COLORS[item.contract_type] ??
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30"

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border px-2 py-1.5 transition-opacity",
        !item.enabled && "opacity-50",
      )}
    >
      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />

      <Badge variant="outline" className={`${typeColor} shrink-0 text-[10px]`}>
        {item.contract_type}
      </Badge>

      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-foreground">
          {item.contract_name}
        </span>
        <span className="ml-1.5 text-xs text-muted-foreground">
          v{item.contract_version}
        </span>
        {item.has_newer_version && (
          <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
            update available
          </span>
        )}
      </div>

      <Select
        value={item.mode_override ?? "__default__"}
        onValueChange={(v) => onModeChange(v === "__default__" ? null : v)}
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__default__">(default)</SelectItem>
          <SelectItem value="enforce">enforce</SelectItem>
          <SelectItem value="observe">observe</SelectItem>
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Switch
              checked={item.enabled}
              onCheckedChange={onEnabledChange}
              aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.contract_name}`}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{item.enabled ? "Enabled" : "Disabled"}</TooltipContent>
      </Tooltip>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label="Move up"
            >
              <ChevronUp />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move up</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label="Move down"
            >
              <ChevronDown />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move down</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label={`Remove ${item.contract_name}`}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
