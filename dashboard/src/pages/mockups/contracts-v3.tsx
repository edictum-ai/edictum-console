import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileCode2,
  GitCompare,
  Info,
  Layers,
  Minus,
  Rocket,
  Upload,
  Wifi,
} from "lucide-react"
import {
  type CompositionLayer,
  type ConnectedAgent,
  type Environment,
  ENV_COLORS,
  MOCK_AGENTS,
  MOCK_BUNDLES,
  MOCK_COMPOSITION_STACKS,
  MOCK_DEPLOYMENTS,
  MOCK_DIFF_LINES,
  MOCK_YAML,
  agentsByEnv,
  driftedAgents,
  onlineAgentsByEnv,
  relativeTime,
} from "./contracts-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncStatus = "in_sync" | "out_of_sync" | "not_deployed"

interface EnvSyncInfo {
  env: Environment
  status: SyncStatus
  deployedVersion: number | null
  latestVersion: number
  layers: CompositionLayer[]
  lastDeployedAt: string | null
  deployedBy: string | null
}

// ---------------------------------------------------------------------------
// Derived sync data
// ---------------------------------------------------------------------------

const LATEST_VERSION = MOCK_BUNDLES[0]!.version

function buildSyncInfo(): EnvSyncInfo[] {
  const envs: Environment[] = ["production", "staging", "development"]
  return envs.map((env) => {
    const deployment = MOCK_DEPLOYMENTS.find((d) => d.env === env)
    const bundle = deployment
      ? MOCK_BUNDLES.find((b) => b.version === deployment.bundle_version)
      : null
    const deployedVersion = bundle?.version ?? null

    let status: SyncStatus = "not_deployed"
    if (deployedVersion === LATEST_VERSION) status = "in_sync"
    else if (deployedVersion !== null) status = "out_of_sync"

    return {
      env,
      status,
      deployedVersion,
      latestVersion: LATEST_VERSION,
      layers: MOCK_COMPOSITION_STACKS[env],
      lastDeployedAt: deployment?.created_at ?? null,
      deployedBy: deployment?.deployed_by ?? null,
    }
  })
}

const SYNC_DATA = buildSyncInfo()

// ---------------------------------------------------------------------------
// Header color bars per environment
// ---------------------------------------------------------------------------

const ENV_HEADER_COLORS: Record<Environment, string> = {
  production: "bg-red-500",
  staging: "bg-amber-500",
  development: "bg-green-500",
}

// ---------------------------------------------------------------------------
// Sync status visuals
// ---------------------------------------------------------------------------

const SYNC_CONFIG: Record<
  SyncStatus,
  { label: string; ring: string; icon: React.ReactNode; bg: string }
> = {
  in_sync: {
    label: "In Sync",
    ring: "ring-emerald-500/40",
    icon: <CheckCircle2 className="size-5 text-emerald-400" />,
    bg: "bg-emerald-500/5",
  },
  out_of_sync: {
    label: "Out of Sync",
    ring: "ring-amber-500/40",
    icon: <AlertTriangle className="size-5 text-amber-400" />,
    bg: "bg-amber-500/5",
  },
  not_deployed: {
    label: "Not Deployed",
    ring: "ring-zinc-500/30",
    icon: <Minus className="size-5 text-zinc-500" />,
    bg: "",
  },
}

// ---------------------------------------------------------------------------
// YAML syntax highlighter (simple key/string/comment coloring)
// ---------------------------------------------------------------------------

