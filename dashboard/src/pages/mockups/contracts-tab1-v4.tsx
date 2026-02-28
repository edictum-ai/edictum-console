// Tab 1 V4: Split View - List + Detail
// Left panel: compact contract list (ID, type icon, one-line summary).
// Right panel: full detail of selected contract (structured view + raw YAML).
// IDE-like. Good for deep inspection of individual contracts.

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
  type ParsedContract,
  type ContractType,
  type Environment,
} from "./contracts-data"
import { ContractsTabBarV2 } from "./contracts-tab-bar-v2"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  FileCode2,
  Shield,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Box,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<ContractType, React.ReactNode> = {
  pre: <AlertTriangle className="size-3.5" />,
  post: <CheckCircle className="size-3.5" />,
  session: <Clock className="size-3.5" />,
  sandbox: <Box className="size-3.5" />,
}

// ---------------------------------------------------------------------------
// Contract List Item
// ---------------------------------------------------------------------------

function ContractListItem({
  contract,
  isSelected,
  onClick,
}: {
  contract: ParsedContract
  isSelected: boolean
  onClick: () => void
}) {
  const typeColors = TYPE_COLORS[contract.type]

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors",
        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30"
      )}
    >
      <span className={typeColors.text}>{TYPE_ICONS[contract.type]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">{contract.id}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{contract.summary}</p>
      </div>
      {isSelected && <ArrowRight className="size-3.5 text-primary shrink-0" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Contract Detail Panel
// ---------------------------------------------------------------------------

function ContractDetailPanel({ contract }: { contract: ParsedContract }) {
  const typeColors = TYPE_COLORS[contract.type]
  const effectColors = EFFECT_COLORS[contract.effect]
  const modeColors = MODE_COLORS[contract.mode]

  // Get just the YAML snippet for this contract (simplified mock)
  const yamlSnippet = `- id: ${contract.id}
  type: ${contract.type}
  tool: ${contract.tool}
  mode: ${contract.mode}
  # ... (full YAML in Versions tab)`

  return (
    <Tabs defaultValue="structured" className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className={typeColors.text}>{TYPE_ICONS[contract.type]}</span>
          <span className="font-mono text-sm font-semibold text-foreground">
            {contract.id}
          </span>
          <Badge
            variant="outline"
            className={`${typeColors.bg} ${typeColors.text} ${typeColors.border} text-[10px]`}
          >
            {contract.type}
          </Badge>
        </div>
        <TabsList className="h-7">
          <TabsTrigger value="structured" className="text-xs px-2 py-1">
            Structured
          </TabsTrigger>
          <TabsTrigger value="yaml" className="text-xs px-2 py-1">
            YAML
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="structured" className="flex-1 m-0 overflow-auto">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-4">
            {/* Summary */}
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                What it does
              </h4>
              <p className="mt-1 text-sm text-foreground">{contract.summary}</p>
            </div>

            {/* Properties grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Tool
                </h4>
                <code className="mt-1 inline-block rounded bg-muted px-2 py-1 text-sm font-mono">
                  {contract.tool}
                </code>
              </div>
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Mode
                </h4>
                <div className="mt-1 flex items-center gap-2">
                  {contract.mode === "enforce" ? (
                    <Shield className="size-3.5 text-amber-400" />
                  ) : (
                    <Eye className="size-3.5 text-blue-400" />
                  )}
                  <Badge
                    variant="outline"
                    className={`${modeColors.bg} ${modeColors.text} ${modeColors.border}`}
                  >
                    {contract.mode}
                  </Badge>
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Effect
                </h4>
                <Badge
                  variant="outline"
                  className={`mt-1 ${effectColors.bg} ${effectColors.text} ${effectColors.border}`}
                >
                  {contract.effect}
                </Badge>
              </div>
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Tags
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {contract.tags.length > 0 ? (
                    contract.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No tags</span>
                  )}
                </div>
              </div>
            </div>

            {/* Message */}
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Message Template
              </h4>
              <div className="mt-1 rounded border border-border bg-muted/30 p-3">
                <p className="font-mono text-sm text-foreground">{contract.message}</p>
              </div>
            </div>

            {/* Sandbox details */}
            {contract.sandbox && (
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Sandbox Boundaries
                </h4>
                <div className="mt-2 space-y-2">
                  {contract.sandbox.within && (
                    <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                        <CheckCircle className="size-3" />
                        Allowed paths (within)
                      </div>
                      <div className="mt-1 space-y-1">
                        {contract.sandbox.within.map((path) => (
                          <code key={path} className="block text-sm font-mono text-foreground">
                            {path}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  {contract.sandbox.not_within && (
                    <div className="rounded border border-red-500/30 bg-red-500/10 p-3">
                      <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                        <AlertTriangle className="size-3" />
                        Excluded paths (not_within)
                      </div>
                      <div className="mt-1 space-y-1">
                        {contract.sandbox.not_within.map((path) => (
                          <code key={path} className="block text-sm font-mono text-foreground">
                            {path}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  {contract.sandbox.commands && (
                    <div className="rounded border border-blue-500/30 bg-blue-500/10 p-3">
                      <div className="flex items-center gap-2 text-blue-400 text-xs font-medium">
                        <Box className="size-3" />
                        Allowed commands
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {contract.sandbox.commands.map((cmd) => (
                          <code
                            key={cmd}
                            className="rounded bg-background px-1.5 py-0.5 text-xs font-mono"
                          >
                            {cmd}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Session limits */}
            {contract.limits && (
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Session Limits
                </h4>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {contract.limits.max_tool_calls && (
                    <div className="rounded border border-border p-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {contract.limits.max_tool_calls}
                      </div>
                      <div className="text-xs text-muted-foreground">max tool calls</div>
                    </div>
                  )}
                  {contract.limits.max_attempts && (
                    <div className="rounded border border-border p-3">
                      <div className="text-2xl font-semibold text-foreground">
                        {contract.limits.max_attempts}
                      </div>
                      <div className="text-xs text-muted-foreground">max attempts</div>
                    </div>
                  )}
                </div>
                {contract.limits.max_calls_per_tool && (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-2">Per-tool limits:</div>
                    <div className="space-y-1">
                      {Object.entries(contract.limits.max_calls_per_tool).map(([tool, limit]) => (
                        <div key={tool} className="flex items-center justify-between text-sm">
                          <code className="text-foreground">{tool}</code>
                          <span className="text-muted-foreground">≤ {limit} calls</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="yaml" className="flex-1 m-0 overflow-auto">
        <ScrollArea className="h-full">
          <pre className="p-4 text-xs font-mono text-foreground whitespace-pre-wrap">
            {yamlSnippet}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V4() {
  const [selectedVersion, setSelectedVersion] = useState(MOCK_BUNDLE_META.version.toString())
  const [selectedContract, setSelectedContract] = useState<ParsedContract>(
    MOCK_PARSED_CONTRACTS[0]!
  )

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FileCode2 className="size-3.5" />
            Full YAML
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

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: contract list */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col">
          {/* Bundle info */}
          <div className="border-b border-border p-4">
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
            <div className="mt-2 flex flex-wrap gap-1">
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

          {/* Contract list */}
          <ScrollArea className="flex-1">
            {MOCK_PARSED_CONTRACTS.map((contract) => (
              <ContractListItem
                key={contract.id}
                contract={contract}
                isSelected={selectedContract.id === contract.id}
                onClick={() => setSelectedContract(contract)}
              />
            ))}
          </ScrollArea>
        </div>

        {/* Right panel: contract detail */}
        <div className="flex-1 overflow-hidden">
          <ContractDetailPanel contract={selectedContract} />
        </div>
      </div>
    </div>
  )
}
