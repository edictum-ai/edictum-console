import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Rocket,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Eye,
} from "lucide-react"
import {
  MOCK_BUNDLES,
  MOCK_COMPOSITION_STACKS,
  MOCK_YAML,
  MOCK_YAML_V3,
  MOCK_DIFF_LINES,
  MOCK_PLAYGROUND_PYTHON,
  MOCK_PLAYGROUND_OUTPUT,
  ENV_COLORS,
  relativeTime,
  type Bundle,
  type Environment,
  type CompositionLayer,
  type PlaygroundOutput,
} from "./contracts-data"

// ── YAML Syntax Highlighting ──────────────────────────────────────────

function highlightYaml(yaml: string): React.ReactNode[] {
  return yaml.split("\n").map((line, i) => {
    const parts: React.ReactNode[] = []

    // Comment lines
    if (line.trimStart().startsWith("#")) {
      parts.push(
        <span key={i} className="text-muted-foreground">
          {line}
        </span>,
      )
      return (
        <div key={i} className="leading-6">
          {parts}
        </div>
      )
    }

    // Key: value pairs
    const keyMatch = line.match(/^(\s*)(- )?([a-zA-Z_][\w.]*)(:\s?)(.*)$/)
    if (keyMatch) {
      const [, indent, dash, key, colon, rest] = keyMatch
      parts.push(<span key="indent">{indent}</span>)
      if (dash) parts.push(<span key="dash" className="text-foreground">{dash}</span>)
      parts.push(<span key="key" className="text-blue-400">{key}</span>)
      parts.push(<span key="colon" className="text-foreground">{colon}</span>)

      if (rest) {
        // Number values
        if (/^\d+$/.test(rest.trim())) {
          parts.push(<span key="val" className="text-purple-400">{rest}</span>)
        }
        // Boolean/keyword
        else if (/^(true|false|null|enforce|deny|approve|pre|post|session)$/.test(rest.trim())) {
          parts.push(<span key="val" className="text-purple-400">{rest}</span>)
        }
        // Quoted strings
        else if (rest.trimStart().startsWith('"') || rest.trimStart().startsWith("'")) {
          parts.push(<span key="val" className="text-emerald-400">{rest}</span>)
        }
        // Arrays
        else if (rest.trimStart().startsWith("[")) {
          parts.push(<span key="val" className="text-emerald-400">{rest}</span>)
        }
        // Other
        else {
          parts.push(<span key="val" className="text-foreground">{rest}</span>)
        }
      }
    }
    // Dash-only list items
    else if (line.match(/^\s*- /)) {
      const dashMatch = line.match(/^(\s*)(- )(.*)$/)
      if (dashMatch) {
        const [, indent, dash, rest] = dashMatch
        parts.push(<span key="indent">{indent}</span>)
        parts.push(<span key="dash" className="text-foreground">{dash}</span>)
        parts.push(<span key="rest" className="text-emerald-400">{rest}</span>)
      } else {
        parts.push(<span key="line">{line}</span>)
      }
    }
    // Blank / unknown lines
    else {
      parts.push(
        <span key="line" className="text-foreground">
          {line || "\u00A0"}
        </span>,
      )
    }

    return (
      <div key={i} className="leading-6">
        {parts}
      </div>
    )
  })
}

// ── Sub-components ────────────────────────────────────────────────────

