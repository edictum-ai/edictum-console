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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  Copy,
  Eye,
  FileCode2,
  GitCompare,
  Layers,
  MoreHorizontal,
  Play,
  Rocket,
  ShieldCheck,
  ShieldX,
  Upload,
  User,
} from "lucide-react"
import {
  type Bundle,
  type CompositionLayer,
  type ConnectedAgent,
  type Environment,
  type PlaygroundOutput,
  ENVIRONMENTS,
  ENV_COLORS,
  MOCK_BUNDLES,
  MOCK_COMPOSITION_STACKS,
  MOCK_DEPLOYMENTS,
  MOCK_YAML,
  MOCK_DIFF_LINES,
  MOCK_PLAYGROUND_PYTHON,
  MOCK_PLAYGROUND_OUTPUT,
  agentsByEnv,
  agentsByVersion,
  driftedAgents,
  relativeTime,
} from "./contracts-data"

// ---------------------------------------------------------------------------
// YAML syntax highlighter
// ---------------------------------------------------------------------------

const YAML_KEYWORDS = [
  "apiVersion",
  "kind",
  "metadata",
  "contracts",
  "defaults",
  "name",
  "description",
  "mode",
  "id",
  "type",
  "tool",
  "when",
  "then",
  "effect",
  "message",
  "tags",
  "timeout",
  "timeout_effect",
  "limits",
  "max_tool_calls",
  "max_attempts",
  "all",
  "args\\.path",
  "args\\.command",
  "environment",
  "contains_any",
  "contains",
  "equals",
]

