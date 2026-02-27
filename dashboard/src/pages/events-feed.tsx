import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "react-router"
import { listEvents, type EventResponse } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { EventFilterPanel } from "./events/event-filter-panel"
import {
  EventList,
  type TimeWindow,
  DEFAULT_TIME_WINDOW,
  resolveWindow,
} from "./events/event-list"
import { EventDetail } from "./events/event-detail"
import { Loader2 } from "lucide-react"

function applyClientFilters(
  events: EventResponse[],
  activeFilters: Record<string, Set<string>>,
  searchQuery: string,
): EventResponse[] {
  let filtered = events

  // Facet filters
  for (const [field, values] of Object.entries(activeFilters)) {
    if (values.size === 0) continue
    if (field === "_contract") {
      filtered = filtered.filter((e) => {
        const dn = (e.payload?.decision_name as string) ?? ""
        return values.has(dn)
      })
      continue
    }
    filtered = filtered.filter((e) => {
      const val = String(e[field as keyof EventResponse] ?? "")
      return values.has(val)
    })
  }

  // Text search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter((e) => {
      const searchable = [
        e.agent_id,
        e.tool_name,
        e.verdict,
        e.mode,
        e.id,
        e.call_id,
        JSON.stringify(e.payload ?? {}),
      ]
        .join(" ")
        .toLowerCase()
      return searchable.includes(q)
    })
  }

  return filtered
}

export function EventsFeed() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Data state
  const [events, setEvents] = useState<EventResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Buffer SSE events before showing (Vercel "Show N New" pattern)
  const [bufferedEvents, setBufferedEvents] = useState<EventResponse[]>([])

  // UI state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(DEFAULT_TIME_WINDOW)
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(
    new Set(),
  )

  // Initialize active filters from URL search params
  const [activeFilters, setActiveFilters] = useState<
    Record<string, Set<string>>
  >(() => {
    const filters: Record<string, Set<string>> = {}
    const filterKeys = ["agent_id", "tool_name", "verdict", "mode"]
    for (const key of filterKeys) {
      const val = searchParams.get(key)
      if (val) filters[key] = new Set([val])
    }
    return filters
  })

  // Build server-side filters from active filters for initial load
  const serverFilters = useMemo(() => {
    const filters: Record<string, string> = {}
    for (const [field, values] of Object.entries(activeFilters)) {
      if (values.size === 1) {
        for (const v of values) {
          filters[field] = v
        }
      }
    }
    return filters
  }, [activeFilters])

  // Compute `since` and `until` ISO strings from time window
  const { sinceIso, untilIso } = useMemo(() => {
    const { start, end } = resolveWindow(timeWindow)
    return {
      sinceIso: new Date(start).toISOString(),
      untilIso: timeWindow.kind === "custom" ? new Date(end).toISOString() : undefined,
    }
  }, [timeWindow])

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listEvents({
        ...serverFilters,
        since: sinceIso,
        until: untilIso,
        limit: 200,
      })
      setEvents(data)
    } catch {
      setError("Failed to load events")
    } finally {
      setLoading(false)
    }
  }, [serverFilters, sinceIso, untilIso])

  // Fetch when filters or timeframe change
  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  // SSE for real-time events
  useDashboardSSE({
    event_created: (data) => {
      const event = data as EventResponse
      setBufferedEvents((prev) => [event, ...prev])
    },
  })

  // Show buffered events
  const handleShowNewEvents = useCallback(() => {
    setEvents((prev) => [...bufferedEvents, ...prev])
    setBufferedEvents([])
  }, [bufferedEvents])

  // Apply client-side filters + search
  const filteredEvents = useMemo(
    () => applyClientFilters(events, activeFilters, searchQuery),
    [events, activeFilters, searchQuery],
  )

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  )

  // Auto-select event from URL query param (e.g., ?event=abc-123)
  useEffect(() => {
    const eventId = searchParams.get("event")
    if (eventId && events.length > 0) {
      setSelectedEventId(eventId)
      setHighlightedEventId(eventId)
      // Clean up the event param from the URL, keeping other filters
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete("event")
      setSearchParams(nextParams, { replace: true })
    }
  }, [events, searchParams, setSearchParams])

  // Auto-select closest event from timestamp param (from approval history deep link)
  useEffect(() => {
    const ts = searchParams.get("ts")
    if (!ts || events.length === 0) return

    const targetTime = new Date(ts).getTime()
    if (Number.isNaN(targetTime)) return

    // Find the event closest to the timestamp among filtered events (or all events)
    const pool = filteredEvents.length > 0 ? filteredEvents : events
    let closestId: string | null = null
    let closestDiff = Infinity
    for (const e of pool) {
      const diff = Math.abs(new Date(e.timestamp).getTime() - targetTime)
      if (diff < closestDiff) {
        closestDiff = diff
        closestId = e.id
      }
    }

    if (closestId) {
      setSelectedEventId(closestId)
      setHighlightedEventId(closestId)
    }

    // Clean up the ts param from the URL, keeping other filters
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("ts")
    setSearchParams(nextParams, { replace: true })
  }, [events, filteredEvents, searchParams, setSearchParams])

  // Sync filters to URL
  const syncFiltersToUrl = useCallback(
    (filters: Record<string, Set<string>>) => {
      const params = new URLSearchParams()
      for (const [field, values] of Object.entries(filters)) {
        if (values.size === 1) {
          for (const v of values) {
            params.set(field, v)
          }
        }
      }
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const toggleFilter = useCallback(
    (field: string, value: string) => {
      setActiveFilters((prev) => {
        const next = { ...prev }
        const current = new Set(next[field] ?? [])
        if (current.has(value)) {
          current.delete(value)
        } else {
          current.add(value)
        }
        next[field] = current
        syncFiltersToUrl(next)
        return next
      })
    },
    [syncFiltersToUrl],
  )

  const toggleFacetCollapse = useCallback((name: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setActiveFilters({})
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  if (loading && events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Filter sidebar */}
      <div className="w-[220px] shrink-0 border-r border-border overflow-y-auto">
        <EventFilterPanel
          events={events}
          activeFilters={activeFilters}
          collapsedFacets={collapsedFacets}
          onToggleFilter={toggleFilter}
          onToggleFacetCollapse={toggleFacetCollapse}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* Event list */}
      <div className={`flex-1 overflow-y-auto ${selectedEvent ? "border-r border-border" : ""}`}>
        <EventList
          events={filteredEvents}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          newEventCount={bufferedEvents.length}
          onShowNewEvents={handleShowNewEvents}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          highlightedEventId={highlightedEventId}
          onHighlightComplete={() => setHighlightedEventId(null)}
        />
      </div>

      {/* Detail panel (right side) */}
      {selectedEvent && (
        <div className="w-[380px] shrink-0 overflow-y-auto">
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
          />
        </div>
      )}
    </div>
  )
}
