import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Check, Plus } from "lucide-react"
import { listContracts, type LibraryContractSummary } from "@/lib/api/contracts"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"

interface ContractPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingContractIds: Set<string>
  onAdd: (contract: LibraryContractSummary) => void
}

const TYPE_OPTIONS = ["all", "pre", "post", "session", "sandbox"] as const

export function ContractPickerDialog({
  open,
  onOpenChange,
  existingContractIds,
  onAdd,
}: ContractPickerDialogProps) {
  const [contracts, setContracts] = useState<LibraryContractSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const fetchRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Debounce search input → 300ms
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput])

  const fetchContracts = useCallback(async () => {
    const gen = ++fetchRef.current
    setLoading(true)
    try {
      const data = await listContracts({
        search: debouncedSearch || undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
      })
      if (gen !== fetchRef.current) return
      setContracts(data)
    } catch {
      if (gen !== fetchRef.current) return
      setContracts([])
    } finally {
      if (gen === fetchRef.current) setLoading(false)
    }
  }, [debouncedSearch, typeFilter])

  useEffect(() => {
    if (open) fetchContracts()
  }, [open, fetchContracts])

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setSearchInput("")
      setDebouncedSearch("")
      setTypeFilter("all")
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Contracts</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search contracts…"
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "all" ? "All types" : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-64">
          {loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">No contracts found</p>
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {contracts.map((c) => {
                const alreadyAdded = existingContractIds.has(c.contract_id)
                const typeColor =
                  CONTRACT_TYPE_COLORS[c.type] ??
                  "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30"

                return (
                  <div
                    key={c.contract_id}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <Badge variant="outline" className={`${typeColor} shrink-0 text-[10px]`}>
                      {c.type}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.contract_id} &middot; v{c.version}
                      </p>
                    </div>
                    {alreadyAdded ? (
                      <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onAdd(c)}
                        aria-label={`Add ${c.name}`}
                      >
                        <Plus />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
