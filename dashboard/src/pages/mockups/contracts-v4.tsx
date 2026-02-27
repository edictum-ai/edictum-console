import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChevronDown,
  Eye,
  FileCode,
  GitCompare,
  Layers,
  Play,
  Rocket,
  Shield,
  Upload,
} from "lucide-react"
import {
  type CompositionLayer,
  type Deployment,
  type Environment,
  ENV_COLORS,
  ENVIRONMENTS,
  MOCK_BUNDLES,
  MOCK_COMPOSITION_STACKS,
  MOCK_DEPLOYMENTS,
  MOCK_DIFF_LINES,
  MOCK_YAML,
  relativeTime,
} from "./contracts-data"

// ---------------------------------------------------------------------------
// Timeline events: merge deployments + uploads, sorted newest first
// ---------------------------------------------------------------------------

interface TimelineEntry {
  id: string
  kind: "deployment" | "upload"
  env?: string
  version: number
  actor: string
  timestamp: string
  revision?: string
}

function buildTimeline(): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  MOCK_DEPLOYMENTS.forEach((d: Deployment) => {
    const bundle = MOCK_BUNDLES.find((b) => b.version === d.bundle_version)
    entries.push({
      id: d.id,
      kind: "deployment",
      env: d.env,
      version: d.bundle_version,
      actor: d.deployed_by,
      timestamp: d.created_at,
      revision: bundle?.revision_hash,
    })
  })

  MOCK_BUNDLES.forEach((b) => {
    entries.push({
      id: `upload-v${b.version}`,
      kind: "upload",
      version: b.version,
      actor: b.uploaded_by,
      timestamp: b.created_at,
      revision: b.revision_hash,
    })
  })

  entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  return entries
}

const TIMELINE = buildTimeline()

// ---------------------------------------------------------------------------
// YAML syntax highlighting (simple line-based)
// ---------------------------------------------------------------------------

