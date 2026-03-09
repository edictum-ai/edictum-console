import { useMemo, useRef, useEffect } from "react"
import { Link } from "react-router"
import { Activity } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
// Using native overflow-y-auto instead of ScrollArea for reliable scrolling with expandable rows
import { EmptyState } from "@/components/empty-state"
import type { EventResponse } from "@/lib/api"
import type { ColumnVisibility, Density } from "@/lib/hooks/use-view-options"
import {
  extractProvenance,
  contractLabel,
  isObserveFinding,
  extractArgsPreview,
} from "@/lib/payload-helpers"
import { verdictColor, VerdictIcon } from "@/lib/verdict-helpers"
import { formatTime, truncate } from "@/lib/format"
import { buildHistogram, type TimeWindow } from "@/lib/histogram"
import { EnvBadge } from "@/lib/env-colors"
import { EventHistogram } from "./event-histogram"
import { EventRowDetail } from "./event-row-detail"

// ---------------------------------------------------------------------------

const DENSITY_STYLES: Record<Density, { cell: string; font: string }> = {
  compact: { cell: "py-0.5 px-2", font: "text-[11px]" },
  dense: { cell: "py-1 px-2", font: "text-xs" },
  comfortable: { cell: "py-2 px-3", font: "text-xs" },
}

interface ColumnDef {
  key: keyof ColumnVisibility
  label: string
  className: string
}

const COLUMNS: ColumnDef[] = [
  { key: "time", label: "Time", className: "w-[70px] font-mono" },
  { key: "agent", label: "Agent", className: "w-[120px]" },
  { key: "tool", label: "Tool", className: "w-[80px]" },
  { key: "mode", label: "Mode", className: "w-[70px]" },
  { key: "verdict", label: "Verdict", className: "w-[100px]" },
  { key: "contract", label: "Contract", className: "w-[120px]" },
  { key: "duration", label: "Dur", className: "w-[60px] text-right" },
  { key: "environment", label: "Env", className: "w-[80px]" },
  { key: "traceId", label: "Trace", className: "w-[100px] font-mono" },
  { key: "data", label: "Data", className: "min-w-[120px]" },
]

// ---------------------------------------------------------------------------

interface EventListProps {
  events: EventResponse[]
  columns: ColumnVisibility
  density: Density
  wrapData: boolean
  showHistogram: boolean
  timeWindow: TimeWindow
  expandedEventId: string | null
  onToggleExpand: (id: string) => void
  highlightedEventId: string | null
  onHighlightComplete: () => void
  onTimeWindowChange: (tw: TimeWindow) => void
}

