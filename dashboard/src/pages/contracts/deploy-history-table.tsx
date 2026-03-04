import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import type { DeploymentResponse } from "@/lib/api/bundles"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime } from "@/lib/format"

interface DeployHistoryTableProps {
  deployments: DeploymentResponse[]
  bundleNames: string[]
  envFilter: string
  bundleFilter: string
  onEnvFilterChange: (env: string) => void
  onBundleFilterChange: (bundle: string) => void
  loading: boolean
  error: string | null
  onRetry: () => void
}

export function DeployHistoryTable({
  deployments, bundleNames,
  envFilter, bundleFilter,
  onEnvFilterChange, onBundleFilterChange,
  loading, error, onRetry,
}: DeployHistoryTableProps) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" size="sm" className="ml-2" onClick={onRetry}>Retry</Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={envFilter} onValueChange={onEnvFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="development">Development</SelectItem>
          </SelectContent>
        </Select>

        <Select value={bundleFilter} onValueChange={onBundleFilterChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All bundles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bundles</SelectItem>
            {bundleNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No deployments match the filters.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Timestamp</TableHead>
              <TableHead>Bundle</TableHead>
              <TableHead className="w-32">Environment</TableHead>
              <TableHead className="w-40">Deployed By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deployments.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger className="text-sm text-muted-foreground">
                      {formatRelativeTime(d.created_at)}
                    </TooltipTrigger>
                    <TooltipContent>
                      {new Date(d.created_at).toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">{d.bundle_name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">v{d.bundle_version}</span>
                </TableCell>
                <TableCell><EnvBadge env={d.env} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.deployed_by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
