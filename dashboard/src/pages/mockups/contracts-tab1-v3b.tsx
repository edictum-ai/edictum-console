// Tab 1 V3b: Grouped by Type — Multi-Bundle Composition
// Shows contracts from multiple bundles in a composition stack.
// Bundle provenance on each contract, override indicators, shadow contracts.

import { useState } from "react"
import {
  TYPE_COLORS,
  EFFECT_COLORS,
  MODE_COLORS,
  TYPE_LABELS,
  type ContractType,
  type ContractMode,
  type ContractEffect,
  type Environment,
} from "./contracts-data"
import { ContractsTabBarV2 } from "./contracts-tab-bar-v2"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Upload,
  Rocket,
  ChevronRight,
  FileCode2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Box,
  Layers,
  Eye,
  Shield,
  GitMerge,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Multi-bundle mock data
// ---------------------------------------------------------------------------

interface ComposedContract {
  id: string
  type: ContractType
  tool: string
  mode: ContractMode
  effect: ContractEffect
  summary: string
  message: string
  tags: string[]
  // Composition metadata
  source_bundle: string
  source_version: number
  is_shadow: boolean // observe_alongside contract
  overrides?: { bundle: string; version: number } // if this contract overrode another
  overridden_by?: { bundle: string; version: number } // if this contract was overridden
}

interface BundleLayer {
  name: string
  version: number
  mode: "enforce" | "observe_alongside"
  contract_count: number
}

const MOCK_COMPOSITION_STACK: BundleLayer[] = [
  { name: "org-security-base", version: 3, mode: "enforce", contract_count: 4 },
  { name: "team-api-contracts", version: 2, mode: "enforce", contract_count: 3 },
  { name: "candidate-pii-v2", version: 1, mode: "observe_alongside", contract_count: 1 },
]

const MOCK_COMPOSED_CONTRACTS: ComposedContract[] = [
  // From org-security-base (Layer 1)
  {
    id: "block-sensitive-reads",
    type: "pre",
    tool: "read_file",
    mode: "enforce",
    effect: "deny",
    summary: "Denies read_file when path contains .env, .secret, kubeconfig, credentials",
    message: "Sensitive file '{args.path}' denied.",
    tags: ["secrets", "dlp"],
    source_bundle: "org-security-base",
    source_version: 3,
    is_shadow: false,
  },
  {
    id: "block-destructive-bash",
    type: "pre",
    tool: "bash",
    mode: "enforce",
    effect: "deny",
    summary: "Denies bash when command matches rm -rf, mkfs, dd",
    message: "Destructive command denied.",
    tags: ["destructive", "safety"],
    source_bundle: "org-security-base",
    source_version: 3,
    is_shadow: false,
  },
  {
    id: "file-sandbox",
    type: "sandbox",
    tool: "read_file, write_file",
    mode: "enforce",
    effect: "deny",
    summary: "Restricts file access to /workspace and /tmp",
    message: "File access outside allowed directories.",
    tags: [],
    source_bundle: "org-security-base",
    source_version: 3,
    is_shadow: false,
  },
  {
    id: "session-limits",
    type: "session",
    tool: "all tools",
    mode: "enforce",
    effect: "deny",
    summary: "Max 100 tool calls, 200 attempts",
    message: "Session limit reached.",
    tags: ["rate-limit"],
    source_bundle: "org-security-base",
    source_version: 3,
    is_shadow: false,
    overridden_by: { bundle: "team-api-contracts", version: 2 }, // Team tightened limits
  },
  // From team-api-contracts (Layer 2) — some override org-base
  {
    id: "session-limits",
    type: "session",
    tool: "all tools",
    mode: "enforce",
    effect: "deny",
    summary: "Max 50 tool calls, 120 attempts. Per-tool: deploy ≤3",
    message: "Session limit reached. Summarize and stop.",
    tags: ["rate-limit", "api-team"],
    source_bundle: "team-api-contracts",
    source_version: 2,
    is_shadow: false,
    overrides: { bundle: "org-security-base", version: 3 },
  },
  {
    id: "prod-deploy-requires-senior",
    type: "pre",
    tool: "deploy_service",
    mode: "enforce",
    effect: "deny",
    summary: "Denies production deploys unless role is senior_engineer, sre, or admin",
    message: "Production deploys require senior role.",
    tags: ["change-control", "production"],
    source_bundle: "team-api-contracts",
    source_version: 2,
    is_shadow: false,
  },
  {
    id: "pii-in-output",
    type: "post",
    tool: "*",
    mode: "enforce",
    effect: "warn",
    summary: "Warns when output matches SSN or IBAN patterns",
    message: "PII pattern detected in output.",
    tags: ["pii", "compliance"],
    source_bundle: "team-api-contracts",
    source_version: 2,
    is_shadow: false,
  },
  // From candidate-pii-v2 (Layer 3 — shadow/observe_alongside)
  {
    id: "pii-in-output:candidate",
    type: "post",
    tool: "*",
    mode: "observe",
    effect: "redact", // Candidate version redacts instead of warns
    summary: "Shadow: Redacts SSN/IBAN patterns (candidate for promotion)",
    message: "PII pattern detected and redacted.",
    tags: ["pii", "compliance", "candidate"],
    source_bundle: "candidate-pii-v2",
    source_version: 1,
    is_shadow: true,
  },
]

