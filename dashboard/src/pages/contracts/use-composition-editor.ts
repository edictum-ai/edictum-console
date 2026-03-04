import { useState, useCallback, useMemo } from "react"
import type {
  CompositionDetail,
  CompositionItemDetail,
  CompositionItemInput,
} from "@/lib/api/compositions"
import { updateComposition } from "@/lib/api/compositions"
import type { LibraryContractSummary } from "@/lib/api/contracts"
import { toast } from "sonner"

export function useCompositionEditor(
  composition: CompositionDetail,
  onSaved: () => void,
) {
  const [items, setItems] = useState<CompositionItemDetail[]>(composition.contracts)
  const [mode, setMode] = useState(composition.defaults_mode)
  const [strategy, setStrategy] = useState(composition.update_strategy)
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // Reset local state when composition prop changes
  const [prevName, setPrevName] = useState(composition.name)
  if (composition.name !== prevName) {
    setPrevName(composition.name)
    setItems(composition.contracts)
    setMode(composition.defaults_mode)
    setStrategy(composition.update_strategy)
  }

  const existingIds = useMemo(
    () => new Set(items.map((i) => i.contract_id)),
    [items],
  )

  const updatesAvailable = useMemo(
    () => items.filter((i) => i.has_newer_version).length,
    [items],
  )

  const moveItem = useCallback((from: number, to: number) => {
    setItems((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      if (item) next.splice(to, 0, item)
      return next
    })
  }, [])

  const updateItem = useCallback(
    (idx: number, patch: Partial<CompositionItemDetail>) => {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
      )
    },
    [],
  )

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addContract = useCallback((c: LibraryContractSummary) => {
    setItems((prev) => [
      ...prev,
      {
        contract_id: c.contract_id,
        contract_name: c.name,
        contract_type: c.type,
        contract_version: c.version,
        position: (prev.length + 1) * 10,
        mode_override: null,
        enabled: true,
        has_newer_version: false,
      },
    ])
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const contracts: CompositionItemInput[] = items.map((it, i) => ({
        contract_id: it.contract_id,
        position: (i + 1) * 10,
        mode_override: it.mode_override as "enforce" | "observe" | null,
        enabled: it.enabled,
      }))
      await updateComposition(composition.name, {
        defaults_mode: mode,
        update_strategy: strategy,
        contracts,
      })
      toast.success("Bundle saved")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return {
    items,
    mode,
    setMode,
    strategy,
    setStrategy,
    saving,
    existingIds,
    updatesAvailable,
    dragIdx,
    setDragIdx,
    moveItem,
    updateItem,
    removeItem,
    addContract,
    handleSave,
  }
}
