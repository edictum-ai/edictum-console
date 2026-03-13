import { useState, useEffect, useCallback, useRef } from "react"

const STORAGE_KEY = "edictum:events:filterWidth"
const MIN_WIDTH = 140
const MAX_WIDTH_RATIO = 0.4
const FALLBACK_WIDTH = 220
const SIZER_PADDING = 48 // chevron + count badge + borders + safety

interface UseResizableFilterWidthOptions {
  sizerRef: React.RefObject<HTMLSpanElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled: boolean
}

function readStored(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : null
  } catch {
    return null
  }
}

function persist(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(width)))
  } catch {
    /* localStorage unavailable */
  }
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

export function useResizableFilterWidth({
  sizerRef,
  containerRef,
  enabled,
}: UseResizableFilterWidthOptions) {
  const stored = readStored()
  const [width, setWidth] = useState(stored ?? FALLBACK_WIDTH)
  const hasUserResized = useRef(stored !== null)

  const getMaxWidth = useCallback(
    () => Math.floor((containerRef.current?.clientWidth ?? 1200) * MAX_WIDTH_RATIO),
    [containerRef],
  )

  const measure = useCallback(() => {
    const natural = sizerRef.current?.offsetWidth ?? 0
    if (natural === 0) return
    const max = getMaxWidth()
    const measured = Math.max(MIN_WIDTH, Math.min(natural + SIZER_PADDING, max))
    setWidth(measured)
  }, [sizerRef, getMaxWidth])

  // Auto-measure on mount if no persisted width
  useEffect(() => {
    if (!enabled || hasUserResized.current) return
    // Retry measurement — refs may not be attached on first rAF
    let cancelled = false
    const tryMeasure = (attempt: number) => {
      if (cancelled) return
      const natural = sizerRef.current?.offsetWidth ?? 0
      if (natural > 0) {
        measure()
      } else if (attempt < 5) {
        requestAnimationFrame(() => tryMeasure(attempt + 1))
      }
    }
    requestAnimationFrame(() => tryMeasure(0))
    return () => { cancelled = true }
  }, [enabled, measure, sizerRef])

  // Re-measure when sizer content changes (new events with longer labels)
  useEffect(() => {
    if (!enabled || hasUserResized.current || !sizerRef.current) return
    const observer = new ResizeObserver(() => {
      if (!hasUserResized.current) measure()
    })
    observer.observe(sizerRef.current)
    return () => observer.disconnect()
  }, [enabled, sizerRef, measure])

  // Clamp on window resize
  useEffect(() => {
    if (!enabled) return
    const onResize = () => {
      const max = getMaxWidth()
      setWidth((w) => Math.min(w, max))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [enabled, getMaxWidth])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width

      const onMouseMove = (ev: MouseEvent) => {
        const max = getMaxWidth()
        const delta = ev.clientX - startX
        setWidth(Math.min(max, Math.max(MIN_WIDTH, startWidth + delta)))
      }
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        // Persist whatever the width is after drag
        setWidth((w) => {
          persist(w)
          hasUserResized.current = true
          return w
        })
      }
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [width, getMaxWidth],
  )

  const handleDoubleClick = useCallback(() => {
    clearStored()
    hasUserResized.current = false
    measure()
  }, [measure])

  return { width, handleDragStart, handleDoubleClick }
}
