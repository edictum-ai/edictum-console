import { useCallback, useEffect, useMemo, useState } from "react"
import { KeyRound } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { listKeys, type ApiKeyInfo } from "@/lib/api"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"
import { ApiKeysEmptyState } from "./api-keys/empty-state"
import { KeyFilterBar } from "./api-keys/key-filter-bar"
import { KeyTable } from "./api-keys/key-table"
import { CreateKeyDialog } from "./api-keys/create-key-dialog"
import { RevokeKeyDialog } from "./api-keys/revoke-key-dialog"

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [envFilter, setEnvFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      setError(null)
      const data = await listKeys()
      setKeys(data)
    } catch {
      setError("Failed to load API keys")
      toast.error("Failed to load API keys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchKeys() }, [fetchKeys])

  // SSE for real-time updates (future-proof — ready when backend pushes key events)
  useDashboardSSE({
    api_key_created: () => { void fetchKeys() },
    api_key_revoked: () => { void fetchKeys() },
  })

  const filteredKeys = useMemo(() => {
    let result = keys
    if (envFilter !== "all") {
      result = result.filter((k) => k.env === envFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((k) => k.label?.toLowerCase().includes(q))
    }
    return result
  }, [keys, envFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: keys.length,
      production: 0,
      staging: 0,
      development: 0,
    }
    for (const k of keys) {
      c[k.env] = (c[k.env] ?? 0) + 1
    }
    return c
  }, [keys])

  const uniqueEnvs = useMemo(() => {
    const envs = new Set(keys.map((k) => k.env))
    return envs.size
  }, [keys])

  const handleRevoked = useCallback(() => {
    if (revokeTarget) {
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id))
    }
    setRevokeTarget(null)
    toast.success("API key revoked")
    void fetchKeys()
  }, [revokeTarget, fetchKeys])

  if (loading && keys.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        {/* Filter bar skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        {/* Table skeleton */}
        <div className="space-y-2">
          <div className="flex items-center gap-4 border-b border-border pb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && keys.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { setError(null); setLoading(true); void fetchKeys() }}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="size-5 text-amber-600 dark:text-amber-400" />
            API Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {keys.length === 0
              ? "No active keys"
              : `${keys.length} active key${keys.length !== 1 ? "s" : ""} across ${uniqueEnvs} environment${uniqueEnvs !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Key</Button>
      </div>

      {keys.length === 0 ? (
        <ApiKeysEmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <>
          <KeyFilterBar
            envFilter={envFilter}
            onEnvFilterChange={setEnvFilter}
            search={search}
            onSearchChange={setSearch}
            counts={counts}
          />
          <KeyTable keys={filteredKeys} onRevoke={setRevokeTarget} />
        </>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchKeys}
      />
      <RevokeKeyDialog
        keyToRevoke={revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        onRevoked={handleRevoked}
      />
    </div>
  )
}