function VersionItem({
  bundle,
  isSelected,
  onSelect,
}: {
  bundle: Bundle
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
        isSelected
          ? "bg-primary/10 ring-1 ring-primary/30"
          : "hover:bg-accent/50"
      }`}
    >
      <Badge
        variant="outline"
        className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-medium"
      >
        v{bundle.version}
      </Badge>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
        {bundle.revision_hash.slice(0, 14)}...
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {relativeTime(bundle.created_at)}
      </span>
    </button>
  )
}

function EnvironmentSection({
  env,
  layers,
  bundleVersion,
  isExpanded,
  onToggle,
}: {
  env: Environment
  layers: CompositionLayer[]
  bundleVersion: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const colors = ENV_COLORS[env]
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-accent/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
        <span className="font-medium capitalize text-foreground">{env}</span>
        <Badge
          variant="outline"
          className={`ml-auto h-4 rounded px-1 font-mono text-[9px] ${colors.text} ${colors.border}`}
        >
          v{bundleVersion}
        </Badge>
      </button>

      {isExpanded && (
        <div className="ml-5 mt-0.5 space-y-0.5 pb-1.5">
          {layers.map((layer) => (
            <div
              key={`${layer.bundle_name}-${layer.version}`}
              className={`flex items-center gap-2 rounded px-2 py-1 ${
                layer.mode === "observe_alongside"
                  ? "border-l-2 border-dashed border-blue-400/60"
                  : "border-l-2 border-solid border-amber-400/60"
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {layer.bundle_name}
              </span>
              <Badge
                variant="outline"
                className="h-4 rounded px-1 font-mono text-[9px] font-normal"
              >
                v{layer.version}
              </Badge>
              {layer.mode === "observe_alongside" && (
                <Badge
                  variant="outline"
                  className="h-4 rounded border-blue-500/30 bg-blue-500/10 px-1 text-[9px] text-blue-400"
                >
                  observe
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function YamlViewer({ yaml }: { yaml: string }) {
  const lines = yaml.split("\n")
  const highlighted = highlightYaml(yaml)
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden font-mono text-xs">
      {/* Line numbers gutter */}
      <div className="shrink-0 select-none border-r border-border bg-card/30 px-3 py-3 text-right">
        {lines.map((_, i) => (
          <div key={i} className="leading-6 text-[11px] text-muted-foreground/50">
            {i + 1}
          </div>
        ))}
      </div>
      {/* Code content */}
      <ScrollArea className="flex-1">
        <div className="p-3 text-[11px]">{highlighted}</div>
      </ScrollArea>
    </div>
  )
}

function DiffViewer() {
  const oldLines = MOCK_YAML_V3.split("\n")
  const newLines = MOCK_YAML.split("\n")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Diff header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">Comparing:</span>
        <Badge variant="outline" className="h-5 rounded px-1.5 font-mono text-[10px]">
          v4
        </Badge>
        <span className="text-xs text-muted-foreground">&larr;</span>
        <Badge variant="outline" className="h-5 rounded px-1.5 font-mono text-[10px]">
          v3
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          +{MOCK_DIFF_LINES.filter((l) => l.type === "add").length} lines,{" "}
          -{MOCK_DIFF_LINES.filter((l) => l.type === "remove").length} lines
        </span>
      </div>

      {/* Side-by-side diff */}
      <div className="flex min-h-0 flex-1">
        {/* Old side */}
        <ScrollArea className="flex-1 border-r border-border">
          <div className="p-3 font-mono text-[11px]">
            <div className="mb-2 text-[10px] text-muted-foreground">
              v3 — {oldLines.length} lines
            </div>
            {MOCK_DIFF_LINES.map((line, i) => {
              if (line.type === "add") return null
              return (
                <div
                  key={i}
                  className={`leading-6 ${
                    line.type === "remove"
                      ? "bg-red-500/10 text-red-300"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="inline-block w-8 select-none text-right text-muted-foreground/40">
                    {line.lineNum}
                  </span>
                  <span className="ml-2">
                    {line.type === "remove" ? "- " : "  "}
                    {line.line}
                  </span>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* New side */}
        <ScrollArea className="flex-1">
          <div className="p-3 font-mono text-[11px]">
            <div className="mb-2 text-[10px] text-muted-foreground">
              v4 — {newLines.length} lines
            </div>
            {MOCK_DIFF_LINES.map((line, i) => {
              if (line.type === "remove") return null
              return (
                <div
                  key={i}
                  className={`leading-6 ${
                    line.type === "add"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="inline-block w-8 select-none text-right text-muted-foreground/40">
                    {line.lineNum}
                  </span>
                  <span className="ml-2">
                    {line.type === "add" ? "+ " : "  "}
                    {line.line}
                  </span>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function PlaygroundOutputCard({ item }: { item: PlaygroundOutput }) {
  if (item.type === "text") {
    return (
      <div className="rounded border border-border bg-background/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
        {item.text}
      </div>
    )
  }

  if (!item.event) return null

  const isDenied = item.event.action === "call_denied"
  const isAllowed = item.event.action === "call_allowed" || item.event.action === "call_executed"

  return (
    <div
      className={`rounded border px-3 py-2 ${
        isDenied
          ? "border-red-500/30 bg-red-500/5"
          : isAllowed
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border bg-card/50"
      }`}
    >
      <div className="flex items-center gap-2">
        {isDenied ? (
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <span
          className={`text-xs font-medium ${
            isDenied ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {item.event.action.replace("_", " ")}
        </span>
        <Badge
          variant="outline"
          className="ml-auto h-4 rounded px-1 font-mono text-[9px] font-normal"
        >
          {item.event.tool_name}
        </Badge>
      </div>
      {item.event.decision_name && (
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          contract: {item.event.decision_name}
        </div>
      )}
      {item.event.reason && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {item.event.reason}
        </div>
      )}
    </div>
  )
}

function PlaygroundPanel() {
  const pythonLines = MOCK_PLAYGROUND_PYTHON.split("\n")
  const pythonHighlighted = pythonLines.map((line, i) => {
    // Simple Python highlighting
    const commentIdx = line.indexOf("#")
    if (commentIdx === 0 || (commentIdx > 0 && line[commentIdx - 1] === " ")) {
      const before = line.slice(0, commentIdx)
      const comment = line.slice(commentIdx)
      return (
        <div key={i} className="leading-6">
          <span className="text-foreground">{before}</span>
          <span className="text-muted-foreground">{comment}</span>
        </div>
      )
    }
    // Keywords
    const keywordRegex = /\b(from|import|as|try|except|await|print|def|class|return|if|else)\b/g
    const stringRegex = /(["'`])((?:(?!\1).)*)\1/g
    const parts: React.ReactNode[] = []

    // Simple approach: just color keywords inline
    const tokens = line.split(/(\b(?:from|import|as|try|except|await|print|def|class|return|if|else)\b|(?:f?"[^"]*"|'[^']*'))/g)
    tokens.forEach((token: string, j: number) => {
      if (keywordRegex.test(token)) {
        keywordRegex.lastIndex = 0
        parts.push(<span key={j} className="text-purple-400">{token}</span>)
      } else if (stringRegex.test(token)) {
        stringRegex.lastIndex = 0
        parts.push(<span key={j} className="text-emerald-400">{token}</span>)
      } else {
        parts.push(<span key={j} className="text-foreground">{token}</span>)
      }
    })

    return (
      <div key={i} className="leading-6">
        {parts}
      </div>
    )
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Playground toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Contract Playground</span>
        <span className="text-[10px] text-muted-foreground">
          Pyodide runtime — evaluate contracts in the browser
        </span>
        <Button
          variant="default"
          size="sm"
          className="ml-auto h-6 gap-1 bg-emerald-600 px-2.5 text-[10px] font-medium hover:bg-emerald-700"
        >
          <Play className="h-3 w-3" />
          Run
        </Button>
      </div>

      {/* Three-panel playground */}
      <div className="flex min-h-0 flex-1">
        {/* Left: YAML (read-only) */}
        <div className="flex w-[40%] shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">
              contracts.yaml (read-only)
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 font-mono text-[10px]">
              {highlightYaml(MOCK_YAML)}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Code + Output stacked */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Code editor */}
          <div className="flex flex-1 flex-col border-b border-border">
            <div className="border-b border-border px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                test_contracts.py
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 font-mono text-[10px]">{pythonHighlighted}</div>
            </ScrollArea>
          </div>

          {/* Output panel */}
          <div className="flex h-[45%] shrink-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                Output
              </span>
              <Badge
                variant="outline"
                className="h-4 rounded px-1 text-[9px] font-normal text-emerald-400"
              >
                {MOCK_PLAYGROUND_OUTPUT.length} events
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1.5 p-3">
                {MOCK_PLAYGROUND_OUTPUT.map((item, i) => (
                  <PlaygroundOutputCard key={i} item={item} />
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function ContractsV2() {
  const [selectedVersion, setSelectedVersion] = useState(4)
  const [activeTab, setActiveTab] = useState<"yaml" | "diff" | "playground">("yaml")
  const [expandedEnvs, setExpandedEnvs] = useState<Set<Environment>>(
    new Set(["production", "staging"]),
  )

  const selectedBundle = MOCK_BUNDLES.find((b) => b.version === selectedVersion)

  const toggleEnv = (env: Environment) => {
    setExpandedEnvs((prev) => {
      const next = new Set(prev)
      if (next.has(env)) {
        next.delete(env)
      } else {
        next.add(env)
      }
      return next
    })
  }

  // Determine which bundle version is deployed per env
  const envVersions: Record<Environment, number> = {
    production: 3,
    staging: 4,
    development: 5,
  }

  return (
    <div className="flex h-full">
      {/* ── Left Pane: Contract Explorer ──────────────────────────── */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card/50">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="text-xs font-semibold text-foreground">Contracts</span>
          <Badge
            variant="outline"
            className="h-4 rounded px-1.5 text-[9px] font-normal text-muted-foreground"
          >
            {MOCK_BUNDLES.length} versions
          </Badge>
        </div>

        {/* Bundle version list */}
        <div className="border-b border-border">
          <div className="px-3 pb-1 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bundle Versions
            </span>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-0.5 px-2 pb-2">
              {MOCK_BUNDLES.map((bundle) => (
                <VersionItem
                  key={bundle.version}
                  bundle={bundle}
                  isSelected={bundle.version === selectedVersion}
                  onSelect={() => setSelectedVersion(bundle.version)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Environments / Composition Stacks */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 pb-1 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Environments
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-2 pb-2">
              {(Object.keys(MOCK_COMPOSITION_STACKS) as Environment[]).map((env) => (
                <EnvironmentSection
                  key={env}
                  env={env}
                  layers={MOCK_COMPOSITION_STACKS[env]}
                  bundleVersion={envVersions[env]}
                  isExpanded={expandedEnvs.has(env)}
                  onToggle={() => toggleEnv(env)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Legend */}
        <div className="border-t border-border px-3 py-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-0.5 rounded-full border-l-2 border-solid border-amber-400/60" />
              <span className="text-[10px] text-muted-foreground">enforce mode</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-0.5 rounded-full border-l-2 border-dashed border-blue-400/60" />
              <Eye className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] text-muted-foreground">observe mode</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider handle ────────────────────────────────────────── */}
      <div className="group flex w-[1px] shrink-0 cursor-col-resize items-center justify-center bg-border hover:bg-primary/30">
        <div className="h-8 w-1 rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* ── Right Pane: Editor/Viewer ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Tab bar + actions */}
        <div className="flex items-center border-b border-border">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "yaml" | "diff" | "playground")}
            className="px-2"
          >
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger
                value="yaml"
                className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                YAML
              </TabsTrigger>
              <TabsTrigger
                value="diff"
                className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Diff
              </TabsTrigger>
              <TabsTrigger
                value="playground"
                className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Playground
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-1.5 px-3">
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11px]"
            >
              <Rocket className="h-3 w-3" />
              Deploy to...
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 border-b border-border bg-card/30 px-3 py-1.5">
          <span className="font-mono text-[10px] text-foreground">
            org-base-contracts v{selectedVersion}
          </span>
          <span className="text-[10px] text-muted-foreground">&mdash;</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {selectedBundle?.revision_hash}
          </span>
          <span className="text-[10px] text-muted-foreground">&mdash;</span>
          <span className="text-[10px] text-muted-foreground">
            Uploaded {selectedBundle ? relativeTime(selectedBundle.created_at) : ""} by{" "}
            {selectedBundle?.uploaded_by}
          </span>
          {selectedBundle && selectedBundle.deployed_envs.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">&mdash;</span>
              {selectedBundle.deployed_envs.map((env) => {
                const colors = ENV_COLORS[env as Environment]
                return (
                  <Badge
                    key={env}
                    variant="outline"
                    className={`h-4 rounded px-1 text-[9px] capitalize ${colors.text} ${colors.border} ${colors.bg}`}
                  >
                    {env}
                  </Badge>
                )
              })}
            </>
          )}
        </div>

        {/* Content area — switches based on tab */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab === "yaml" && (
            <YamlViewer yaml={selectedVersion >= 4 ? MOCK_YAML : MOCK_YAML_V3} />
          )}
          {activeTab === "diff" && <DiffViewer />}
          {activeTab === "playground" && <PlaygroundPanel />}
        </div>
      </div>
    </div>
  )
}
