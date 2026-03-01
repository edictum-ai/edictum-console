import { Fragment, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"
import { argsPreview } from "@/lib/payload-helpers"
import { TimerBar, getTimerState } from "./timer"
import { EnvBadge } from "@/lib/env-colors"
import { ExpandedDetail } from "./expanded-detail"

interface ApprovalsTableProps {
  approvals: ApprovalResponse[]
  onApprove: (id: string) => void
  onDeny: (id: string, reason: string) => void
  onBulkApprove: (ids: string[]) => void
  onBulkDeny: (ids: string[], reason: string) => void
  acting?: boolean
}

export function ApprovalsTable({
  approvals,
  onApprove,
  onDeny,
  onBulkApprove,
  onBulkDeny,
  acting,
}: ApprovalsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkDenyOpen, setBulkDenyOpen] = useState(false)
  const [bulkDenyReason, setBulkDenyReason] = useState("")

  const allSelected = approvals.length > 0 && selected.size === approvals.length
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(approvals.map((a) => a.id)))
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function handleBulkApprove() {
    onBulkApprove(Array.from(selected))
    setSelected(new Set())
  }

  function handleBulkDeny() {
    if (!bulkDenyReason.trim()) return
    onBulkDeny(Array.from(selected), bulkDenyReason)
    setSelected(new Set())
    setBulkDenyOpen(false)
    setBulkDenyReason("")
  }

  return (
    <div className="space-y-3">
      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleBulkApprove}
              disabled={acting}
            >
              <CheckCircle2 className="size-3.5" />
              Approve Selected
            </Button>
            {!bulkDenyOpen ? (
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => setBulkDenyOpen(true)}
                disabled={acting}
              >
                <XCircle className="size-3.5" />
                Deny Selected
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  value={bulkDenyReason}
                  onChange={(e) => setBulkDenyReason(e.target.value)}
                  placeholder="Shared reason..."
                  className="h-7 w-40 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBulkDeny()
                    if (e.key === "Escape") {
                      setBulkDenyOpen(false)
                      setBulkDenyReason("")
                    }
                  }}
                />
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={!bulkDenyReason.trim()}
                  onClick={handleBulkDeny}
                >
                  Deny ({selected.size})
                </Button>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all approvals"
              />
            </TableHead>
            <TableHead className="w-8 px-0" />
            <TableHead>Agent / Tool</TableHead>
            <TableHead>Arguments</TableHead>
            <TableHead>Contract</TableHead>
            <TableHead>Env</TableHead>
            <TableHead className="w-40">Timer</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => {
            const isExpanded = expandedId === approval.id
            const { zone } = getTimerState(approval.created_at, approval.timeout_seconds)
            const rowTint = zone === "red" ? "bg-red-500/[0.03]" : ""

            return (
              <Fragment key={approval.id}>
                <TableRow
                  data-state={selected.has(approval.id) ? "selected" : undefined}
                  className={`${rowTint} cursor-pointer`}
                  onClick={() => setExpandedId(isExpanded ? null : approval.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(approval.id)}
                      onCheckedChange={() => toggleOne(approval.id)}
                      aria-label={`Select approval for ${approval.tool_name}`}
                    />
                  </TableCell>
                  <TableCell className="px-0">
                    {isExpanded
                      ? <ChevronDown className="size-3.5 text-muted-foreground" />
                      : <ChevronRight className="size-3.5 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{approval.tool_name}</span>
                      <div className="flex items-center gap-1">
                        <Bot className="size-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">{approval.agent_id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <code className="text-xs font-mono text-muted-foreground truncate block max-w-xs">
                      {argsPreview(approval.tool_args)}
                    </code>
                  </TableCell>
                  <TableCell>
                    {approval.contract_name ? (
                      <code className="text-xs font-mono">{approval.contract_name}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EnvBadge env={approval.env} />
                  </TableCell>
                  <TableCell>
                    <TimerBar createdAt={approval.created_at} timeoutSeconds={approval.timeout_seconds} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button
                        size="xs"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => onApprove(approval.id)}
                        disabled={acting || zone === "expired"}
                      >
                        <CheckCircle2 className="size-3" />
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => setExpandedId(approval.id)}
                        disabled={acting || zone === "expired"}
                      >
                        <XCircle className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <ExpandedDetail
                        approval={approval}
                        onApprove={onApprove}
                        onDeny={onDeny}
                        acting={acting}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}

          {approvals.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No pending approvals</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
