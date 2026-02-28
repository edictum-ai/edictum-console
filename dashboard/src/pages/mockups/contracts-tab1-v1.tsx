// Tab 1 V1: Contract Cards
// Full cards for each contract with type badge, tool, summary, mode, effect, tags.
// Click to expand for full details. Visual and spacious.

import { useState } from "react"
import {
  MOCK_PARSED_CONTRACTS,
  MOCK_BUNDLE_META,
  MOCK_VERSION_CONTEXT,
  MOCK_BUNDLES,
  TYPE_COLORS,
  EFFECT_COLORS,
  MODE_COLORS,
  ENV_COLORS,
  relativeTime,
  type ParsedContract,
  type Environment,
} from "./contracts-data"
import { ContractsTabBarV2 } from "./contracts-tab-bar-v2"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Upload,
  Rocket,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Shield,
  Eye,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Bundle Header
// ---------------------------------------------------------------------------

function BundleHeader() {
  const [selectedVersion, setSelectedVersion] = useState(MOCK_BUNDLE_META.version.toString())

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-lg font-semibold text-foreground">
              {MOCK_BUNDLE_META.name}
            </h2>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCK_BUNDLES.map((b) => (
                  <SelectItem key={b.version} value={b.version.toString()}>
                    v{b.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {MOCK_BUNDLE_META.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{MOCK_BUNDLE_META.revision_hash}</span>
            <span>·</span>
            <span>Uploaded {relativeTime(MOCK_BUNDLE_META.created_at)}</span>
            <span>·</span>
            <span>{MOCK_BUNDLE_META.contract_count} contracts</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {MOCK_VERSION_CONTEXT.map(({ env, version }) => {
              const colors = ENV_COLORS[env as Environment]
              const isThisVersion = version === MOCK_BUNDLE_META.version
              return (
                <Badge
                  key={env}
                  variant="outline"
                  className={`${colors.bg} ${colors.text} ${colors.border} text-[10px] ${
                    !isThisVersion ? "opacity-40" : ""
                  }`}
                >
                  {env}: v{version}
                </Badge>
              )
            })}
          </div>
          <Badge
            variant="outline"
            className={`${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].bg} ${
              MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].text
            } ${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].border}`}
          >
            {MOCK_BUNDLE_META.defaults_mode === "enforce" ? (
              <Shield className="mr-1 size-3" />
            ) : (
              <Eye className="mr-1 size-3" />
            )}
            default: {MOCK_BUNDLE_META.defaults_mode}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick Stats
// ---------------------------------------------------------------------------

function QuickStats() {
  const { types } = MOCK_BUNDLE_META
  const enforceCount = MOCK_PARSED_CONTRACTS.filter((c) => c.mode === "enforce").length
  const observeCount = MOCK_PARSED_CONTRACTS.filter((c) => c.mode === "observe").length

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-medium text-foreground">{MOCK_BUNDLE_META.contract_count}</span>
      </div>
      <span className="text-muted-foreground/30">|</span>
      {Object.entries(types).map(([type, count]) => {
        if (count === 0) return null
        const colors = TYPE_COLORS[type as keyof typeof TYPE_COLORS]
        return (
          <div key={type} className="flex items-center gap-1">
            <span className={colors.text}>{count}</span>
            <span className="text-muted-foreground">{type}</span>
          </div>
        )
      })}
      <span className="text-muted-foreground/30">|</span>
      <div className="flex items-center gap-1">
        <Shield className="size-3 text-amber-400" />
        <span className="text-foreground">{enforceCount}</span>
        <span className="text-muted-foreground">enforce</span>
      </div>
      {observeCount > 0 && (
        <div className="flex items-center gap-1">
          <Eye className="size-3 text-blue-400" />
          <span className="text-foreground">{observeCount}</span>
          <span className="text-muted-foreground">observe</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contract Card
// ---------------------------------------------------------------------------

function ContractCard({ contract }: { contract: ParsedContract }) {
  const [expanded, setExpanded] = useState(false)
  const typeColors = TYPE_COLORS[contract.type]
  const effectColors = EFFECT_COLORS[contract.effect]
  const modeColors = MODE_COLORS[contract.mode]

  return (
    <Card className="overflow-hidden py-0">
      <div className={`h-0.5 ${typeColors.text.replace("text-", "bg-")}`} />
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-foreground">
                {contract.id}
              </span>
              <Badge
                variant="outline"
                className={`${typeColors.bg} ${typeColors.text} ${typeColors.border} text-[10px]`}
              >
                {contract.type}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{contract.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge
              variant="outline"
              className={`${effectColors.bg} ${effectColors.text} ${effectColors.border} text-[10px]`}
            >
              {contract.effect}
            </Badge>
            <Badge
              variant="outline"
              className={`${modeColors.bg} ${modeColors.text} ${modeColors.border} text-[10px]`}
            >
              {contract.mode}
            </Badge>
          </div>
        </div>

        {/* Tool + Tags */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">tool:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
              {contract.tool}
            </code>
          </div>
          {contract.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contract.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-border py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Hide details
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Show details
            </>
          )}
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            {/* Message */}
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Message
              </span>
              <p className="mt-1 text-sm text-foreground">{contract.message}</p>
            </div>

            {/* Sandbox details */}
            {contract.sandbox && (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Boundaries
                </span>
                <div className="mt-1 space-y-1 text-xs">
                  {contract.sandbox.within && (
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400">within:</span>
                      <span className="font-mono text-foreground">
                        {contract.sandbox.within.join(", ")}
                      </span>
                    </div>
                  )}
                  {contract.sandbox.not_within && (
                    <div className="flex items-start gap-2">
                      <span className="text-red-400">not_within:</span>
                      <span className="font-mono text-foreground">
                        {contract.sandbox.not_within.join(", ")}
                      </span>
                    </div>
                  )}
                  {contract.sandbox.commands && (
                    <div className="flex items-start gap-2">
                      <span className="text-blue-400">commands:</span>
                      <span className="font-mono text-foreground">
                        {contract.sandbox.commands.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Session limits */}
            {contract.limits && (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Limits
                </span>
                <div className="mt-1 space-y-1 text-xs">
                  {contract.limits.max_tool_calls && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">max_tool_calls:</span>
                      <span className="font-mono text-foreground">
                        {contract.limits.max_tool_calls}
                      </span>
                    </div>
                  )}
                  {contract.limits.max_attempts && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">max_attempts:</span>
                      <span className="font-mono text-foreground">
                        {contract.limits.max_attempts}
                      </span>
                    </div>
                  )}
                  {contract.limits.max_calls_per_tool && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">per-tool:</span>
                      <span className="font-mono text-foreground">
                        {Object.entries(contract.limits.max_calls_per_tool)
                          .map(([tool, limit]) => `${tool} ≤${limit}`)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V1() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FileCode2 className="size-3.5" />
            View YAML
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="size-3.5" />
            Upload
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" size="sm">
            <Rocket className="size-3.5" />
            Deploy v{MOCK_BUNDLE_META.version}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <ContractsTabBarV2 activeTab="contracts" />

      {/* Content */}
      <div className="space-y-5 px-6 pt-5 pb-6">
        {/* Bundle header */}
        <BundleHeader />

        {/* Quick stats */}
        <QuickStats />

        {/* Contract cards grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {MOCK_PARSED_CONTRACTS.map((contract) => (
            <ContractCard key={contract.id} contract={contract} />
          ))}
        </div>
      </div>
    </div>
  )
}
