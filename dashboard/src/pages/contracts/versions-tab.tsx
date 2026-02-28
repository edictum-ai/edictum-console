import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Loader2, Package } from "lucide-react"
import { getBundleYaml, type BundleWithDeployments } from "@/lib/api"
import { EnvBadge, ENV_COLORS } from "@/lib/env-colors"
import { formatRelativeTime, truncate } from "@/lib/format"
import { VersionDetail } from "./version-detail"
import { UploadSheet } from "./upload-sheet"

interface VersionsTabProps {
  bundleName: string | null
  bundles: BundleWithDeployments[]
  onRefresh: () => void
}

export function VersionsTab({ bundleName, bundles, onRefresh }: VersionsTabProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [yamlContent, setYamlContent] = useState("")
  const [prevYamlContent, setPrevYamlContent] = useState<string | null>(null)
  const [loadingYaml, setLoadingYaml] = useState(false)

  // Auto-select latest version
  useEffect(() => {
    if (bundles.length > 0 && (!selectedVersion || !bundles.some((b) => b.version === selectedVersion))) {
      setSelectedVersion(bundles[0].version)
    }
  }, [bundles, selectedVersion])

  // Load YAML when selection changes
  useEffect(() => {
    if (!bundleName || !selectedVersion) return
    let cancelled = false
    setLoadingYaml(true)

    const selected = bundles.find((b) => b.version === selectedVersion)
    const prevVersion = selected ? bundles.find((b) => b.version === selectedVersion - 1) : null

    Promise.all([
      getBundleYaml(bundleName, selectedVersion),
      prevVersion ? getBundleYaml(bundleName, prevVersion.version) : Promise.resolve(null),
    ])
      .then(([yaml, prevYaml]) => {
        if (cancelled) return
        setYamlContent(yaml)
        setPrevYamlContent(prevYaml)
      })
      .catch(() => { if (!cancelled) setYamlContent("") })
      .finally(() => { if (!cancelled) setLoadingYaml(false) })

    return () => { cancelled = true }
  }, [bundleName, selectedVersion, bundles])

  if (!bundleName) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a bundle to view versions</p>
      </div>
    )
  }

  if (bundles.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Package className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No versions yet. Upload your first contract bundle.</p>
        <UploadSheet onRefresh={onRefresh} />
      </div>
    )
  }

  const selectedBundle = bundles.find((b) => b.version === selectedVersion)

  return (
    <div className="flex h-[calc(100vh-16rem)] rounded-lg border">
      {/* Left panel: version list */}
      <div className="flex w-[280px] shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-medium">Versions</h3>
          <UploadSheet onRefresh={onRefresh} />
        </div>
        <ScrollArea className="flex-1">
          {bundles.map((b) => {
            const isSelected = b.version === selectedVersion
            const hasDeployments = b.deployed_envs.length > 0
            // Use first deployed env color for left border
            const envColor = b.deployed_envs[0]
            const borderClass = envColor && ENV_COLORS[envColor]
              ? `border-l-2 ${envColor === "production" ? "border-l-red-500" : envColor === "staging" ? "border-l-amber-500" : "border-l-emerald-500"}`
              : ""

            return (
              <button
                key={b.version}
                type="button"
                onClick={() => setSelectedVersion(b.version)}
                className={`w-full px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-muted/30 border-l-2 border-l-accent" : `hover:bg-muted/50 ${borderClass}`
                } ${!hasDeployments && !isSelected ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">v{b.version}</span>
                  <div className="flex gap-1">
                    {b.deployed_envs.map((env) => (
                      <EnvBadge key={env} env={env} />
                    ))}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{truncate(b.uploaded_by, 20)}</span>
                  <span>{formatRelativeTime(b.created_at)}</span>
                </div>
              </button>
            )
          })}
        </ScrollArea>
      </div>

      {/* Right panel: version detail */}
      <div className="flex-1 overflow-hidden">
        {loadingYaml ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : selectedBundle && yamlContent ? (
          <VersionDetail
            bundle={selectedBundle}
            allBundles={bundles}
            yamlContent={yamlContent}
            prevYamlContent={prevYamlContent}
            onRefresh={onRefresh}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a version to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
