// Tab 1 V2: Contract Table
// Dense table layout with one row per contract. Sortable columns.
// Click row to expand detail. Compact — fits more contracts in viewport.

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  Rocket,
  ChevronDown,
  ChevronUp,
  FileCode2,
  ArrowUpDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Bundle Header (compact)
// ---------------------------------------------------------------------------

function BundleHeaderCompact() {
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
        <span className="text-xs text-muted-foreground">
          {MOCK_BUNDLE_META.contract_count} contracts · {MOCK_BUNDLE_META.revision_hash}
        </span>
        <Badge
          variant="outline"
          className={`${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].bg} ${
            MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].text
          } ${MODE_COLORS[MOCK_BUNDLE_META.defaults_mode].border} text-[10px]`}
        >
          {MOCK_BUNDLE_META.defaults_mode}
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
// Contract Table Row
// ---------------------------------------------------------------------------

function ContractTableRow({ contract }: { contract: ParsedContract }) {
  const [expanded, setExpanded] = useState(false)
  const typeColors = TYPE_COLORS[contract.type]
  const effectColors = EFFECT_COLORS[contract.effect]
  const modeColors = MODE_COLORS[contract.mode]

  return (
    <>
      <TableRow
        className={cn("cursor-pointer hover:bg-muted/50", expanded && "bg-muted/30")}
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono text-sm">{contract.id}</TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={`${typeColors.bg} ${typeColors.text} ${typeColors.border} text-[10px]`}
          >
            {contract.type}
          </Badge>
        </TableCell>
        <TableCell>
          <code className="text-xs text-muted-foreground">{contract.tool}</code>
        </TableCell>
        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
          {contract.summary}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={`${modeColors.bg} ${modeColors.text} ${modeColors.border} text-[10px]`}
          >
            {contract.mode}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={`${effectColors.bg} ${effectColors.text} ${effectColors.border} text-[10px]`}
          >
            {contract.effect}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {contract.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5">
                {tag}
              </Badge>
            ))}
            {contract.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{contract.tags.length - 2}
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded row */}
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="p-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: message + details */}
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Message
                  </span>
                  <p className="mt-1 text-sm text-foreground">{contract.message}</p>
                </div>

                {contract.sandbox && (
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Boundaries
                    </span>
                    <div className="mt-1 space-y-1 text-xs">
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
                  </div>
                )}

                {contract.limits && (
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Limits
                    </span>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                      {contract.limits.max_tool_calls && (
                        <div>
                          <span className="text-muted-foreground">tool_calls: </span>
                          <span className="font-mono">{contract.limits.max_tool_calls}</span>
                        </div>
                      )}
                      {contract.limits.max_attempts && (
                        <div>
                          <span className="text-muted-foreground">attempts: </span>
                          <span className="font-mono">{contract.limits.max_attempts}</span>
                        </div>
                      )}
                    </div>
                    {contract.limits.max_calls_per_tool && (
                      <div className="mt-1 text-xs">
                        <span className="text-muted-foreground">per-tool: </span>
                        <span className="font-mono">
                          {Object.entries(contract.limits.max_calls_per_tool)
                            .map(([tool, limit]) => `${tool} ≤${limit}`)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: all tags */}
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  All Tags
                </span>
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
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsTab1V2() {
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
        <BundleHeaderCompact />

        {/* Contract table */}
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead className="w-48">
                  <div className="flex items-center gap-1">
                    ID
                    <ArrowUpDown className="size-3 text-muted-foreground" />
                  </div>
                </TableHead>
                <TableHead className="w-24">
                  <div className="flex items-center gap-1">
                    Type
                    <ArrowUpDown className="size-3 text-muted-foreground" />
                  </div>
                </TableHead>
                <TableHead className="w-28">Tool</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-20">Mode</TableHead>
                <TableHead className="w-20">Effect</TableHead>
                <TableHead className="w-32">Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_PARSED_CONTRACTS.map((contract) => (
                <ContractTableRow key={contract.id} contract={contract} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
