import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Pencil, Copy, Trash2, Clock } from "lucide-react"
import type { LibraryContractSummary } from "@/lib/api/contracts"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import { formatRelativeTime } from "@/lib/format"

interface ContractCardProps {
  contract: LibraryContractSummary
  onEdit: (contractId: string) => void
  onDelete: (contractId: string) => void
  onDuplicate: (contractId: string) => void
  onClick: (contractId: string) => void
}

export function ContractCard({
  contract,
  onEdit,
  onDelete,
  onDuplicate,
  onClick,
}: ContractCardProps) {
  const typeColor =
    CONTRACT_TYPE_COLORS[contract.type] ??
    "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30"

  return (
    <Card
      className="group cursor-pointer py-4 transition-colors hover:border-muted-foreground/30"
      onClick={() => onClick(contract.contract_id)}
    >
      <CardHeader className="gap-1 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">
              {contract.name}
            </CardTitle>
            <p className="truncate text-xs text-muted-foreground">
              {contract.contract_id}
            </p>
          </div>
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onEdit(contract.contract_id)}
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDuplicate(contract.contract_id)}
                >
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(contract.contract_id)}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={typeColor}>{contract.type}</Badge>
          <Badge variant="outline">v{contract.version}</Badge>
          {contract.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </div>
        {contract.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {contract.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>{formatRelativeTime(contract.created_at)}</span>
          {contract.usage_count > 0 && (
            <>
              <span className="mx-1">·</span>
              <span>
                {contract.usage_count} bundle{contract.usage_count !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
