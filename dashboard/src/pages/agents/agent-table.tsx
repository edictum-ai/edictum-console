/**
 * Agent coverage table — TanStack Table with expandable rows.
 * Default sort: coverage_pct ascending (worst first).
 */

import { Fragment, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronRight, ChevronDown } from "lucide-react"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime, truncate } from "@/lib/format"
import { COVERAGE_STYLES, DRIFT_STYLES } from "@/lib/coverage-colors"
import { CoverageBar } from "./coverage-bar"
import type { AgentCoverageSummaryEntry, UngovernedToolEntry } from "@/lib/api"
import type { PresetKey } from "@/lib/histogram"

interface AgentTableProps {
  agents: AgentCoverageSummaryEntry[]
  since: PresetKey
  loading: boolean
  ungoverned: UngovernedToolEntry[]
}

export function AgentTable({ agents, since, loading, ungoverned }: AgentTableProps) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([{ id: "coverage_pct", desc: false }])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const columns = useMemo<ColumnDef<AgentCoverageSummaryEntry>[]>(() => [
    {
      accessorKey: "agent_id", header: "Agent", enableSorting: true,
      cell: ({ getValue }) => (
        <Button variant="link" className="h-auto p-0 text-sm font-medium" onClick={(e) => {
          e.stopPropagation()
          navigate(`/dashboard/agents/${encodeURIComponent(getValue<string>())}?since=${since}`)
        }}>
          {truncate(getValue<string>(), 28)}
        </Button>
      ),
    },
    {
      accessorKey: "environment", header: "Env", size: 90, enableSorting: true,
      cell: ({ getValue }) => <EnvBadge env={getValue<string>()} />,
    },
    {
      accessorKey: "coverage_pct", header: "Coverage", size: 160, enableSorting: true,
      cell: ({ row }) => (
        <CoverageBar enforced={row.original.enforced} observed={row.original.observed} ungoverned={row.original.ungoverned} compact />
      ),
    },
    {
      accessorKey: "drift_status", header: "Drift", size: 80, enableSorting: true,
      cell: ({ getValue }) => {
        const s = getValue<string>()
        const style = DRIFT_STYLES[s] ?? DRIFT_STYLES.unknown!
        return <Badge variant="outline" className={`text-[10px] ${style!.className}`}>{style!.label}</Badge>
      },
    },
    {
      accessorKey: "last_seen", header: "Last Seen", size: 90, enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue<string | undefined>()
        return <span className="text-xs text-muted-foreground">{v ? formatRelativeTime(v) : "never"}</span>
      },
    },
    {
      accessorKey: "event_count_24h", size: 70, enableSorting: true,
      header: () => <span className="text-right w-full block">Events 24h</span>,
      cell: ({ getValue }) => <span className="text-xs tabular-nums text-right block">{getValue<number | undefined>() ?? 0}</span>,
    },
    {
      id: "expand", header: "", size: 30, enableSorting: false,
      cell: () => null, // Rendered manually in row body for stable column memoization
    },
  ], [navigate, since])

  const table = useReactTable({
    data: agents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.agent_id,
  })

  if (loading && agents.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                  onClick={header.column.getToggleSortingHandler()}
                  style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const agentUngoverned = ungoverned.filter((t) => t.agent_ids.includes(row.original.agent_id))
            return (
              <Fragment key={row.id}>
                <TableRow className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {cell.column.id === "expand" ? (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                          e.stopPropagation()
                          setExpandedId(expandedId === row.original.agent_id ? null : row.original.agent_id)
                        }}>
                          {expandedId === row.original.agent_id
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedId === row.original.agent_id && (
                  <TableRow key={`${row.id}-expand`}>
                    <TableCell colSpan={columns.length} className="bg-muted/30 p-4">
                      {agentUngoverned.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Ungoverned tools ({agentUngoverned.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {agentUngoverned.map((t) => (
                              <Badge key={t.tool_name} variant="outline" className={`font-mono text-[10px] ${COVERAGE_STYLES.ungoverned}`}>{t.tool_name}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">All tools are governed.</p>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-sm text-muted-foreground py-8">
                No agents found in the selected time window.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