export function EventList({
  events,
  columns,
  density,
  wrapData,
  showHistogram,
  timeWindow,
  expandedEventId,
  onToggleExpand,
  highlightedEventId,
  onHighlightComplete,
  onTimeWindowChange,
}: EventListProps) {
  const histogramData = useMemo(() => buildHistogram(events, timeWindow), [events, timeWindow])
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())
  const ds = DENSITY_STYLES[density]
  const visibleCols = useMemo(() => COLUMNS.filter((c) => columns[c.key]), [columns])
  const colSpan = visibleCols.length

  // Scroll to deep-linked event
  useEffect(() => {
    if (!highlightedEventId) return
    const el = rowRefs.current.get(highlightedEventId)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    const timer = setTimeout(() => onHighlightComplete(), 2000)
    return () => clearTimeout(timer)
  }, [highlightedEventId, onHighlightComplete])

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Histogram */}
      {showHistogram && histogramData.length > 0 && (
        <EventHistogram
          histogramData={histogramData}
          onBarClick={(bucket) => {
            onTimeWindowChange({ kind: "custom", start: bucket._start, end: bucket._end })
          }}
        />
      )}

      {/* Table */}
      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={<Activity className="h-10 w-10" />}
            title="No events yet"
            description="Events appear here when agents start making tool calls. Connect an agent to start seeing events."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {visibleCols.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.className} ${ds.font} h-8 text-muted-foreground font-medium`}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <EventTableRow
                  key={event.id}
                  event={event}
                  visibleCols={visibleCols}
                  ds={ds}
                  wrapData={wrapData}
                  isExpanded={event.id === expandedEventId}
                  isHighlighted={event.id === highlightedEventId}
                  observe={isObserveFinding(event)}
                  colSpan={colSpan}
                  onToggleExpand={onToggleExpand}
                  rowRefs={rowRefs}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface EventTableRowProps {
  event: EventResponse
  visibleCols: ColumnDef[]
  ds: { cell: string; font: string }
  wrapData: boolean
  isExpanded: boolean
  isHighlighted: boolean
  observe: boolean
  colSpan: number
  onToggleExpand: (id: string) => void
  rowRefs: React.RefObject<Map<string, HTMLElement>>
}

function EventTableRow({
  event,
  visibleCols,
  ds,
  wrapData,
  isExpanded,
  isHighlighted,
  observe,
  colSpan,
  onToggleExpand,
  rowRefs,
}: EventTableRowProps) {
  const prov = extractProvenance(event)
  const label = contractLabel(prov)
  const payload = event.payload ?? {}
  const durationMs = typeof payload.duration_ms === "number" ? payload.duration_ms : undefined
  const environment =
    typeof payload.environment === "string"
      ? payload.environment
      : typeof payload.env === "string"
        ? payload.env
        : undefined
  const traceId = typeof payload.trace_id === "string" ? payload.trace_id : undefined

  const renderCell = (col: ColumnDef): React.ReactNode => {
    switch (col.key) {
      case "time":
        return <span className="font-mono text-muted-foreground">{formatTime(event.timestamp)}</span>
      case "agent":
        return (
          <Link
            to={`/dashboard/agents/${encodeURIComponent(event.agent_id)}`}
            onClick={(e) => e.stopPropagation()}
            className="truncate font-medium text-foreground hover:text-primary hover:underline"
          >
            {event.agent_id}
          </Link>
        )
      case "tool":
        return (
          <Badge variant="outline" className="h-5 rounded px-1.5 font-mono text-[10px] font-normal">
            {event.tool_name}
          </Badge>
        )
      case "mode":
        return <span className="text-muted-foreground">{event.mode}</span>
      case "verdict":
        return (
          <span className={`inline-flex items-center gap-1 ${verdictColor(event.verdict)}`}>
            <VerdictIcon verdict={event.verdict} className="h-3 w-3" />
            <span className={observe ? "border-b border-dashed" : ""}>{event.verdict}</span>
          </span>
        )
      case "contract":
        return label ? (
          <span className="truncate font-mono text-violet-600 dark:text-violet-400">{label}</span>
        ) : (
          <span className="text-muted-foreground/50">&mdash;</span>
        )
      case "duration":
        return durationMs !== undefined ? (
          <span className="font-mono text-muted-foreground">{durationMs}ms</span>
        ) : (
          <span className="text-muted-foreground/50">&mdash;</span>
        )
      case "environment":
        return environment ? <EnvBadge env={environment} /> : <span className="text-muted-foreground/50">&mdash;</span>
      case "traceId":
        return traceId ? (
          <span className="truncate font-mono text-muted-foreground">{truncate(traceId, 12)}</span>
        ) : (
          <span className="text-muted-foreground/50">&mdash;</span>
        )
      case "data": {
        const preview = extractArgsPreview(event)
        return preview ? (
          <span className={`font-mono text-muted-foreground ${wrapData ? "whitespace-pre-wrap break-all" : "truncate block"}`}>
            {preview}
          </span>
        ) : null
      }
      default:
        return null
    }
  }

  return (
    <>
      <TableRow
        ref={(el) => {
          if (el) rowRefs.current?.set(event.id, el)
          else rowRefs.current?.delete(event.id)
        }}
        onClick={() => onToggleExpand(event.id)}
        className={`cursor-pointer transition-colors ${ds.font} ${
          observe ? "opacity-75" : ""
        } ${
          isHighlighted
            ? "animate-highlight-fade bg-primary/20 ring-2 ring-primary/40"
            : isExpanded
              ? "bg-primary/10"
              : "hover:bg-accent/50"
        }`}
      >
        {visibleCols.map((col) => (
          <TableCell key={col.key} className={`${ds.cell} ${col.className} ${ds.font}`}>
            {renderCell(col)}
          </TableCell>
        ))}
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <EventRowDetail event={event} colSpan={colSpan} />
        </TableRow>
      )}
    </>
  )
}
