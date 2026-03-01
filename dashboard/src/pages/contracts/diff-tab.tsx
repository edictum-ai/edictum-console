import { useState, useEffect, useMemo } from "react"
import { useSearchParams } from "react-router"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { ArrowLeftRight, Loader2 } from "lucide-react"
import type { BundleWithDeployments } from "@/lib/api"
import { getBundleYaml } from "@/lib/api"
import { parseContractBundle } from "./yaml-parser"
import { diffContracts } from "./yaml-diff"
import type { ContractDiff } from "./types"
import { DiffSummary } from "./diff-summary"
import { DiffYaml } from "./diff-yaml"
import { DiffImpact } from "./diff-impact"

interface DiffTabProps {
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
}

export function DiffTab({ bundles, selectedBundle }: DiffTabProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const sorted = useMemo(
    () => [...bundles].sort((a, b) => a.version - b.version),
    [bundles],
  )

  // Default: second-latest → latest
  const defaultFrom = sorted.length >= 2 ? sorted[sorted.length - 2]!.version : null
  const defaultTo = sorted.length >= 1 ? sorted[sorted.length - 1]!.version : null

  const [fromVersion, setFromVersion] = useState<number | null>(
    searchParams.get("from") ? Number(searchParams.get("from")) : defaultFrom,
  )
  const [toVersion, setToVersion] = useState<number | null>(
    searchParams.get("to") ? Number(searchParams.get("to")) : defaultTo,
  )

  const [oldYaml, setOldYaml] = useState<string | null>(null)
  const [newYaml, setNewYaml] = useState<string | null>(null)
  const [diff, setDiff] = useState<ContractDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync URL params when from/to change
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (fromVersion) next.set("from", String(fromVersion)); else next.delete("from")
      if (toVersion) next.set("to", String(toVersion)); else next.delete("to")
      return next
    })
  }, [fromVersion, toVersion, setSearchParams])

  // Fetch YAML and compute diff
  useEffect(() => {
    if (!fromVersion || !toVersion || fromVersion === toVersion || !selectedBundle) {
      setOldYaml(null)
      setNewYaml(null)
      setDiff(null)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([
      getBundleYaml(selectedBundle, fromVersion),
      getBundleYaml(selectedBundle, toVersion),
    ])
      .then(([oldY, newY]) => {
        setOldYaml(oldY)
        setNewYaml(newY)
        const oldBundle = parseContractBundle(oldY)
        const newBundle = parseContractBundle(newY)
        setDiff(diffContracts(oldBundle, newBundle))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [fromVersion, toVersion, selectedBundle])

  if (sorted.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Need at least two versions to compare.</p>
      </div>
    )
  }

  const handleSwap = () => {
    setFromVersion(toVersion)
    setToVersion(fromVersion)
  }

  return (
    <div className="space-y-6">
      {/* Version selectors */}
      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Select
            value={fromVersion ? String(fromVersion) : ""}
            onValueChange={(v) => setFromVersion(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Version..." />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((b) => (
                <SelectItem key={b.version} value={String(b.version)}>v{b.version}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="icon" className="mt-5" onClick={handleSwap}>
          <ArrowLeftRight className="size-4" />
        </Button>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Select
            value={toVersion ? String(toVersion) : ""}
            onValueChange={(v) => setToVersion(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Version..." />
            </SelectTrigger>
            <SelectContent>
              {sorted.map((b) => (
                <SelectItem key={b.version} value={String(b.version)}>v{b.version}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Same version warning */}
      {fromVersion && toVersion && fromVersion === toVersion && (
        <p className="text-sm text-muted-foreground">Select two different versions to compare.</p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setError(null)}>
            Retry
          </Button>
        </div>
      )}

      {/* Diff results */}
      {diff && oldYaml && newYaml && !loading && (
        <div className="space-y-6">
          <DiffSummary diff={diff} />
          <Separator />
          <DiffImpact oldYaml={oldYaml} newYaml={newYaml} />
          <Separator />
          <DiffYaml oldYaml={oldYaml} newYaml={newYaml} />
        </div>
      )}
    </div>
  )
}
