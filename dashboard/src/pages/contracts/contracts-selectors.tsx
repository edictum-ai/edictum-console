import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BundleSummary, BundleWithDeployments } from "@/lib/api"

interface BundleSelectorProps {
  summaries: BundleSummary[]
  selectedBundle: string | null
  onBundleChange: (name: string) => void
}

export function BundleSelector({ summaries, selectedBundle, onBundleChange }: BundleSelectorProps) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm text-muted-foreground">Bundle:</span>
      <Select value={selectedBundle ?? ""} onValueChange={onBundleChange}>
        <SelectTrigger className="h-8 w-52 text-sm">
          <SelectValue placeholder="Select a bundle" />
        </SelectTrigger>
        <SelectContent>
          {summaries.map((s) => (
            <SelectItem key={s.name} value={s.name}>
              <span className="font-mono">{s.name}</span>
              <span className="ml-2 text-muted-foreground">
                v{s.latest_version} · {s.version_count} version{s.version_count !== 1 ? "s" : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface VersionSelectorProps {
  bundles: BundleWithDeployments[]
  selectedVersion: number | null
  onVersionChange: (version: number) => void
}

export function VersionSelector({ bundles, selectedVersion, onVersionChange }: VersionSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Version:</span>
      <Select value={selectedVersion ? String(selectedVersion) : ""} onValueChange={(v) => onVersionChange(Number(v))}>
        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {bundles.map((b) => (
            <SelectItem key={b.version} value={String(b.version)}>v{b.version}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
