import { useCallback, useEffect, useMemo, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { listKeys, type ApiKeyInfo } from "@/lib/api"
import { EmptyState } from "./api-keys/empty-state"
import { KeyFilterBar } from "./api-keys/key-filter-bar"
import { KeyTable } from "./api-keys/key-table"
import { CreateKeyDialog } from "./api-keys/create-key-dialog"
import { RevokeKeyDialog } from "./api-keys/revoke-key-dialog"

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [envFilter, setEnvFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const data = await listKeys()
      setKeys(data)
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchKeys() }, [fetchKeys])

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="size-5 text-muted-foreground" />
            API Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {keys.length} active {keys.length === 1 ? "key" : "keys"} across{" "}
            {uniqueEnvs} {uniqueEnvs === 1 ? "environment" : "environments"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Key</Button>
      </div>

      {keys.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateOpen(true)} />
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
        onRevoked={fetchKeys}
      />
    </div>
  )
}
