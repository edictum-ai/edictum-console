import { useState, useEffect, useRef } from "react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { listCompositions, previewComposition } from "@/lib/api"
import type { CompositionSummary } from "@/lib/api"

interface CompositionSourceSelectorProps {
  onYamlLoaded: (yaml: string) => void
  onError: (error: string | null) => void
}

/** Dropdown that lists compositions and loads assembled YAML on selection. */
export function CompositionSourceSelector({ onYamlLoaded, onError }: CompositionSourceSelectorProps) {
  const [compositions, setCompositions] = useState<CompositionSummary[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [selected, setSelected] = useState("")
  const [loading, setLoading] = useState(false)
  const loadGenRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    listCompositions()
      .then((data) => { if (!cancelled) setCompositions(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setListLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const handleChange = (name: string) => {
    setSelected(name)
    if (!name) return
    const gen = ++loadGenRef.current
    setLoading(true)
    onError(null)
    previewComposition(name)
      .then((preview) => {
        if (gen !== loadGenRef.current) return // stale — user switched compositions
        onYamlLoaded(preview.yaml_content)
      })
      .catch((e) => {
        if (gen !== loadGenRef.current) return
        onError(e instanceof Error ? e.message : "Failed to load composition")
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false)
      })
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={handleChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select composition..." />
          </SelectTrigger>
          <SelectContent>
            {compositions.map((c) => (
              <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      {listLoaded && compositions.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No compositions found. Create one in the Bundles tab.
        </p>
      )}
    </div>
  )
}