function YamlLine({ text, num }: { text: string; num: number }) {
  const parts: React.ReactNode[] = []
  // Comment
  if (text.trimStart().startsWith("#")) {
    parts.push(
      <span key="c" className="text-muted-foreground">
        {text}
      </span>
    )
  } else {
    // Key: value split
    const colonIdx = text.indexOf(":")
    if (colonIdx > 0 && !text.trimStart().startsWith("-")) {
      const key = text.slice(0, colonIdx)
      const rest = text.slice(colonIdx)
      parts.push(
        <span key="k" className="text-blue-400">
          {key}
        </span>
      )
      // String values in quotes
      const quoted = rest.match(/^:\s*(".*?")/)?.[1]
      if (quoted) {
        const before = rest.slice(0, rest.indexOf(quoted))
        const after = rest.slice(rest.indexOf(quoted) + quoted.length)
        parts.push(<span key="b">{before}</span>)
        parts.push(
          <span key="s" className="text-emerald-400">
            {quoted}
          </span>
        )
        parts.push(<span key="a">{after}</span>)
      } else {
        parts.push(<span key="r">{rest}</span>)
      }
    } else {
      parts.push(<span key="t">{text}</span>)
    }
  }

  return (
    <div className="flex">
      <span className="mr-4 w-6 shrink-0 select-none text-right text-muted-foreground/40">
        {num}
      </span>
      <span className="flex-1">{parts}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff viewer
// ---------------------------------------------------------------------------

function DiffViewer() {
  return (
    <div className="font-mono text-xs leading-relaxed">
      {MOCK_DIFF_LINES.map((line, i) => {
        let bg = ""
        let prefix = " "
        let textColor = "text-foreground/80"
        if (line.type === "add") {
          bg = "bg-emerald-500/10"
          prefix = "+"
          textColor = "text-emerald-400"
        } else if (line.type === "remove") {
          bg = "bg-red-500/10"
          prefix = "-"
          textColor = "text-red-400"
        }
        return (
          <div key={i} className={`flex ${bg} px-2`}>
            <span className="mr-3 w-6 shrink-0 select-none text-right text-muted-foreground/40">
              {line.lineNum}
            </span>
            <span className="mr-2 w-3 shrink-0 select-none text-muted-foreground/60">
              {prefix}
            </span>
            <span className={textColor}>{line.line}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline entry card
// ---------------------------------------------------------------------------

function TimelineDot({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "upload") {
    return (
      <div className="relative z-10 flex size-3 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 bg-background" />
    )
  }
  const env = entry.env as Environment
  const colors = ENV_COLORS[env]
  return (
    <div
      className={`relative z-10 size-3 rounded-full ${colors.dot} ring-2 ring-background`}
    />
  )
}

function TimelineCard({
  entry,
  isSelected,
  onSelect,
}: {
  entry: TimelineEntry
  isSelected: boolean
  onSelect: () => void
}) {
  if (entry.kind === "upload") {
    return (
      <div className="ml-2 flex items-center gap-2 py-1">
        <Upload className="size-3 text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground/60">
          v{entry.version} uploaded by {entry.actor}
        </span>
        <span className="text-xs text-muted-foreground/40 font-mono">
          {relativeTime(entry.timestamp)}
        </span>
      </div>
    )
  }

  const env = entry.env as Environment
  const colors = ENV_COLORS[env]

  return (
    <Card
      className={`ml-2 cursor-pointer transition-colors ${
        isSelected ? "border-foreground/30 bg-muted/50" : "hover:bg-muted/30"
      }`}
      onClick={onSelect}
    >
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${colors.bg} ${colors.text} ${colors.border} text-[10px] px-1.5`}
            >
              {env}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5">
              v{entry.version}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground/60 font-mono">
            {relativeTime(entry.timestamp)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-medium">org-base-contracts</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{entry.actor}</span>
            {entry.revision && (
              <span className="font-mono text-[11px]">{entry.revision}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
              }}
            >
              <FileCode className="size-3" />
              YAML
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
              }}
            >
              <GitCompare className="size-3" />
              Diff
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Composition stack panel
// ---------------------------------------------------------------------------

function StackLayer({
  layer,
  index,
  total,
}: {
  layer: CompositionLayer
  index: number
  total: number
}) {
  const isObserve = layer.mode === "observe_alongside"
  const indent = index * 8
  const widthPercent = 100 - index * 4
  const levelLabel = index === 0 ? "base" : index === 1 ? "team" : "candidate"

  return (
    <div style={{ paddingLeft: `${indent}px`, width: `${widthPercent}%` }}>
      <div
        className={`rounded-md border px-3 py-2 ${
          isObserve
            ? "border-dashed border-blue-500/40 bg-blue-500/5"
            : "border-amber-500/30 bg-amber-500/5 border-l-2 border-l-amber-500"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isObserve ? (
              <Eye className="size-3 text-blue-400" />
            ) : (
              <Shield className="size-3 text-amber-400" />
            )}
            <span className="text-xs font-medium">{layer.bundle_name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[10px] px-1">
              v{layer.version}
            </Badge>
            {isObserve ? (
              <Badge
                variant="outline"
                className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] px-1"
              >
                observe
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1"
              >
                enforce
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          Layer {index + 1}/{total} — {levelLabel}
        </div>
      </div>
    </div>
  )
}

function CompositionPanel({ env }: { env: Environment }) {
  const colors = ENV_COLORS[env]
  const layers = MOCK_COMPOSITION_STACKS[env]
  const latestVersion = MOCK_BUNDLES[0]!.version
  const deployedVersion = layers[0]?.version ?? 0
  const isLatest = deployedVersion === latestVersion

  return (
    <Card className="overflow-hidden">
      {/* Colored header bar */}
      <div className={`h-1 ${colors.dot}`} />
      <CardHeader className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${colors.dot}`} />
            <CardTitle className="text-sm capitalize">{env}</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5">
              v{deployedVersion}
            </Badge>
          </div>
          {!isLatest && (
            <Button
              size="xs"
              variant="outline"
              className="h-6 text-[10px] gap-1"
            >
              <Rocket className="size-3" />
              Deploy v{latestVersion}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="flex flex-col gap-1.5">
          {/* Render layers bottom-up visually: reverse order so base is at bottom */}
          {[...layers].reverse().map((layer, i) => (
            <StackLayer
              key={layer.bundle_name}
              layer={layer}
              index={layers.length - 1 - i}
              total={layers.length}
            />
          ))}
        </div>
        {layers.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No contracts deployed
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Bottom detail panel (YAML / Diff)
// ---------------------------------------------------------------------------

function DetailPanel({
  entry,
  onClose,
}: {
  entry: TimelineEntry
  onClose: () => void
}) {
  const yamlLines = MOCK_YAML.split("\n")

  return (
    <Card className="mt-4">
      <CardHeader className="px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">
              org-base-contracts v{entry.version}
            </CardTitle>
            {entry.revision && (
              <span className="font-mono text-xs text-muted-foreground">
                {entry.revision}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={onClose}
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <Tabs defaultValue="yaml">
          <TabsList variant="line" className="mb-3">
            <TabsTrigger value="yaml">
              <FileCode className="mr-1 size-3" />
              YAML
            </TabsTrigger>
            <TabsTrigger value="diff">
              <GitCompare className="mr-1 size-3" />
              Diff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="yaml">
            <ScrollArea className="h-64 rounded-md border bg-muted/30 p-3">
              <div className="font-mono text-xs leading-relaxed">
                {yamlLines.map((line, i) => (
                  <YamlLine key={i} text={line} num={i + 1} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="diff">
            <ScrollArea className="h-64 rounded-md border bg-muted/30 p-1">
              <DiffViewer />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsV4() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedEntry = TIMELINE.find((e) => e.id === selectedId) ?? null

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground">
            Deployment timeline and composition stacks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="mr-1.5 size-3.5" />
            Upload Contract
          </Button>
          <Button variant="outline" size="sm">
            <Play className="mr-1.5 size-3.5" />
            Playground
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left: Deployment Timeline */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            <Rocket className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Deployment Timeline</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {TIMELINE.length} events
            </Badge>
          </div>

          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

              <div className="flex flex-col gap-2">
                {TIMELINE.map((entry) => (
                  <div key={entry.id} className="relative flex items-start gap-3">
                    {/* Dot */}
                    <div className="mt-3 flex shrink-0 items-center justify-center">
                      <TimelineDot entry={entry} />
                    </div>

                    {/* Card */}
                    <div className="min-w-0 flex-1">
                      <TimelineCard
                        entry={entry}
                        isSelected={selectedId === entry.id}
                        onSelect={() =>
                          setSelectedId(
                            selectedId === entry.id ? null : entry.id
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right: Composition Stacks */}
        <div className="w-[380px] shrink-0">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Composition Stacks</h2>
          </div>

          <div className="flex flex-col gap-3">
            {ENVIRONMENTS.map((env) => (
              <CompositionPanel key={env} env={env} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom detail panel */}
      {selectedEntry && selectedEntry.kind === "deployment" && (
        <DetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
