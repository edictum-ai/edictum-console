import { useMemo, useRef, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Link } from "react-router"
import { Activity, Search } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import type { EventResponse } from "@/lib/api"
import {
  extractProvenance,
  contractLabel,
  isObserveFinding,
  extractArgsPreview,
} from "@/lib/payload-helpers"
import { verdictColor, VerdictIcon } from "@/lib/verdict-helpers"
import { formatTime, truncate } from "@/lib/format"
import { buildHistogram, type TimeWindow } from "@/lib/histogram"
import { EventHistogram } from "./event-histogram"

// -- Component ----------------------------------------------------------------

interface EventListProps {
  events: EventResponse[]
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedEventId: string | null
  onSelectEvent: (id: string) => void
  newEventCount: number
  onShowNewEvents: () => void
  timeWindow: TimeWindow
  onTimeWindowChange: (tw: TimeWindow) => void
  highlightedEventId: string | null
  onHighlightComplete: () => void
}

export function EventList({
  events,
  searchQuery,
  onSearchChange,
  selectedEventId,
  onSelectEvent,
  newEventCount,
  onShowNewEvents,
  timeWindow,
  onTimeWindowChange,
  highlightedEventId,
  onHighlightComplete,
}: EventListProps) {
  const histogramData = useMemo(() => buildHistogram(events, timeWindow), [events, timeWindow])
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Scroll to and highlight deep-linked event
  useEffect(() => {
    if (!highlightedEventId) return
    const el = rowRefs.current.get(highlightedEventId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    const timer = setTimeout(() => onHighlightComplete(), 2000)
    return () => clearTimeout(timer)
  }, [highlightedEventId, onHighlightComplete])

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Search bar */}
      <div className="border-b border-border px-3 py-2">
        <InputGroup className="border-0 shadow-none">
          <InputGroupAddon>
            <Search className="h-4 w-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search events... (agent, tool, args)"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-xs">{events.length} events</span>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {/* New events banner */}
      {newEventCount > 0 && (
        <Button
          variant="ghost"
          onClick={onShowNewEvents}
          className="mx-3 mt-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
        >
          Show {newEventCount} New Event{newEventCount > 1 ? "s" : ""}
        </Button>
      )}

      {/* Histogram */}
      {histogramData.length > 0 && (
        <EventHistogram
          histogramData={histogramData}
          timeWindow={timeWindow}
          onTimeWindowChange={onTimeWindowChange}
        />
      )}

      {/* Event List */}
      <div className="flex-1 overflow-y-auto px-3 pt-2">
        <div className="space-y-px pb-3">
          {events.length === 0 && (
            <EmptyState
              icon={<Activity className="h-10 w-10" />}
              title="No events yet"
              description="Events appear here when agents start making tool calls. Each event shows whether the call was allowed, denied, or observed by your contracts. Connect an agent to start seeing events."
            />
          )}
          {events.map((event) => {
            const isSelected = event.id === selectedEventId
            const isHighlighted = event.id === highlightedEventId
            const argsPreview = extractArgsPreview(event)
            const observe = isObserveFinding(event)
            const prov = extractProvenance(event)
            const label = contractLabel(prov)
            return (
              <Button
                variant="ghost"
                key={event.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(event.id, el)
                  else rowRefs.current.delete(event.id)
                }}
                onClick={() => onSelectEvent(event.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 h-auto text-left justify-start transition-colors ${
                  observe ? "opacity-75" : ""
                } ${
                  isHighlighted
                    ? "animate-highlight-fade bg-primary/20 ring-2 ring-primary/40"
                    : isSelected
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-accent/50"
                }`}
              >
                <VerdictIcon verdict={event.verdict} />

                {/* Timestamp — hidden on mobile */}
                <span className="hidden w-[72px] shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                  {formatTime(event.timestamp)}
                </span>

                {/* Agent ID link — hidden on mobile */}
                <Link
                  to={`/dashboard/agents/${encodeURIComponent(event.agent_id)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden w-[110px] shrink-0 truncate text-xs font-medium text-foreground hover:text-primary hover:underline sm:inline"
                >
                  {event.agent_id}
                </Link>

                <Badge
                  variant="outline"
                  className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal"
                >
                  {event.tool_name}
                </Badge>

                {label && (
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal border-violet-500/30 text-violet-600 dark:text-violet-400"
                  >
                    {label}
                  </Badge>
                )}

                {argsPreview && (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {truncate(argsPreview, 60)}
                  </span>
                )}

                <Badge
                  variant="outline"
                  className={`h-5 shrink-0 rounded border px-1.5 text-[10px] font-medium ${observe ? "border-dashed" : ""} ${verdictColor(event.verdict)}`}
                >
                  {event.verdict}
                </Badge>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