function highlightYaml(yaml: string): React.ReactNode[] {
  return yaml.split("\n").map((line, i) => {
    let highlighted = line
      // Comments
      .replace(/(#.*)$/g, '<span class="text-muted-foreground">$1</span>')
      // String values in quotes
      .replace(
        /("(?:[^"\\]|\\.)*")/g,
        '<span class="text-emerald-400">$1</span>'
      )
      // Keywords (YAML keys before colon)
      .replace(
        new RegExp(`\\b(${YAML_KEYWORDS.join("|")})(\\s*:)`, "g"),
        '<span class="text-blue-400">$1</span>$2'
      )
      // Values after effect:
      .replace(
        /\b(deny|approve|enforce|observe_alongside)\b/g,
        '<span class="text-amber-400">$1</span>'
      )
      // Brackets
      .replace(
        /(\[.*?\])/g,
        '<span class="text-emerald-400">$1</span>'
      )

    return (
      <div key={i} className="flex">
        <span className="w-8 shrink-0 select-none text-right pr-3 text-muted-foreground/40">
          {i + 1}
        </span>
        <span dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    )
  })
}

// ---------------------------------------------------------------------------
// Environment Deployment Card
// ---------------------------------------------------------------------------

function EnvDeploymentCard({ env }: { env: Environment }) {
  const [showAllAgents, setShowAllAgents] = useState(false)
  const colors = ENV_COLORS[env]
  const stack = MOCK_COMPOSITION_STACKS[env]
  const deployment = MOCK_DEPLOYMENTS.find((d) => d.env === env)
  const bundle = deployment
    ? MOCK_BUNDLES.find((b) => b.version === deployment.bundle_version)
    : null

  const envAgents = agentsByEnv(env)
  const onlineCount = envAgents.filter((a) => a.status === "online").length
  const expectedVersion = deployment?.bundle_version ?? 0
  const drifted = driftedAgents(env, expectedVersion)
  const visibleAgents = showAllAgents ? envAgents : envAgents.slice(0, 3)
  const hiddenCount = envAgents.length - 3

  return (
    <Card className={`${colors.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${colors.bg} ${colors.text} ${colors.border} capitalize`}
            >
              {env}
            </Badge>
            {bundle && (
              <span className="text-sm font-mono font-semibold">
                v{bundle.version}
              </span>
            )}
          </div>
          {deployment && (
            <span className="text-xs text-muted-foreground">
              {relativeTime(deployment.created_at)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5">
          {stack.map((layer, idx) => (
            <CompositionLayerRow key={idx} layer={layer} />
          ))}
        </div>

        {/* Agent fleet section */}
        {envAgents.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <Bot className="size-3 text-muted-foreground" />
              <span className="text-xs font-medium">
                {envAgents.length} agent{envAgents.length !== 1 ? "s" : ""} connected
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
                {onlineCount} online
              </span>
            </div>

            {/* Version drift warning */}
            {drifted.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1">
                <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                <span className="text-[11px] text-amber-400">
                  {drifted.length} agent{drifted.length !== 1 ? "s" : ""} on v{drifted[0]!.contract_version} (expected v{expectedVersion})
                </span>
              </div>
            )}

            {/* Agent list */}
            <div className="space-y-0.5">
              {visibleAgents.map((agent) => (
                <AgentRow
                  key={agent.agent_id}
                  agent={agent}
                  expectedVersion={expectedVersion}
                />
              ))}
              {hiddenCount > 0 && !showAllAgents && (
                <button
                  onClick={() => setShowAllAgents(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors pl-4"
                >
                  +{hiddenCount} more
                </button>
              )}
              {showAllAgents && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllAgents(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors pl-4"
                >
                  show less
                </button>
              )}
            </div>
          </div>
        )}

        {deployment && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <User className="size-3" />
            <span>{deployment.deployed_by}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgentRow({
  agent,
  expectedVersion,
}: {
  agent: ConnectedAgent
  expectedVersion: number
}) {
  const isDrifted = agent.contract_version !== expectedVersion

  return (
    <div className="flex items-center gap-2 rounded px-2 py-0.5 text-[11px]">
      <span
        className={`inline-block size-1.5 rounded-full shrink-0 ${
          agent.status === "online" ? "bg-emerald-400" : "bg-zinc-500"
        }`}
      />
      <span className="font-mono text-xs truncate">{agent.agent_id}</span>
      <span className="ml-auto text-muted-foreground shrink-0">
        v{agent.contract_version}
      </span>
      {isDrifted && (
        <AlertTriangle className="size-2.5 text-amber-400 shrink-0" />
      )}
    </div>
  )
}

function CompositionLayerRow({ layer }: { layer: CompositionLayer }) {
  const isObserve = layer.mode === "observe_alongside"

  return (
    <div
      className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${
        isObserve
          ? "border-dashed border-blue-500/30 bg-blue-500/5"
          : "border-amber-500/20 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <Layers className={`size-3 ${isObserve ? "text-blue-400" : "text-amber-400"}`} />
        <span className="text-sm font-mono">{layer.bundle_name}</span>
        <span className="text-xs text-muted-foreground">v{layer.version}</span>
      </div>
      <Badge
        variant="outline"
        className={
          isObserve
            ? "bg-blue-500/15 text-blue-400 border-blue-500/25 text-[10px]"
            : "bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px]"
        }
      >
        {isObserve ? "observe" : "enforce"}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Version Table
// ---------------------------------------------------------------------------

function VersionTable({
  selectedVersion,
  onSelectVersion,
}: {
  selectedVersion: number | null
  onSelectVersion: (v: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Version</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Revision Hash</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Uploaded By</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Uploaded</th>
            {ENVIRONMENTS.map((env) => (
              <th key={env} className="px-3 py-2 text-center font-medium text-muted-foreground capitalize">
                {env.slice(0, 4)}
              </th>
            ))}
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Agents</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_BUNDLES.map((bundle) => (
            <tr
              key={bundle.version}
              onClick={() => onSelectVersion(bundle.version)}
              className={`cursor-pointer border-b transition-colors hover:bg-muted/20 ${
                selectedVersion === bundle.version ? "bg-muted/30" : ""
              }`}
            >
              <td className="px-3 py-2 font-mono font-semibold">v{bundle.version}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {bundle.revision_hash}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {bundle.uploaded_by}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {relativeTime(bundle.created_at)}
              </td>
              {ENVIRONMENTS.map((env) => (
                <td key={env} className="px-3 py-2 text-center">
                  {bundle.deployed_envs.includes(env) ? (
                    <span
                      className={`inline-block size-2.5 rounded-full ${ENV_COLORS[env].dot}`}
                    />
                  ) : (
                    <span className="inline-block size-2.5 rounded-full bg-muted" />
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <VersionAgentCount version={bundle.version} />
              </td>
              <td className="px-3 py-2 text-right">
                <VersionActions bundle={bundle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VersionActions({ bundle }: { bundle: Bundle }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <FileCode2 className="size-3.5" />
          View YAML
        </DropdownMenuItem>
        <DropdownMenuItem>
          <GitCompare className="size-3.5" />
          Compare
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Rocket className="size-3.5" />
          Deploy to...
        </DropdownMenuItem>
        {bundle.deployed_envs.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              <Clock className="size-3.5" />
              Rollback (not available)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function VersionAgentCount({ version }: { version: number }) {
  const agents = agentsByVersion(version)
  if (agents.length === 0) {
    return <span className="text-xs text-muted-foreground">&mdash;</span>
  }

  // Check if any agent running this version is drifted (the deployed version
  // for their environment is different from this version)
  const hasDrift = agents.some((agent) => {
    const envDeployment = MOCK_DEPLOYMENTS.find((d) => d.env === agent.env)
    return envDeployment && envDeployment.bundle_version !== version
  })

  return (
    <span className={`text-xs ${hasDrift ? "text-amber-400" : "text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1">
        {hasDrift && <AlertTriangle className="size-2.5" />}
        {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Detail Panel Tabs
// ---------------------------------------------------------------------------

function YamlTab() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10">
        <Button variant="ghost" size="xs" onClick={handleCopy}>
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ScrollArea className="h-[320px] rounded-md border bg-muted/20">
        <pre className="p-4 text-xs font-mono leading-relaxed">
          {highlightYaml(MOCK_YAML)}
        </pre>
      </ScrollArea>
    </div>
  )
}

function DiffTab() {
  const [compareVersion, setCompareVersion] = useState("3")

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Comparing v5 with</span>
        <Select value={compareVersion} onValueChange={setCompareVersion}>
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOCK_BUNDLES.filter((b) => b.version !== 5).map((b) => (
              <SelectItem key={b.version} value={String(b.version)}>
                v{b.version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="h-[280px] rounded-md border bg-muted/20">
        <pre className="p-4 text-xs font-mono leading-relaxed">
          {MOCK_DIFF_LINES.map((dl, i) => {
            let lineClass = "text-muted-foreground"
            let prefix = " "
            let bgClass = ""

            if (dl.type === "add") {
              lineClass = "text-emerald-400"
              prefix = "+"
              bgClass = "bg-emerald-500/10"
            } else if (dl.type === "remove") {
              lineClass = "text-red-400"
              prefix = "-"
              bgClass = "bg-red-500/10"
            }

            return (
              <div key={i} className={`flex ${bgClass}`}>
                <span className="w-8 shrink-0 select-none text-right pr-3 text-muted-foreground/40">
                  {dl.lineNum}
                </span>
                <span className={`w-4 shrink-0 select-none ${lineClass}`}>{prefix}</span>
                <span className={lineClass}>{dl.line}</span>
              </div>
            )
          })}
        </pre>
      </ScrollArea>
    </div>
  )
}

function PlaygroundTab() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Left: YAML content */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="size-3" />
          contracts.yaml
        </div>
        <ScrollArea className="h-[260px] rounded-md border bg-muted/20">
          <pre className="p-3 text-[11px] font-mono leading-relaxed">
            {highlightYaml(MOCK_YAML)}
          </pre>
        </ScrollArea>
      </div>
      {/* Right: Python code + Output */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Play className="size-3" />
          test_contracts.py
        </div>
        <ScrollArea className="h-[120px] rounded-md border bg-muted/20">
          <pre className="p-3 text-[11px] font-mono leading-relaxed text-blue-300">
            {MOCK_PLAYGROUND_PYTHON}
          </pre>
        </ScrollArea>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Output
        </div>
        <ScrollArea className="h-[120px] rounded-md border bg-muted/20">
          <div className="space-y-2 p-3">
            {MOCK_PLAYGROUND_OUTPUT.map((output, i) => (
              <PlaygroundOutputCard key={i} output={output} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function PlaygroundOutputCard({ output }: { output: PlaygroundOutput }) {
  if (output.type === "text" && output.text) {
    return (
      <div className="rounded border border-muted bg-muted/30 px-2 py-1.5 text-[11px] font-mono text-muted-foreground">
        {output.text}
      </div>
    )
  }

  if (output.type === "audit" && output.event) {
    const { action, tool_name, decision_name, reason } = output.event

    let borderColor = "border-emerald-500/30"
    let bgColor = "bg-emerald-500/5"
    let icon = <ShieldCheck className="size-3 text-emerald-400" />
    let label = "allowed"
    let labelColor = "text-emerald-400"

    if (action === "call_denied") {
      borderColor = "border-red-500/30"
      bgColor = "bg-red-500/5"
      icon = <ShieldX className="size-3 text-red-400" />
      label = "denied"
      labelColor = "text-red-400"
    } else if (action === "call_observed") {
      borderColor = "border-amber-500/30"
      bgColor = "bg-amber-500/5"
      icon = <Eye className="size-3 text-amber-400" />
      label = "observed"
      labelColor = "text-amber-400"
    }

    return (
      <div className={`rounded border ${borderColor} ${bgColor} px-2 py-1.5`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className={`text-[11px] font-medium ${labelColor}`}>{label}</span>
          <span className="text-[11px] font-mono text-muted-foreground">{tool_name}</span>
          {decision_name && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
              {decision_name}
            </Badge>
          )}
        </div>
        {reason && (
          <p className="mt-1 text-[10px] text-muted-foreground">{reason}</p>
        )}
      </div>
    )
  }

  return null
}

function HistoryTab() {
  const sortedDeployments = [...MOCK_DEPLOYMENTS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <ScrollArea className="h-[320px]">
      <div className="relative pl-6">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-4">
          {sortedDeployments.map((dep) => {
            const envColors = ENV_COLORS[dep.env as Environment]
            return (
              <div key={dep.id} className="relative flex items-start gap-3">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-6 mt-1.5 size-3.5 rounded-full border-2 border-background ${envColors.dot}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${envColors.bg} ${envColors.text} ${envColors.border} capitalize text-[10px]`}
                    >
                      {dep.env}
                    </Badge>
                    <span className="text-sm font-mono font-semibold">v{dep.bundle_version}</span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(dep.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="size-3" />
                    {dep.deployed_by}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}

function FleetTab({ version }: { version: number }) {
  const agents = agentsByVersion(version)
  const onlineCount = agents.filter((a) => a.status === "online").length
  const offlineCount = agents.length - onlineCount

  // Group by environment for summary
  const envBreakdown = ENVIRONMENTS.reduce<Record<string, number>>((acc, env) => {
    const count = agents.filter((a) => a.env === env).length
    if (count > 0) acc[env] = count
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} on v{version}
          </span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
          {onlineCount} online
        </div>
        {offlineCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-zinc-500" />
            {offlineCount} offline
          </div>
        )}
        <Separator orientation="vertical" className="h-4" />
        {Object.entries(envBreakdown).map(([env, count]) => {
          const envColors = ENV_COLORS[env as Environment]
          return (
            <Badge
              key={env}
              variant="outline"
              className={`${envColors.bg} ${envColors.text} ${envColors.border} text-[10px] capitalize`}
            >
              {env}: {count}
            </Badge>
          )
        })}
      </div>

      {/* Agent table */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bot className="size-8 mb-2 opacity-40" />
          <p className="text-sm">No agents running v{version}</p>
        </div>
      ) : (
        <ScrollArea className="h-[280px]">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agent ID</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Environment</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Version</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Events (24h)</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Denials (24h)</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const envDeployment = MOCK_DEPLOYMENTS.find((d) => d.env === agent.env)
                  const expectedVersion = envDeployment?.bundle_version ?? version
                  const isDrifted = agent.contract_version !== expectedVersion

                  return (
                    <tr key={agent.agent_id} className="border-b">
                      <td className="px-3 py-2 font-mono text-xs">{agent.agent_id}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`${ENV_COLORS[agent.env].bg} ${ENV_COLORS[agent.env].text} ${ENV_COLORS[agent.env].border} capitalize text-[10px]`}
                        >
                          {agent.env}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`inline-block size-1.5 rounded-full ${
                              agent.status === "online" ? "bg-emerald-400" : "bg-zinc-500"
                            }`}
                          />
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          v{agent.contract_version}
                          {isDrifted && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="size-3" />
                              <span className="text-[10px]">drift</span>
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {agent.events_24h.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        <span className={agent.denials_24h > 0 ? "text-red-400" : "text-muted-foreground"}>
                          {agent.denials_24h}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {relativeTime(agent.last_seen)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function DetailPanel({ version }: { version: number }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            Version v{version} Details
          </CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {MOCK_BUNDLES.find((b) => b.version === version)?.revision_hash ?? ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="yaml">
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="yaml">
              <FileCode2 className="size-3.5" />
              YAML
            </TabsTrigger>
            <TabsTrigger value="diff">
              <GitCompare className="size-3.5" />
              Diff
            </TabsTrigger>
            <TabsTrigger value="playground">
              <Play className="size-3.5" />
              Playground
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="size-3.5" />
              History
            </TabsTrigger>
            <TabsTrigger value="fleet">
              <Bot className="size-3.5" />
              Fleet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="yaml">
            <YamlTab />
          </TabsContent>
          <TabsContent value="diff">
            <DiffTab />
          </TabsContent>
          <TabsContent value="playground">
            <PlaygroundTab />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
          <TabsContent value="fleet">
            <FleetTab version={version} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsV1() {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(5)

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground">
            Manage contract bundles across environments
          </p>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white">
          <Upload className="size-4" />
          Upload Contract
        </Button>
      </div>

      {/* Section 1: Environment Deployments */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Current Deployments
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {ENVIRONMENTS.map((env) => (
            <EnvDeploymentCard key={env} env={env} />
          ))}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Section 2: Version Table */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          All Versions
        </h2>
        <VersionTable
          selectedVersion={selectedVersion}
          onSelectVersion={setSelectedVersion}
        />
      </div>

      {/* Section 3: Detail Panel */}
      {selectedVersion !== null && (
        <DetailPanel version={selectedVersion} />
      )}
    </div>
  )
}
