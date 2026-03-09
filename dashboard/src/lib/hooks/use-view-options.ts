import { useState, useCallback } from "react"

export interface ColumnVisibility {
  time: boolean; agent: boolean; tool: boolean; verdict: boolean; data: boolean
  mode: boolean; contract: boolean; duration: boolean; environment: boolean; traceId: boolean
}

export interface PanelVisibility { filters: boolean; histogram: boolean }

export type Density = "compact" | "dense" | "comfortable"

export interface ViewOptions {
  columns: ColumnVisibility; panels: PanelVisibility; density: Density; wrapData: boolean
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  columns: {
    time: true, agent: true, tool: true, verdict: true, data: true,
    mode: false, contract: false, duration: false, environment: false, traceId: false,
  },
  panels: { filters: true, histogram: true },
  density: "comfortable",
  wrapData: false,
}

const STORAGE_KEY = "edictum:events:viewOptions"

function load(): ViewOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEW_OPTIONS
    const parsed = JSON.parse(raw) as Partial<ViewOptions>
    return {
      columns: { ...DEFAULT_VIEW_OPTIONS.columns, ...parsed.columns },
      panels: { ...DEFAULT_VIEW_OPTIONS.panels, ...parsed.panels },
      density: parsed.density ?? DEFAULT_VIEW_OPTIONS.density,
      wrapData: parsed.wrapData ?? DEFAULT_VIEW_OPTIONS.wrapData,
    }
  } catch {
    return DEFAULT_VIEW_OPTIONS
  }
}

function save(opts: ViewOptions): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
}

export function useViewOptions() {
  const [options, setOptions] = useState<ViewOptions>(load)

  const update = useCallback((fn: (prev: ViewOptions) => ViewOptions) => {
    setOptions((prev) => { const next = fn(prev); save(next); return next })
  }, [])

  const setColumn = useCallback((key: keyof ColumnVisibility, visible: boolean) => {
    update((prev) => ({ ...prev, columns: { ...prev.columns, [key]: visible } }))
  }, [update])

  const setPanel = useCallback((key: keyof PanelVisibility, visible: boolean) => {
    update((prev) => ({ ...prev, panels: { ...prev.panels, [key]: visible } }))
  }, [update])

  const setDensity = useCallback((density: Density) => {
    update((prev) => ({ ...prev, density }))
  }, [update])

  const toggleWrapData = useCallback(() => {
    update((prev) => ({ ...prev, wrapData: !prev.wrapData }))
  }, [update])

  const resetDefaults = useCallback(() => {
    save(DEFAULT_VIEW_OPTIONS)
    setOptions(DEFAULT_VIEW_OPTIONS)
  }, [])

  return { options, setColumn, setPanel, setDensity, toggleWrapData, resetDefaults }
}