function highlightYaml(yaml: string): React.ReactNode[] {
  return yaml.split("\n").map((line, i) => {
    // Comments
    if (line.trimStart().startsWith("#")) {
      return (
        <span key={i} className="text-muted-foreground">
          {line}
          {"\n"}
        </span>
      )
    }

    // Key: value lines
    const keyMatch = line.match(/^(\s*)(- )?([a-zA-Z_][a-zA-Z0-9_.]*)(:\s?)(.*)$/)
    if (keyMatch) {
      const [, indent, dash, key, colon, rest] = keyMatch
      // String values in quotes
      const stringMatch = rest?.match(/^(".*"|'.*')(.*)$/)
      if (stringMatch) {
        return (
          <span key={i}>
            {indent}
            {dash && <span className="text-foreground">{dash}</span>}
            <span className="text-blue-400">{key}</span>
            <span className="text-foreground">{colon}</span>
            <span className="text-emerald-400">{stringMatch[1]}</span>
            {stringMatch[2] && (
              <span className="text-muted-foreground">{stringMatch[2]}</span>
            )}
            {"\n"}
          </span>
        )
      }
      return (
        <span key={i}>
          {indent}
          {dash && <span className="text-foreground">{dash}</span>}
          <span className="text-blue-400">{key}</span>
          <span className="text-foreground">{colon}</span>
          <span className="text-foreground">{rest}</span>
          {"\n"}
        </span>
      )
    }

    // Array items starting with -
    const arrayMatch = line.match(/^(\s*)(- )(.*)$/)
    if (arrayMatch) {
      const [, indent, dash, rest] = arrayMatch
      return (
        <span key={i}>
          {indent}
          <span className="text-foreground">{dash}</span>
          <span className="text-foreground">{rest}</span>
          {"\n"}
        </span>
      )
    }

    return (
      <span key={i} className="text-foreground">
        {line}
        {"\n"}
      </span>
    )
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeBadge({ mode }: { mode: CompositionLayer["mode"] }) {
  if (mode === "enforce") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5"
      >
        enforce
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-blue-500/15 text-blue-400 border-blue-500/30 border-dashed text-[10px] px-1.5"
    >
      observe
    </Badge>
  )
}

function CompositionStack({ layers }: { layers: CompositionLayer[] }) {
  return (
    <div className="space-y-1.5">
      {layers.map((layer, i) => {
        const isObserve = layer.mode === "observe_alongside"
        return (
          <div
            key={i}
            className={`flex items-center justify-between rounded-md px-3 py-1.5 text-xs ${
              isObserve
                ? "border border-dashed border-blue-500/30 bg-blue-500/5"
                : "bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="size-3 text-muted-foreground" />
              <span className="font-mono text-foreground">
                {layer.bundle_name}
              </span>
              <span className="text-muted-foreground">v{layer.version}</span>
            </div>
            <ModeBadge mode={layer.mode} />
          </div>
        )
      })}
    </div>
  )
}

function EnvBadge({ env }: { env: string }) {
  const colors = ENV_COLORS[env as Environment]
  if (!colors) {
    return <Badge variant="outline">{env}</Badge>
  }
  return (
    <Badge variant="outline" className={`${colors.bg} ${colors.text} ${colors.border}`}>
      {env}
    </Badge>
  )
}

function VersionBadge({ version }: { version: number }) {
  return (
    <Badge variant="outline" className="font-mono bg-muted/50 text-foreground">
      v{version}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Agent status helpers
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: "online" | "offline" }) {
  return (
    <span
      className={`inline-block size-1.5 rounded-full shrink-0 ${
        status === "online" ? "bg-emerald-400" : "bg-zinc-500"
      }`}
    />
  )
}

function AgentVersionBadge({
  version,
  deployedVersion,
}: {
  version: number
  deployedVersion: number | null
}) {
  const isDrifted = deployedVersion !== null && version !== deployedVersion
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] px-1.5 ${
        isDrifted
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-muted/50 text-muted-foreground border-border"
      }`}
    >
      v{version}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Fleet Overview Summary Bar
// ---------------------------------------------------------------------------

function FleetOverviewBar() {
  const totalAgents = MOCK_AGENTS.length
  const onlineCount = MOCK_AGENTS.filter((a) => a.status === "online").length
  const allDrifted = SYNC_DATA.flatMap((info) =>
    info.deployedVersion !== null
      ? driftedAgents(info.env, info.deployedVersion)
      : []
  )
  const driftCount = allDrifted.length

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5 mb-4">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Fleet</span>
      </div>
      <Separator orientation="vertical" className="h-4" />
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="font-mono text-foreground">{totalAgents}</span>
        <span>agents total</span>
      </div>
      <span className="text-muted-foreground/40">·</span>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="inline-block size-2 rounded-full bg-emerald-400" />
        <span className="font-mono text-foreground">{onlineCount}</span>
        <span>online</span>
      </div>
      {driftCount > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="inline-block size-2 rounded-full bg-amber-400" />
            <span className="font-mono text-amber-400">{driftCount}</span>
            <span className="text-amber-400/80">version drift</span>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact Agent List (for sync cards, collapsible)
// ---------------------------------------------------------------------------

function CompactAgentList({
  agents,
  deployedVersion,
}: {
  agents: ConnectedAgent[]
  deployedVersion: number | null
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (agents.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
        {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </button>
      {isOpen && (
        <div className="mt-1.5 space-y-1">
          {agents.map((agent) => (
            <div
              key={agent.agent_id}
              className="flex items-center gap-2 rounded px-2 py-1 bg-muted/30"
            >
              <StatusDot status={agent.status} />
              <span className="font-mono text-xs text-foreground truncate">
                {agent.agent_id}
              </span>
              <AgentVersionBadge
                version={agent.contract_version}
                deployedVersion={deployedVersion}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fleet Status Section (inside each sync card)
// ---------------------------------------------------------------------------

function FleetStatusSection({
  env,
  deployedVersion,
  latestVersion,
  isOutOfSync,
}: {
  env: Environment
  deployedVersion: number | null
  latestVersion: number
  isOutOfSync: boolean
}) {
  const envAgents = agentsByEnv(env)
  const onlineCount = onlineAgentsByEnv(env).length
  const totalCount = envAgents.length
  const drifted = deployedVersion !== null
    ? driftedAgents(env, deployedVersion)
    : []

  if (totalCount === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Fleet Status
      </p>

      {/* Online / total count */}
      <div className="flex items-center gap-2 text-xs">
        <Wifi className="size-3 text-muted-foreground" />
        <span className="text-foreground">
          <span className="font-mono">{onlineCount}</span> online
        </span>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-muted-foreground">
          <span className="font-mono">{totalCount}</span> total
        </span>
      </div>

      {/* Impact banner: syncing will update N agents */}
      {isOutOfSync && (
        <div className="flex items-start gap-2 rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
          <Info className="size-3.5 text-blue-400 mt-0.5 shrink-0" />
          <span className="text-xs text-blue-300">
            Syncing to v{latestVersion} will update{" "}
            <span className="font-mono font-medium">{totalCount}</span> agent
            {totalCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Version drift alert */}
      {drifted.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5">
          <AlertTriangle className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-300">
            {drifted.length} agent{drifted.length !== 1 ? "s" : ""} running v
            {drifted[0]!.contract_version}
            {" "}(deployed: v{deployedVersion})
          </span>
        </div>
      )}

      {/* Collapsible agent list */}
      <CompactAgentList agents={envAgents} deployedVersion={deployedVersion} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Affected Agents Panel (for detail panel)
// ---------------------------------------------------------------------------

function AffectedAgentsPanel({
  env,
  deployedVersion,
  targetVersion,
}: {
  env: Environment
  deployedVersion: number | null
  targetVersion: number
}) {
  const envAgents = agentsByEnv(env)

  if (envAgents.length === 0) return null

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Affected Agents
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 bg-muted/50">
          {envAgents.length}
        </Badge>
      </div>
      <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
        <div className="divide-y divide-border">
          {envAgents.map((agent) => (
            <div
              key={agent.agent_id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <StatusDot status={agent.status} />
              <span className="font-mono text-xs text-foreground min-w-0 truncate flex-1">
                {agent.agent_id}
              </span>
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <AgentVersionBadge
                  version={agent.contract_version}
                  deployedVersion={deployedVersion}
                />
                <ArrowRight className="size-3 text-muted-foreground" />
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] px-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                >
                  v{targetVersion}
                </Badge>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 capitalize ${
                  agent.status === "online"
                    ? "text-emerald-400 border-emerald-500/30"
                    : "text-zinc-500 border-zinc-500/30"
                }`}
              >
                {agent.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff View
// ---------------------------------------------------------------------------

function DiffView() {
  return (
    <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-muted/50">
        <GitCompare className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          v3 vs v5 — org-base-contracts
        </span>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed">
        {MOCK_DIFF_LINES.map((line, i) => {
          let className = "text-muted-foreground"
          let prefix = " "
          if (line.type === "add") {
            className = "text-emerald-400 bg-emerald-500/10"
            prefix = "+"
          } else if (line.type === "remove") {
            className = "text-red-400 bg-red-500/10"
            prefix = "-"
          }

          return (
            <div key={i} className={`px-2 -mx-2 ${className}`}>
              <span className="inline-block w-8 text-right text-muted-foreground/50 mr-3 select-none">
                {line.lineNum}
              </span>
              <span className="select-none">{prefix} </span>
              {line.line}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// YAML View
// ---------------------------------------------------------------------------

function YamlView() {
  return (
    <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-muted/50">
        <FileCode2 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          v5 — org-base-contracts.yaml
        </span>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed">
        {highlightYaml(MOCK_YAML)}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail Panel (Diff + YAML tabs)
// ---------------------------------------------------------------------------

function DetailPanel({
  env,
  defaultTab,
  syncInfo,
  onClose,
}: {
  env: Environment
  defaultTab: "diff" | "yaml"
  syncInfo: EnvSyncInfo
  onClose: () => void
}) {
  const isOutOfSync = syncInfo.status === "out_of_sync"

  return (
    <Card className="mt-4 border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <EnvBadge env={env} />
            <span className="text-sm text-muted-foreground">
              Detail View
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronUp className="size-4" />
            Close
          </Button>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList variant="line" className="mb-3">
            <TabsTrigger value="diff">
              <GitCompare className="size-3 mr-1" />
              Diff
            </TabsTrigger>
            <TabsTrigger value="yaml">
              <FileCode2 className="size-3 mr-1" />
              YAML
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diff">
            <DiffView />
          </TabsContent>
          <TabsContent value="yaml">
            <YamlView />
          </TabsContent>
        </Tabs>

        {/* Affected Agents — shown for out-of-sync envs */}
        {isOutOfSync && (
          <AffectedAgentsPanel
            env={env}
            deployedVersion={syncInfo.deployedVersion}
            targetVersion={LATEST_VERSION}
          />
        )}

        {/* Deploy action in panel */}
        <div className="mt-4 flex justify-end">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Rocket className="size-3.5" />
            Deploy v{LATEST_VERSION} to {env}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Environment Sync Card
// ---------------------------------------------------------------------------

function EnvSyncCard({
  info,
  isExpanded,
  onToggle,
}: {
  info: EnvSyncInfo
  isExpanded: boolean
  onToggle: (tab: "diff" | "yaml") => void
}) {
  const sync = SYNC_CONFIG[info.status]

  return (
    <Card
      className={`ring-1 ${sync.ring} ${sync.bg} overflow-hidden transition-all`}
    >
      {/* Colored header bar */}
      <div className={`h-1.5 ${ENV_HEADER_COLORS[info.env]}`} />

      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base capitalize">{info.env}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {sync.icon}
            <span
              className={`text-sm font-medium ${
                info.status === "in_sync"
                  ? "text-emerald-400"
                  : info.status === "out_of_sync"
                    ? "text-amber-400"
                    : "text-zinc-500"
              }`}
            >
              {sync.label}
            </span>
          </div>
        </div>

        {/* Version status line */}
        {info.status === "out_of_sync" && info.deployedVersion !== null && (
          <div className="flex items-center gap-2 mt-1 text-xs text-amber-400/80">
            <span className="font-mono">v{info.deployedVersion}</span>
            <ArrowRight className="size-3" />
            <span className="font-mono">v{info.latestVersion} available</span>
          </div>
        )}
        {info.status === "in_sync" && (
          <p className="text-xs text-muted-foreground mt-1">
            Running latest v{info.latestVersion}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Composition stack */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Composition Stack
          </p>
          <CompositionStack layers={info.layers} />
        </div>

        <Separator />

        {/* Fleet Status */}
        <FleetStatusSection
          env={info.env}
          deployedVersion={info.deployedVersion}
          latestVersion={info.latestVersion}
          isOutOfSync={info.status === "out_of_sync"}
        />

        <Separator />

        {/* Last deployed */}
        {info.lastDeployedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>
              Deployed {relativeTime(info.lastDeployedAt)} by{" "}
              {info.deployedBy}
            </span>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-2 pt-1">
          {info.status === "out_of_sync" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggle("diff")}
                className={isExpanded ? "border-amber-500/40" : ""}
              >
                <GitCompare className="size-3.5" />
                View Diff
                {isExpanded ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="size-3.5" />
                Sync to v{LATEST_VERSION}
              </Button>
            </>
          )}
          {info.status === "in_sync" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onToggle("yaml")}
            >
              <Eye className="size-3.5" />
              View YAML
              {isExpanded ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Deployment Timeline
// ---------------------------------------------------------------------------

function DeploymentTimeline() {
  const sorted = [...MOCK_DEPLOYMENTS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="space-y-0">
      {sorted.map((dep, i) => (
        <div key={dep.id} className="flex items-start gap-3">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
              <Rocket className="size-3 text-muted-foreground" />
            </div>
            {i < sorted.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-[28px]" />
            )}
          </div>

          {/* Entry content */}
          <div className="flex flex-wrap items-center gap-2 pb-4 min-w-0">
            <EnvBadge env={dep.env} />
            <VersionBadge version={dep.bundle_version} />
            <span className="text-xs text-muted-foreground">
              by {dep.deployed_by}
            </span>
            <span className="text-xs text-muted-foreground/60 font-mono">
              {relativeTime(dep.created_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsV3() {
  const [expandedEnv, setExpandedEnv] = useState<Environment | null>(null)
  const [detailTab, setDetailTab] = useState<"diff" | "yaml">("diff")

  function handleToggle(env: Environment, tab: "diff" | "yaml") {
    if (expandedEnv === env) {
      setExpandedEnv(null)
    } else {
      setExpandedEnv(env)
      setDetailTab(tab)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <Badge
            variant="outline"
            className="font-mono bg-muted/50 text-foreground"
          >
            Latest: v{LATEST_VERSION}
          </Badge>
        </div>
        <Button>
          <Upload className="size-4" />
          Upload Contract
        </Button>
      </div>

      {/* Fleet Overview Summary Bar */}
      <FleetOverviewBar />

      {/* Section 1: Sync Status Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SYNC_DATA.map((info) => (
          <EnvSyncCard
            key={info.env}
            info={info}
            isExpanded={expandedEnv === info.env}
            onToggle={(tab) => handleToggle(info.env, tab)}
          />
        ))}
      </div>

      {/* Section 2: Expandable Detail Panel */}
      {expandedEnv && (
        <DetailPanel
          env={expandedEnv}
          defaultTab={detailTab}
          syncInfo={SYNC_DATA.find((s) => s.env === expandedEnv)!}
          onClose={() => setExpandedEnv(null)}
        />
      )}

      {/* Section 3: Recent Deployments Timeline */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent Deployments</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <DeploymentTimeline />
        </CardContent>
      </Card>
    </div>
  )
}
