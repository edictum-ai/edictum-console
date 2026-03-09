import { useRef, useEffect, useState, useCallback } from "react"
import { Search, Download, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from "@/components/ui/input-group"
import { ViewOptionsPopover } from "./view-options-popover"
import { exportJSON, exportCSV, exportText } from "./export-helpers"
import {
  type TimeWindow, type PresetKey,
  TOOLBAR_PRESET_KEYS, PRESETS,
  toLocalISOString, formatCustomLabel,
} from "@/lib/histogram"
import type {
  ViewOptions, ColumnVisibility, PanelVisibility, Density,
} from "@/lib/hooks/use-view-options"
import type { EventResponse } from "@/lib/api"

interface EventsToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  timeWindow: TimeWindow
  onTimeWindowChange: (tw: TimeWindow) => void
  eventCount: number
  newEventCount: number
  onShowNewEvents: () => void
  isLive: boolean
  onToggleLive: () => void
  viewOptions: ViewOptions
  onSetColumn: (key: keyof ColumnVisibility, visible: boolean) => void
  onSetPanel: (key: keyof PanelVisibility, visible: boolean) => void
  onSetDensity: (d: Density) => void
  onToggleWrapData: () => void
  onResetDefaults: () => void
  events: EventResponse[]
}

export function EventsToolbar({
  searchQuery, onSearchChange,
  timeWindow, onTimeWindowChange,
  eventCount, newEventCount, onShowNewEvents,
  isLive, onToggleLive,
  viewOptions, onSetColumn, onSetPanel, onSetDensity, onToggleWrapData, onResetDefaults,
  events,
}: EventsToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  // Custom time range popover state
  const [customOpen, setCustomOpen] = useState(false)
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  // Cmd+K / "/" to focus search, Escape to blur
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); searchRef.current?.focus(); return
      }
      const tag = (e.target as HTMLElement).tagName
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault(); searchRef.current?.focus()
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const openCustomPopover = useCallback(() => {
    const now = Date.now()
    const s = timeWindow.kind === "custom" ? timeWindow.start : now - 3_600_000
    const e = timeWindow.kind === "custom" ? timeWindow.end : now
    setCustomStart(toLocalISOString(new Date(s)))
    setCustomEnd(toLocalISOString(new Date(e)))
    setCustomOpen(true)
  }, [timeWindow])

  const applyCustomRange = useCallback(() => {
    const s = new Date(customStart).getTime()
    const e = new Date(customEnd).getTime()
    if (!Number.isNaN(s) && !Number.isNaN(e) && s < e) {
      onTimeWindowChange({ kind: "custom", start: s, end: e })
      setCustomOpen(false)
    }
  }, [customStart, customEnd, onTimeWindowChange])

  const isCustom = timeWindow.kind === "custom"

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b">
      {/* Search */}
      <InputGroup className="flex-1 min-w-48 max-w-sm">
        <InputGroupAddon align="inline-start">
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          placeholder="Search events..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </InputGroupAddon>
      </InputGroup>

      {/* Time range pills */}
      <div className="flex items-center gap-0.5 shrink-0">
        {TOOLBAR_PRESET_KEYS.map((key: PresetKey) => (
          <Button
            key={key}
            size="sm"
            variant={timeWindow.kind === "preset" && timeWindow.key === key ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onTimeWindowChange({ kind: "preset", key })}
          >
            {PRESETS[key].label.replace("Last ", "")}
          </Button>
        ))}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={isCustom ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={openCustomPopover}
            >
              {isCustom ? formatCustomLabel(timeWindow.start, timeWindow.end) : "Custom"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Until</Label>
              <Input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={applyCustomRange}>Apply</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Live toggle */}
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onToggleLive}>
        <span className={`inline-block size-2 rounded-full ${isLive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        {isLive ? "Live" : "Paused"}
      </Button>

      <span className="text-xs text-muted-foreground">{eventCount} events</span>
      {newEventCount > 0 && (
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-primary" onClick={onShowNewEvents}>
          <ArrowUp className="size-3" />
          {newEventCount} new
        </Button>
      )}

      <Separator orientation="vertical" className="h-4" />

      {/* Export */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Export events">
            <Download className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-32 p-1">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => exportJSON(events)}>JSON</Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => exportCSV(events)}>CSV</Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => exportText(events)}>Plain text</Button>
        </PopoverContent>
      </Popover>

      {/* View options gear */}
      <ViewOptionsPopover
        options={viewOptions}
        onSetColumn={onSetColumn}
        onSetPanel={onSetPanel}
        onSetDensity={onSetDensity}
        onToggleWrapData={onToggleWrapData}
        onResetDefaults={onResetDefaults}
      />
    </div>
  )
}
