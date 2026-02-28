import { useMemo } from "react"
import { useSearchParams } from "react-router"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Copy, GitCompare } from "lucide-react"
import { toast } from "sonner"
import { type BundleWithDeployments } from "@/lib/api"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime, truncate } from "@/lib/format"
import { parseContractBundle } from "./yaml-parser"
import { diffContracts } from "./yaml-diff"
import { highlightYaml } from "./yaml-sheet"
import { DeployDialog } from "./deploy-dialog"

interface VersionDetailProps {
  bundle: BundleWithDeployments
  allBundles: BundleWithDeployments[]
  yamlContent: string
  prevYamlContent: string | null
  onRefresh: () => void
}

export function VersionDetail({
  bundle, allBundles, yamlContent, prevYamlContent, onRefresh,
}: VersionDetailProps) {
  const [, setSearchParams] = useSearchParams()

  const changeSummary = useMemo(() => {
    if (!prevYamlContent) return null
    try {
      const oldBundle = parseContractBundle(prevYamlContent)
      const newBundle = parseContractBundle(yamlContent)
      const diff = diffContracts(oldBundle, newBundle)
      const parts: string[] = []
      if (diff.added.length) parts.push(`+${diff.added.length} added`)
      if (diff.removed.length) parts.push(`-${diff.removed.length} removed`)
      if (diff.modified.length) parts.push(`~${diff.modified.length} modified`)
      return parts.length > 0 ? parts.join(", ") : "No changes"
    } catch {
      return null
    }
  }, [yamlContent, prevYamlContent])

  const prevVersion = allBundles.find((b) => b.version === bundle.version - 1)

  const handleCopyHash = async () => {
    await navigator.clipboard.writeText(bundle.revision_hash)
    toast.success("Copied revision hash")
  }

  const navigateToDiff = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", "diff")
      next.set("from", String(bundle.version - 1))
      next.set("to", String(bundle.version))
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-1 p-4">
        <h3 className="text-lg font-semibold">v{bundle.version} — {bundle.name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{truncate(bundle.revision_hash, 12)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-5" onClick={handleCopyHash}>
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy revision hash</TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground">
          Uploaded {formatRelativeTime(bundle.created_at)} by{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">{truncate(bundle.uploaded_by, 24)}</span>
            </TooltipTrigger>
            <TooltipContent>{bundle.uploaded_by}</TooltipContent>
          </Tooltip>
        </p>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Deployment status */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Deployed to
            </h4>
            {bundle.deployed_envs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {bundle.deployed_envs.map((env) => (
                  <EnvBadge key={env} env={env} />
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">Not deployed to any environment</p>
            )}
          </div>

          {/* Deploy action */}
          <DeployDialog
            bundleName={bundle.name}
            version={bundle.version}
            allBundles={allBundles}
            changeSummary={changeSummary}
            onSuccess={onRefresh}
          />

          {/* Change summary */}
          {prevVersion && changeSummary && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Changes from v{bundle.version - 1}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={navigateToDiff}
              >
                <GitCompare className="size-3" />
                {changeSummary}
              </Button>
            </div>
          )}

          <Separator />

          {/* YAML preview */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              YAML
            </h4>
            <pre className="max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
              {highlightYaml(yamlContent)}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
