import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRight, Clock, User } from "lucide-react"
import { CONTRACT_MODE_COLORS } from "@/lib/contract-colors"
import { EnvBadge } from "@/lib/env-colors"
import { formatRelativeTime } from "@/lib/format"
import type { BundleWithDeployments, ContractCoverage } from "@/lib/api"
import type { ContractBundle } from "./types"

interface BundleHeaderProps {
  bundleName: string
  bundles: BundleWithDeployments[]
  selectedVersion: number | null
  onVersionChange: (version: number) => void
  parsedBundle: ContractBundle
  coverage: ContractCoverage[]
}

const KNOWN_ENVS = ["production", "staging", "development"] as const

export function BundleHeader({
  bundleName,
  bundles,
  selectedVersion,
  onVersionChange,
  parsedBundle,
  coverage,
}: BundleHeaderProps) {
  const selected = bundles.find((b) => b.version === selectedVersion)
  if (!selected) return null

  const toolEntries = parsedBundle.tools ? Object.entries(parsedBundle.tools) : []
  const sideEffectCounts = toolEntries.reduce<Record<string, number>>((acc, [, t]) => {
    acc[t.side_effect] = (acc[t.side_effect] ?? 0) + 1
    return acc
  }, {})
  const deployedEnvs = new Set(selected.deployed_envs)

  // Coverage stats
  const totalContracts = parsedBundle.contracts.length
  const triggeredCount = parsedBundle.contracts.filter(
    (c) => coverage.some((cv) => cv.decision_name === c.id && cv.total_evaluations > 0),
  ).length
  const coveragePct = totalContracts > 0 ? Math.round((triggeredCount / totalContracts) * 100) : 0

  // Env→version map (which version is deployed where)
  const envVersionMap = new Map<string, number>()
  for (const b of bundles) {
    for (const env of b.deployed_envs) {
      if (!envVersionMap.has(env)) envVersionMap.set(env, b.version)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Top row: name + version + mode + envs */}
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold font-mono">{bundleName}</span>
          <Select
            value={selectedVersion ? String(selectedVersion) : ""}
            onValueChange={(v) => onVersionChange(Number(v))}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bundles.map((b) => (
                <SelectItem key={b.version} value={String(b.version)}>
                  v{b.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className={CONTRACT_MODE_COLORS[parsedBundle.defaults.mode]}>
            {parsedBundle.defaults.mode}
          </Badge>
          {parsedBundle.observe_alongside && (
            <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
              observe alongside
            </Badge>
          )}
        </div>

        {/* Env deploy status */}
        <div className="flex items-center gap-2">
          {KNOWN_ENVS.map((env) => {
            const deployedVersion = envVersionMap.get(env)
            const isCurrent = deployedEnvs.has(env)
            return (
              <Tooltip key={env}>
                <TooltipTrigger asChild>
                  <span className={isCurrent ? "" : "opacity-30"}>
                    <EnvBadge env={env} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {deployedVersion
                    ? `v${deployedVersion} deployed${isCurrent ? " (this version)" : ""}`
                    : "Not deployed"}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Bottom row: metadata + stats */}
      <div className="flex items-center gap-6 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {parsedBundle.metadata.description && (
          <span className="max-w-xs truncate">{parsedBundle.metadata.description}</span>
        )}
        <span className="flex items-center gap-1">
          <User className="size-3" />
          {selected.uploaded_by.includes("@")
            ? selected.uploaded_by.split("@")[0]
            : selected.uploaded_by.slice(0, 8)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatRelativeTime(selected.created_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{new Date(selected.created_at).toLocaleString()}</TooltipContent>
        </Tooltip>
        <span>{totalContracts} contracts</span>
        <span className={coveragePct > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
          {coveragePct}% triggered
        </span>
        {toolEntries.length > 0 && (
          <Collapsible className="inline-flex">
            <CollapsibleTrigger className="group flex items-center gap-1 hover:text-foreground">
              <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
              {toolEntries.length} tools
              <span className="text-muted-foreground/70">
                ({Object.entries(sideEffectCounts).map(([k, n]) => `${n} ${k}`).join(", ")})
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute z-10 mt-6 rounded-md border border-border bg-popover p-2 shadow-md">
              {toolEntries.map(([name, t]) => (
                <div key={name} className="flex items-center gap-2 py-0.5 text-xs">
                  <code className="rounded bg-muted px-1 py-0.5">{name}</code>
                  <span className="text-muted-foreground">{t.side_effect}</span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
