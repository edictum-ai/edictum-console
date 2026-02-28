// Tab 1 V5: Document View
// Treats the bundle like a document. Bundle header, then each contract as a full-width section
// flowing vertically — like reading a governance document. Most readable, least dense.

import { useState } from "react"
import {
  MOCK_PARSED_CONTRACTS,
  MOCK_BUNDLE_META,
  MOCK_VERSION_CONTEXT,
  MOCK_BUNDLES,
  MOCK_YAML_DEVOPS,
  TYPE_COLORS,
  EFFECT_COLORS,
  MODE_COLORS,
  ENV_COLORS,
  TYPE_LABELS,
  type ParsedContract,
  type ContractType,
  type Environment,
} from "./contracts-data"
import { ContractsTabBarV2 } from "./contracts-tab-bar-v2"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
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
} from "lucide-react"

const TYPE_ICONS: Record<ContractType, React.ReactNode> = {
  pre: <AlertTriangle className="size-4" />,
  post: <CheckCircle className="size-4" />,
  session: <Clock className="size-4" />,
  sandbox: <Box className="size-4" />,
}

// ---------------------------------------------------------------------------
// Document Header
// ---------------------------------------------------------------------------

function DocumentHeader() {
  const [selectedVersion, setSelectedVersion] = useState(MOCK_BUNDLE_META.version.toString())

  return (
    <div className="rounded-lg border border-border bg-gradient-to-r from-card to-card/50 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-2xl font-bold text-foreground">
              {MOCK_BUNDLE_META.name}
            </h2>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger className="h-8 w-20 text-sm">
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
          <p className="mt-2 text-base text-muted-foreground max-w-2xl">
            {MOCK_BUNDLE_META.description}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].bg} ${
            MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].text
          } ${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].border} text-sm px-3 py-1`}
        >
          {MOCK_BUNDLE_META.defaults_mode === "enforce" ? (
            <Shield className="mr-1.5 size-4" />
          ) : (
            <Eye className="mr-1.5 size-4" />
          )}
          {MOCK_BUNDLE_META.defaults_mode} mode
        </Badge>
      </div>

      <Separator className="my-4" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Revision: </span>
            <code className="font-mono text-foreground">{MOCK_BUNDLE_META.revision_hash}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Contracts: </span>
            <span className="font-semibold text-foreground">{MOCK_BUNDLE_META.contract_count}</span>
          </div>
          <div className="flex items-center gap-2">
            {Object.entries(MOCK_BUNDLE_META.types).map(([type, count]) => {
              if (count === 0) return null
              const colors = TYPE_COLORS[type as ContractType]
              return (
                <Badge
                  key={type}
                  variant="outline"
                  className={`${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {count} {type}
                </Badge>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {MOCK_VERSION_CONTEXT.map(({ env, version }) => {
            const colors = ENV_COLORS[env as Environment]
            const isThisVersion = version === MOCK_BUNDLE_META.version
            return (
              <Badge
                key={env}
                variant="outline"
                className={`${colors.bg} ${colors.text} ${colors.border} ${
                  !isThisVersion ? "opacity-40" : ""
                }`}
              >
                {env}: v{version}
              </Badge>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contract Section
// ---------------------------------------------------------------------------

function ContractSection({
  contract,
}: {
  contract: ParsedContract
}) {
  const typeColors = TYPE_COLORS[contract.type]
  const effectColors = EFFECT_COLORS[contract.effect]
  const modeColors = MODE_COLORS[contract.mode]

  return (
    <section className="rounded-lg border border-border bg-card">
      {/* Contract header bar */}
      <div className={`flex items-center gap-4 rounded-t-lg px-6 py-4 ${typeColors.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-lg ${typeColors.text}`}>{TYPE_ICONS[contract.type]}</span>
          <Badge variant="outline" className={`${typeColors.text} border-current`}>
            {TYPE_LABELS[contract.type]}
          </Badge>
        </div>
        <div className="flex-1">
          <h3 className="font-mono text-lg font-semibold text-foreground">{contract.id}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`${modeColors.bg} ${modeColors.text} ${modeColors.border}`}
          >
            {contract.mode === "enforce" ? (
              <Shield className="mr-1 size-3" />
            ) : (
              <Eye className="mr-1 size-3" />
            )}
            {contract.mode}
          </Badge>
          <Badge
            variant="outline"
            className={`${effectColors.bg} ${effectColors.text} ${effectColors.border}`}
          >
            {contract.effect}
          </Badge>
        </div>
      </div>

      {/* Contract body */}
      <div className="space-y-4 p-6">
        {/* Summary (the human-readable description) */}
        <div>
          <p className="text-base text-foreground leading-relaxed">{contract.summary}</p>
        </div>

        {/* Key details grid */}
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/30 p-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tool
            </div>
            <code className="mt-1 inline-block rounded bg-background px-2 py-1 text-sm font-mono">
              {contract.tool}
            </code>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Message
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{contract.message}</p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tags
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {contract.tags.length > 0 ? (
                contract.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground italic">No tags</span>
              )}
            </div>
          </div>
        </div>

        {/* Sandbox details */}
        {contract.sandbox && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Sandbox Boundaries</h4>
            <div className="grid grid-cols-2 gap-4">
              {contract.sandbox.within && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-2">
                    <CheckCircle className="size-4" />
                    Allowed Paths
                  </div>
                  <ul className="space-y-1">
                    {contract.sandbox.within.map((path) => (
                      <li key={path} className="font-mono text-sm text-foreground">
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {contract.sandbox.not_within && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
                    <AlertTriangle className="size-4" />
                    Excluded Paths
                  </div>
                  <ul className="space-y-1">
                    {contract.sandbox.not_within.map((path) => (
                      <li key={path} className="font-mono text-sm text-foreground">
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {contract.sandbox.commands && (
                <div className="col-span-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                    <Box className="size-4" />
                    Allowed Commands
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contract.sandbox.commands.map((cmd) => (
                      <code
                        key={cmd}
                        className="rounded bg-background px-2 py-1 text-sm font-mono"
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
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Session Limits</h4>
            <div className="flex items-center gap-6">
              {contract.limits.max_tool_calls && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground">
                    {contract.limits.max_tool_calls}
                  </div>
                  <div className="text-xs text-muted-foreground">max tool calls</div>
                </div>
              )}
              {contract.limits.max_attempts && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground">
                    {contract.limits.max_attempts}
                  </div>
                  <div className="text-xs text-muted-foreground">max attempts</div>
                </div>
              )}
              {contract.limits.max_calls_per_tool && (
                <div className="flex-1 rounded-lg bg-muted/30 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Per-tool limits
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(contract.limits.max_calls_per_tool).map(([tool, limit]) => (
                      <div key={tool} className="flex items-center gap-2">
                        <code className="text-sm font-mono text-foreground">{tool}</code>
                        <span className="text-muted-foreground">≤</span>
                        <span className="font-semibold text-foreground">{limit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Full YAML Dialog
// ---------------------------------------------------------------------------

function FullYamlDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileCode2 className="size-3.5" />
          View Full YAML
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono">
            {MOCK_BUNDLE_META.name} v{MOCK_BUNDLE_META.version}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] rounded-lg border border-border bg-muted/30 p-4">
          <pre className="text-xs font-mono text-foreground whitespace-pre">
            {MOCK_YAML_DEVOPS}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V5() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <div className="flex items-center gap-2">
          <FullYamlDialog />
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
      <div className="mx-auto max-w-4xl space-y-6 px-6 pt-6 pb-12">
        {/* Document header */}
        <DocumentHeader />

        {/* Contract sections */}
        {MOCK_PARSED_CONTRACTS.map((contract) => (
          <ContractSection key={contract.id} contract={contract} />
        ))}

        {/* Footer note */}
        <div className="text-center text-sm text-muted-foreground pt-4">
          <span className="font-mono">{MOCK_BUNDLE_META.contract_count}</span> contracts ·{" "}
          <span className="font-mono">{MOCK_BUNDLE_META.revision_hash}</span>
        </div>
      </div>
    </div>
  )
}
