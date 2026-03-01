import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime } from "@/lib/format"
import type { ApiKeyInfo } from "@/lib/api"

interface KeyTableProps {
  keys: ApiKeyInfo[]
  onRevoke: (key: ApiKeyInfo) => void
}

export function KeyTable({ keys, onRevoke }: KeyTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Key Prefix</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-medium">
                {key.label ? (
                  key.label
                ) : (
                  <span className="text-muted-foreground italic">Unnamed</span>
                )}
              </TableCell>
              <TableCell>
                <code className="font-mono text-xs">{key.prefix}</code>
              </TableCell>
              <TableCell>
                <EnvBadge env={key.env} />
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatRelativeTime(key.created_at)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onRevoke(key)}
                    >
                      Revoke
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
