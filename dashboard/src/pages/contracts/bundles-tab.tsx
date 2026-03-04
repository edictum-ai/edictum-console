import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, AlertCircle, Layers } from "lucide-react"
import {
  listCompositions,
  getComposition,
  type CompositionSummary,
  type CompositionDetail,
} from "@/lib/api/compositions"
import { subscribeDashboardSSE } from "@/lib/sse"
import { CompositionListItem } from "./composition-list-item"
import { CompositionEditor } from "./composition-editor"
import { NewBundleDialog } from "./new-bundle-dialog"

export function BundlesTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [compositions, setCompositions] = useState<CompositionSummary[]>([])
  const [selected, setSelected] = useState<string | null>(
    searchParams.get("bundle"),
  )
  const [detail, setDetail] = useState<CompositionDetail | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const fetchGenRef = useRef(0)

  const fetchList = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setError(null)
    try {
      const data = await listCompositions()
      if (gen !== fetchGenRef.current) return
      setCompositions(data)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : "Failed to load bundles")
    } finally {
      if (gen === fetchGenRef.current) setListLoading(false)
    }
  }, [])

  useEffect(() => { setListLoading(true); fetchList() }, [fetchList])

  useEffect(() => {
    return subscribeDashboardSSE({ composition_changed: () => fetchList() })
  }, [fetchList])

  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    getComposition(selected)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  const handleSelect = useCallback(
    (name: string) => {
      setSelected(name)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("bundle", name)
        return next
      })
    },
    [setSearchParams],
  )

  const handleCreated = useCallback(
    (name: string) => { fetchList(); handleSelect(name) },
    [fetchList, handleSelect],
  )

  const handleSaved = useCallback(() => {
    fetchList()
    if (selected) getComposition(selected).then(setDetail).catch(() => {})
  }, [fetchList, selected])

  if (listLoading) {
    return (
      <div className="flex gap-4">
        <div className="w-72 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 flex-1 rounded-md" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" size="sm" className="ml-2"
            onClick={() => { setListLoading(true); fetchList() }}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const isEmpty = compositions.length === 0

  return (
    <>
      {isEmpty ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border">
          <Layers className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No bundles yet</p>
          <p className="text-xs text-muted-foreground">
            Compose your first bundle by selecting contracts from the library.
          </p>
          <Button size="sm" className="mt-2" onClick={() => setNewOpen(true)}>
            <Plus className="size-4 mr-1.5" /> New Bundle
          </Button>
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="w-72 shrink-0">
            <Button size="sm" className="mb-3 w-full" onClick={() => setNewOpen(true)}>
              <Plus className="size-4 mr-1.5" /> New Bundle
            </Button>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-1.5 pr-2">
                {compositions.map((c) => (
                  <CompositionListItem
                    key={c.name} composition={c}
                    selected={selected === c.name}
                    onClick={() => handleSelect(c.name)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="min-w-0 flex-1">
            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-32 rounded-md" />
              </div>
            ) : detail ? (
              <CompositionEditor
                composition={detail} onSaved={handleSaved} onDeployed={handleSaved}
              />
            ) : selected ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Bundle not found</p>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border">
                <Layers className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a bundle to edit</p>
              </div>
            )}
          </div>
        </div>
      )}

      <NewBundleDialog open={newOpen} onOpenChange={setNewOpen} onCreated={handleCreated} />
    </>
  )
}
