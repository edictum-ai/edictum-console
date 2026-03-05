import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useLocation } from "react-router"
import { Plus, Upload, Search, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { listContracts, type LibraryContractSummary } from "@/lib/api/contracts"
import { subscribeDashboardSSE } from "@/lib/sse"
import { ContractCard } from "./contract-card"
import { ContractEditorDialog, type FromEventContext } from "./contract-editor-dialog"
import { ImportDialog } from "./import-dialog"
import { DeleteDialog } from "./delete-dialog"
import { ContractDetailSheet } from "./contract-detail-sheet"
import { TemplatesSection } from "./templates-section"
import { useLibraryActions } from "./use-library-actions"

const TYPE_OPTIONS = ["all", "pre", "post", "session", "sandbox"] as const

export function LibraryTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const search = searchParams.get("search") ?? ""
  const typeFilter = searchParams.get("type") ?? ""

  const [contracts, setContracts] = useState<LibraryContractSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fetchGenRef = useRef(0)

  const fetchContracts = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setError(null)
    try {
      const data = await listContracts({
        search: search || undefined,
        type: typeFilter || undefined,
      })
      if (gen !== fetchGenRef.current) return // stale response
      setContracts(data)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : "Failed to load contracts")
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [search, typeFilter])

  const actions = useLibraryActions(contracts, fetchContracts)

  useEffect(() => { setLoading(true); fetchContracts() }, [fetchContracts])

  useEffect(() => {
    return subscribeDashboardSSE({
      contract_created: () => fetchContracts(),
      contract_updated: () => fetchContracts(),
    })
  }, [fetchContracts])

  // Debounced search → URL sync
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (searchInput) next.set("search", searchInput)
        else next.delete("search")
        return next
      })
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput, setSearchParams])

  // "Create from Event" context
  const [fromEvent, setFromEvent] = useState<FromEventContext | undefined>()

  // "Create from Event" — run once on mount
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      const toolName = searchParams.get("from_tool")
      const verdict = searchParams.get("from_verdict")
      // Tool args come from React Router state (not URL) to avoid leaking sensitive data
      const stateArgs = (location.state as { fromArgs?: Record<string, unknown> } | null)?.fromArgs
      if (toolName && verdict) {
        setFromEvent({ tool_name: toolName, verdict, tool_args: stateArgs })
      }
      actions.openNewContract()
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete("new")
        next.delete("from_tool")
        next.delete("from_verdict")
        return next
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (val && val !== "all") next.set("type", val)
      else next.delete("type")
      return next
    })
  }

  return (
    <div className="space-y-4">
      {!loading && (
        <TemplatesSection
          contractCount={contracts.length}
          onImport={actions.handleTemplateImport}
          importing={actions.templateImporting}
        />
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search contracts…"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter || "all"} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "all" ? "All types" : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => actions.setImportOpen(true)}>
            <Upload className="size-4 mr-1.5" /> Import
          </Button>
          <Button onClick={() => actions.openNewContract()}>
            <Plus className="size-4 mr-1.5" /> New Contract
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {error}{" "}
            <Button variant="outline" size="sm" className="ml-2" onClick={fetchContracts}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : contracts.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.contract_id} contract={c}
              onEdit={actions.handleEdit} onDelete={actions.handleDeleteRequest}
              onDuplicate={actions.handleDuplicate} onClick={actions.openDetail}
            />
          ))}
        </div>
      )}

      <ContractEditorDialog
        open={actions.editorOpen} onOpenChange={(v) => { actions.setEditorOpen(v); if (!v) setFromEvent(undefined) }}
        contract={actions.editingContract} initialDefinition={actions.initialDef}
        fromEvent={fromEvent}
        onSaved={fetchContracts}
      />
      <ImportDialog open={actions.importOpen} onOpenChange={actions.setImportOpen} onImported={fetchContracts} />
      <DeleteDialog
        open={actions.deleteOpen} onOpenChange={actions.setDeleteOpen}
        contractName={actions.deleteTarget?.name ?? ""}
        onConfirm={actions.handleDeleteConfirm} deleting={actions.deleting}
        usageCount={actions.deleteUsage.length}
        usedByBundles={actions.deleteUsage.map((u) => u.composition_name)}
      />
      <ContractDetailSheet
        open={actions.detailOpen} onOpenChange={actions.setDetailOpen}
        contractId={actions.detailId} onEdit={actions.handleEdit}
        onDuplicate={actions.handleDuplicate} onDelete={actions.handleDeleteRequest}
      />
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border">
      {search ? (
        <p className="text-sm text-muted-foreground">No contracts match &ldquo;{search}&rdquo;</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">No contracts yet</p>
          <p className="text-xs text-muted-foreground">
            Create your first contract or import from a starter pack above.
          </p>
        </>
      )}
    </div>
  )
}