// Get effective contracts (excludes overridden ones)
function getEffectiveContracts(): ComposedContract[] {
  return MOCK_COMPOSED_CONTRACTS.filter((c) => !c.overridden_by)
}

// Group by type
function groupByType(contracts: ComposedContract[]): Record<ContractType, ComposedContract[]> {
  return contracts.reduce(
    (acc, contract) => {
      acc[contract.type].push(contract)
      return acc
    },
    { pre: [], post: [], session: [], sandbox: [] } as Record<ContractType, ComposedContract[]>,
  )
}

const TYPE_ICONS: Record<ContractType, React.ReactNode> = {
  pre: <AlertTriangle className="size-4" />,
  post: <CheckCircle className="size-4" />,
  session: <Clock className="size-4" />,
  sandbox: <Box className="size-4" />,
}

// ---------------------------------------------------------------------------
// Composition Stack Header
// ---------------------------------------------------------------------------

function CompositionStackHeader() {
  const [selectedEnv, setSelectedEnv] = useState<Environment>("staging")

  const envConfigs: Record<Environment, BundleLayer[]> = {
    production: MOCK_COMPOSITION_STACK.slice(0, 2), // No candidate in prod
    staging: MOCK_COMPOSITION_STACK, // Full stack with candidate
    development: MOCK_COMPOSITION_STACK.slice(0, 1), // Just org-base
  }

  const currentStack = envConfigs[selectedEnv] ?? []
  const totalContracts = getEffectiveContracts().length
  const shadowCount = getEffectiveContracts().filter((c) => c.is_shadow).length

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Composition Stack</span>
          </div>
          <Select value={selectedEnv} onValueChange={(v) => setSelectedEnv(v as Environment)}>
            <SelectTrigger className="h-7 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="production">production</SelectItem>
              <SelectItem value="staging">staging</SelectItem>
              <SelectItem value="development">development</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{totalContracts}</span> effective contracts
          </span>
          {shadowCount > 0 && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span className="flex items-center gap-1 text-blue-400">
                <Eye className="size-3" />
                {shadowCount} shadow
              </span>
            </>
          )}
        </div>
      </div>

      {/* Layer visualization */}
      <div className="mt-4 flex items-center gap-2">
        {currentStack.map((layer, i) => {
          const isObserve = layer.mode === "observe_alongside"
          return (
            <div key={layer.name} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-1.5",
                  isObserve
                    ? "border-dashed border-blue-500/50 bg-blue-500/10"
                    : "border-border bg-muted/30"
                )}
              >
                {isObserve ? (
                  <Eye className="size-3 text-blue-400" />
                ) : (
                  <Shield className="size-3 text-amber-400" />
                )}
                <span className="font-mono text-xs text-foreground">{layer.name}</span>
                <Badge variant="outline" className="text-[10px] px-1">
                  v{layer.version}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  ({layer.contract_count})
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contract Row with Bundle Provenance
// ---------------------------------------------------------------------------

function ContractRow({
  contract,
  isExpanded,
  onToggle,
}: {
  contract: ComposedContract
  isExpanded: boolean
  onToggle: () => void
}) {
  const effectColors = EFFECT_COLORS[contract.effect]
  const modeColors = MODE_COLORS[contract.mode]

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors",
          isExpanded && "bg-muted/20",
          contract.is_shadow && "bg-blue-500/5"
        )}
      >
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground transition-transform shrink-0",
            isExpanded && "rotate-90"
          )}
        />

        {/* Bundle indicator */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] shrink-0",
            contract.is_shadow ? "bg-blue-500/20 text-blue-400" : "bg-muted text-muted-foreground"
          )}
        >
          {contract.is_shadow ? <Eye className="size-2.5" /> : <Layers className="size-2.5" />}
          <span className="font-mono">{contract.source_bundle}</span>
        </div>

        {/* Contract ID */}
        <span className="flex-1 font-mono text-sm text-foreground min-w-0 truncate">
          {contract.id}
          {contract.overrides && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-amber-400">
              <GitMerge className="size-2.5" />
              overrides
            </span>
          )}
        </span>

        {/* Tool */}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground shrink-0">
          {contract.tool}
        </code>

        {/* Mode */}
        <Badge
          variant="outline"
          className={`${modeColors.bg} ${modeColors.text} ${modeColors.border} text-[10px] shrink-0`}
        >
          {contract.mode}
        </Badge>

        {/* Effect */}
        <Badge
          variant="outline"
          className={`${effectColors.bg} ${effectColors.text} ${effectColors.border} text-[10px] shrink-0`}
        >
          {contract.effect}
        </Badge>

        {/* Tags (first 2) */}
        {contract.tags.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {contract.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-dashed border-border bg-muted/10 px-12 py-4">
          <p className="text-sm text-muted-foreground">{contract.summary}</p>

          <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Message: </span>
              <span className="text-foreground">{contract.message}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Source: </span>
              <span className="font-mono text-foreground">
                {contract.source_bundle} v{contract.source_version}
              </span>
            </div>
          </div>

          {contract.overrides && (
            <div className="mt-3 flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs">
              <GitMerge className="size-3 text-amber-400" />
              <span className="text-amber-400">
                Overrides{" "}
                <span className="font-mono">
                  {contract.overrides.bundle} v{contract.overrides.version}
                </span>
              </span>
            </div>
          )}

          {contract.is_shadow && (
            <div className="mt-3 flex items-center gap-2 rounded bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs">
              <Eye className="size-3 text-blue-400" />
              <span className="text-blue-400">
                Shadow contract — evaluates in parallel, does not affect decisions
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Type Section
// ---------------------------------------------------------------------------

function TypeSection({
  type,
  contracts,
}: {
  type: ContractType
  contracts: ComposedContract[]
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const typeColors = TYPE_COLORS[type]

  if (contracts.length === 0) return null

  const shadowCount = contracts.filter((c) => c.is_shadow).length
  const overrideCount = contracts.filter((c) => c.overrides).length

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-t-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className={typeColors.text}>{TYPE_ICONS[type]}</span>
          <span className="text-sm font-semibold text-foreground">{TYPE_LABELS[type]}s</span>
          <Badge variant="outline" className="text-xs">
            {contracts.length}
          </Badge>
          {shadowCount > 0 && (
            <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
              <Eye className="size-2.5 mr-1" />
              {shadowCount} shadow
            </Badge>
          )}
          {overrideCount > 0 && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
              <GitMerge className="size-2.5 mr-1" />
              {overrideCount} override
            </Badge>
          )}
        </div>
        <ChevronRight
          className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 border-border bg-card">
          {contracts.map((contract) => (
            <ContractRow
              key={`${contract.source_bundle}-${contract.id}`}
              contract={contract}
              isExpanded={expandedId === `${contract.source_bundle}-${contract.id}`}
              onToggle={() =>
                setExpandedId(
                  expandedId === `${contract.source_bundle}-${contract.id}`
                    ? null
                    : `${contract.source_bundle}-${contract.id}`
                )
              }
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// View Mode Toggle
// ---------------------------------------------------------------------------

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: "composed" | "layers"
  onChange: (m: "composed" | "layers") => void
}) {
  return (
    <Tabs value={mode} onValueChange={(v) => onChange(v as "composed" | "layers")}>
      <TabsList className="h-8">
        <TabsTrigger value="composed" className="text-xs px-3">
          <GitMerge className="size-3 mr-1.5" />
          Composed View
        </TabsTrigger>
        <TabsTrigger value="layers" className="text-xs px-3">
          <Layers className="size-3 mr-1.5" />
          By Layer
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// By Layer View
// ---------------------------------------------------------------------------

function ByLayerView() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {MOCK_COMPOSITION_STACK.map((layer, i) => {
        const isObserve = layer.mode === "observe_alongside"
        const layerContracts = MOCK_COMPOSED_CONTRACTS.filter(
          (c) => c.source_bundle === layer.name
        )

        return (
          <div key={layer.name} className="rounded-lg border border-border overflow-hidden">
            {/* Layer header */}
            <div
              className={cn(
                "flex items-center justify-between px-4 py-3",
                isObserve ? "bg-blue-500/10" : "bg-muted/30"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-background text-xs font-medium">
                  {i + 1}
                </div>
                {isObserve ? (
                  <Eye className="size-4 text-blue-400" />
                ) : (
                  <Shield className="size-4 text-amber-400" />
                )}
                <span className="font-mono text-sm font-medium">{layer.name}</span>
                <Badge variant="outline">v{layer.version}</Badge>
                <Badge
                  variant="outline"
                  className={
                    isObserve
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  }
                >
                  {isObserve ? "observe_alongside" : "enforce"}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {layerContracts.length} contracts
              </span>
            </div>

            {/* Layer contracts */}
            <div className="divide-y divide-border">
              {layerContracts.map((contract) => (
                <ContractRow
                  key={`${contract.source_bundle}-${contract.id}`}
                  contract={contract}
                  isExpanded={expandedId === `${contract.source_bundle}-${contract.id}`}
                  onToggle={() =>
                    setExpandedId(
                      expandedId === `${contract.source_bundle}-${contract.id}`
                        ? null
                        : `${contract.source_bundle}-${contract.id}`
                    )
                  }
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V3b() {
  const [viewMode, setViewMode] = useState<"composed" | "layers">("composed")
  const effectiveContracts = getEffectiveContracts()
  const grouped = groupByType(effectiveContracts)

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
            Deploy
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <ContractsTabBarV2 activeTab="contracts" />

      {/* Content */}
      <div className="space-y-4 px-6 pt-5 pb-6">
        {/* Composition stack header */}
        <CompositionStackHeader />

        {/* View mode toggle */}
        <div className="flex items-center justify-between">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />

          {/* Type overview pills (only in composed view) */}
          {viewMode === "composed" && (
            <div className="flex items-center gap-2">
              {(["pre", "post", "session", "sandbox"] as const).map((type) => {
                const count = grouped[type].length
                const typeColors = TYPE_COLORS[type]
                if (count === 0) return null
                return (
                  <div
                    key={type}
                    className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", typeColors.bg)}
                  >
                    <span className={typeColors.text}>{TYPE_ICONS[type]}</span>
                    <span className={typeColors.text}>{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Content based on view mode */}
        {viewMode === "composed" ? (
          <div className="space-y-4">
            <TypeSection type="pre" contracts={grouped.pre} />
            <TypeSection type="post" contracts={grouped.post} />
            <TypeSection type="session" contracts={grouped.session} />
            <TypeSection type="sandbox" contracts={grouped.sandbox} />
          </div>
        ) : (
          <ByLayerView />
        )}
      </div>
    </div>
  )
}
