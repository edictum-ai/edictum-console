import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "react-router"
import { listEvents, type EventResponse } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { useIsMobile } from "@/hooks/use-mobile"
import { useViewOptions } from "@/lib/hooks/use-view-options"
import { EventFilterPanel } from "./events/event-filter-panel"
import { EventList } from "./events/event-list"
import { EventsToolbar } from "./events/events-toolbar"
import { type TimeWindow, DEFAULT_TIME_WINDOW, resolveWindow } from "@/lib/histogram"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SlidersHorizontal } from "lucide-react"

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
  const isMobile = useIsMobile()
  const { options, setColumn, setPanel, setDensity, toggleWrapData, resetDefaults } = useViewOptions()

  // Data state
  const [events, setEvents] = useState<EventResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEventCount, setNewEventCount] = useState(0)

  // UI state
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(DEFAULT_TIME_WINDOW)
  const [isLive, setIsLive] = useState(true)
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set())

  // Initialize active filters from URL search params
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>(() => {
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
      setNewEventCount(0)
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

  // SSE for real-time events — accumulate count when live
  useDashboardSSE(
    isLive
      ? {
          event_created: (data) => {
            const payload = data as { accepted?: number }
            setNewEventCount((prev) => prev + (payload.accepted ?? 1))
          },
        }
      : {},
  )

  // Show new events — re-fetch from server then reset counter
  const handleShowNewEvents = useCallback(() => {
    setNewEventCount(0)
    void fetchEvents()
  }, [fetchEvents])

  // Toggle live/paused
  const handleToggleLive = useCallback(() => {
    setIsLive((prev) => {
      if (!prev) {
        // Resuming live — fetch fresh data
        void fetchEvents()
      }
      return !prev
    })
  }, [fetchEvents])

  // Apply client-side filters + search
  const filteredEvents = useMemo(
    () => applyClientFilters(events, activeFilters, searchQuery),
    [events, activeFilters, searchQuery],
  )

  // Toggle expand (accordion — one at a time)
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedEventId((prev) => (prev === id ? null : id))
  }, [])

  // Auto-select event from URL query param (e.g., ?event=abc-123)
  useEffect(() => {
    const eventId = searchParams.get("event")
    if (eventId && events.length > 0) {
      setExpandedEventId(eventId)
      setHighlightedEventId(eventId)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete("event")
      setSearchParams(nextParams, { replace: true })
    }
  }, [events, searchParams, setSearchParams])

  // Auto-select closest event from timestamp param
  useEffect(() => {
    const ts = searchParams.get("ts")
    if (!ts || events.length === 0) return

    const targetTime = new Date(ts).getTime()
    if (Number.isNaN(targetTime)) return

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
      setExpandedEventId(closestId)
      setHighlightedEventId(closestId)
    }

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
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setActiveFilters({})
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const clearHighlight = useCallback(() => setHighlightedEventId(null), [])

  const activeFilterCount = useMemo(
    () => Object.values(activeFilters).reduce((sum, set) => sum + set.size, 0),
    [activeFilters],
  )

  if (loading && events.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-2">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-1">
          <div className="hidden w-[220px] shrink-0 border-r border-border p-4 space-y-4 md:block">
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
          <div className="flex-1 p-4 space-y-3">
            <Skeleton className="h-[80px] w-full rounded-lg" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void fetchEvents()}>
          Retry
        </Button>
      </div>
    )
  }

  const filterPanelProps = {
    events,
    activeFilters,
    collapsedFacets,
    onToggleFilter: toggleFilter,
    onToggleFacetCollapse: toggleFacetCollapse,
    onClearAll: clearAllFilters,
  }

  const eventListProps = {
    events: filteredEvents,
    columns: options.columns,
    density: options.density,
    wrapData: options.wrapData,
    showHistogram: options.panels.histogram,
    timeWindow,
    expandedEventId,
    onToggleExpand: handleToggleExpand,
    highlightedEventId,
    onHighlightComplete: clearHighlight,
    onTimeWindowChange: setTimeWindow,
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <EventsToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          eventCount={filteredEvents.length}
          newEventCount={newEventCount}
          onShowNewEvents={handleShowNewEvents}
          isLive={isLive}
          onToggleLive={handleToggleLive}
          viewOptions={options}
          onSetColumn={setColumn}
          onSetPanel={setPanel}
          onSetDensity={setDensity}
          onToggleWrapData={toggleWrapData}
          onResetDefaults={resetDefaults}
          events={filteredEvents}
        />
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetTitle className="sr-only">Event Filters</SheetTitle>
              <EventFilterPanel {...filterPanelProps} />
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex-1 overflow-hidden">
          <EventList {...eventListProps} />
        </div>
      </div>
    )
  }

  // Desktop layout — two-panel (filter sidebar + table with inline expand)
  return (
    <div className="flex h-full flex-col">
      <EventsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        eventCount={filteredEvents.length}
        newEventCount={newEventCount}
        onShowNewEvents={handleShowNewEvents}
        isLive={isLive}
        onToggleLive={handleToggleLive}
        viewOptions={options}
        onSetColumn={setColumn}
        onSetPanel={setPanel}
        onSetDensity={setDensity}
        onToggleWrapData={toggleWrapData}
        onResetDefaults={resetDefaults}
        events={filteredEvents}
      />
      <div className="flex flex-1 min-h-0">
        {options.panels.filters && (
          <div className="w-[220px] shrink-0 border-r border-border overflow-y-auto">
            <EventFilterPanel {...filterPanelProps} />
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <EventList {...eventListProps} />
        </div>
      </div>
    </div>
  )
}
