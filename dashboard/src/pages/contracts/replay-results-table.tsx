import { Fragment, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowRight } from "lucide-react"
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { verdictColor } from "@/lib/verdict-helpers"
import { formatRelativeTime, truncate } from "@/lib/format"
import type { EvaluateResponse } from "@/lib/api"
import { EvaluateResult } from "./evaluate-result"

export interface VerdictChange {
  id: string
  tool_name: string
  argsPreview: string
  agent_id: string
  timestamp: string
  oldVerdict: string
  newVerdict: string
  decidingContract: string | null
  oldResult: EvaluateResponse | null
  newResult: EvaluateResponse | null
}

const columns: ColumnDef<VerdictChange>[] = [
  { accessorKey: "tool_name", header: "Tool", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>, enableSorting: true },
  { accessorKey: "argsPreview", header: "Args", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{truncate(getValue<string>(), 40)}</span> },
  { accessorKey: "agent_id", header: "Agent", cell: ({ getValue }) => <span className="text-xs">{truncate(getValue<string>(), 16)}</span>, size: 120 },
  { accessorKey: "timestamp", header: "Time", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatRelativeTime(getValue<string>())}</span>, size: 80, enableSorting: true },
  { accessorKey: "oldVerdict", header: "Old", cell: ({ getValue }) => <Badge variant="outline" className={`text-xs ${verdictColor(getValue<string>())}`}>{getValue<string>()}</Badge>, size: 80 },
  { id: "arrow", header: "", cell: () => <ArrowRight className="size-3 text-muted-foreground" />, size: 24, enableSorting: false },
  { accessorKey: "newVerdict", header: "New", cell: ({ getValue }) => <Badge variant="outline" className={`text-xs ${verdictColor(getValue<string>())}`}>{getValue<string>()}</Badge>, size: 80 },
  { accessorKey: "decidingContract", header: "Contract", cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string | null>() ?? "-"}</span> },
]

export function ReplayResultsTable({ changes }: { changes: VerdictChange[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const table = useReactTable({
    data: changes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  return (
    <div className="rounded-md border">
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
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {expandedId === row.id && (
                <TableRow key={`${row.id}-expand`}>
                  <TableCell colSpan={columns.length} className="bg-muted/30 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Baseline (old)</p>
                        {row.original.oldResult && <EvaluateResult result={row.original.oldResult} />}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Test (new)</p>
                        {row.original.newResult && <EvaluateResult result={row.original.newResult} />}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-sm text-muted-foreground">
                No verdict changes detected.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
