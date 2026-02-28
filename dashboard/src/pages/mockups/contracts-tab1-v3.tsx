// Tab 1 V3: Grouped by Type
// Contracts organized into collapsible sections: Preconditions, Postconditions, Session, Sandbox.
// Each section shows its contracts as compact rows. Type is the primary organizer.

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
  TYPE_LABELS,
  groupContractsByType,
  type ParsedContract,
  type ContractType,
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
import {
  Upload,
  Rocket,
  ChevronRight,
  FileCode2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Box,
} from "lucide-react"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<ContractType, React.ReactNode> = {
  pre: <AlertTriangle className="size-4" />,
  post: <CheckCircle className="size-4" />,
  session: <Clock className="size-4" />,
  sandbox: <Box className="size-4" />,
}

// ---------------------------------------------------------------------------
// Bundle Header
// ---------------------------------------------------------------------------

function BundleHeader() {
  const [selectedVersion, setSelectedVersion] = useState(MOCK_BUNDLE_META.version.toString())

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            {MOCK_BUNDLE_META.name}
          </span>
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="h-6 w-16 text-xs">
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
        <Badge
          variant="outline"
          className={`${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].bg} ${
            MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].text
          } ${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].border} text-[10px]`}
        >
          default: {MOCK_BUNDLE_META.defaults_mode}
        </Badge>
      </div>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contract Row (compact)
// ---------------------------------------------------------------------------

function ContractRow({
  contract,
  isExpanded,
  onToggle,
}: {
  contract: ParsedContract
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
          "flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/30 transition-colors",
          isExpanded && "bg-muted/20"
        )}
      >
        <ChevronRight
          className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
        />
        <span className="flex-1 font-mono text-sm text-foreground">{contract.id}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {contract.tool}
        </code>
        <Badge
          variant="outline"
          className={`${modeColors.bg} ${modeColors.text} ${modeColors.border} text-[10px]`}
        >
          {contract.mode}
        </Badge>
        <Badge
          variant="outline"
          className={`${effectColors.bg} ${effectColors.text} ${effectColors.border} text-[10px]`}
        >
          {contract.effect}
        </Badge>
        {contract.tags.length > 0 && (
          <div className="flex gap-1">
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
          <div className="mt-3 space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Message: </span>
              <span className="text-foreground">{contract.message}</span>
            </div>

            {contract.sandbox && (
              <div className="space-y-1">
                {contract.sandbox.within && (
                  <div>
                    <span className="text-emerald-400">within: </span>
                    <span className="font-mono">{contract.sandbox.within.join(", ")}</span>
                  </div>
                )}
                {contract.sandbox.not_within && (
                  <div>
                    <span className="text-red-400">not_within: </span>
                    <span className="font-mono">{contract.sandbox.not_within.join(", ")}</span>
                  </div>
                )}
                {contract.sandbox.commands && (
                  <div>
                    <span className="text-blue-400">commands: </span>
                    <span className="font-mono">{contract.sandbox.commands.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            {contract.limits && (
              <div>
                <span className="text-muted-foreground">Limits: </span>
                {contract.limits.max_tool_calls && (
                  <span className="font-mono mr-3">{contract.limits.max_tool_calls} tool calls</span>
                )}
                {contract.limits.max_attempts && (
                  <span className="font-mono mr-3">{contract.limits.max_attempts} attempts</span>
                )}
                {contract.limits.max_calls_per_tool && (
                  <span className="font-mono">
                    ({Object.entries(contract.limits.max_calls_per_tool)
                      .map(([t, l]) => `${t} ≤${l}`)
                      .join(", ")})
                  </span>
                )}
              </div>
            )}
          </div>
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
  contracts: ParsedContract[]
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const typeColors = TYPE_COLORS[type]

  if (contracts.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-t-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className={typeColors.text}>{TYPE_ICONS[type]}</span>
          <span className="text-sm font-semibold text-foreground">{TYPE_LABELS[type]}s</span>
          <Badge variant="outline" className="text-xs">
            {contracts.length}
          </Badge>
        </div>
        <ChevronRight
          className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 border-border bg-card">
          {contracts.map((contract) => (
            <ContractRow
              key={contract.id}
              contract={contract}
              isExpanded={expandedId === contract.id}
              onToggle={() =>
                setExpandedId(expandedId === contract.id ? null : contract.id)
              }
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V3() {
  const grouped = groupContractsByType(MOCK_PARSED_CONTRACTS)

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
      <div className="space-y-4 px-6 pt-5 pb-6">
        {/* Bundle header */}
        <BundleHeader />

        {/* Type overview pills */}
        <div className="flex items-center gap-3">
          {(["pre", "post", "session", "sandbox"] as const).map((type) => {
            const count = grouped[type].length
            const typeColors = TYPE_COLORS[type]
            return (
              <div
                key={type}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                  count > 0 ? typeColors.bg : "bg-muted/30"
                )}
              >
                <span className={count > 0 ? typeColors.text : "text-muted-foreground"}>
                  {TYPE_ICONS[type]}
                </span>
                <span className={count > 0 ? typeColors.text : "text-muted-foreground"}>
                  {count} {TYPE_LABELS[type]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Type sections */}
        <div className="space-y-4">
          <TypeSection type="pre" contracts={grouped.pre} />
          <TypeSection type="post" contracts={grouped.post} />
          <TypeSection type="session" contracts={grouped.session} />
          <TypeSection type="sandbox" contracts={grouped.sandbox} />
        </div>
      </div>
    </div>
  )
}
