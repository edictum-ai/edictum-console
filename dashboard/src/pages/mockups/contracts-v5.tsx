import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Upload,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Play,
  Rocket,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  GitCompare,
  Layers,
  Clock,
  Eye,
  AlertTriangle,
  Search,
  Users,
} from "lucide-react"
import {
  type Bundle,
  type Environment,
  type ConnectedAgent,
  type PlaygroundOutput,
  MOCK_BUNDLES,
  MOCK_COMPOSITION_STACKS,
  MOCK_DEPLOYMENTS,
  MOCK_YAML,
  MOCK_PLAYGROUND_PYTHON,
  MOCK_PLAYGROUND_OUTPUT,
  MOCK_AGENTS,
  ENV_COLORS,
  ENVIRONMENTS,
  relativeTime,
  agentsByEnv,
  agentsByVersion,
  onlineAgentsByEnv,
  driftedAgents,
} from "./contracts-data"

// ── Deployed version per environment ────────────────────────────────

const DEPLOYED_VERSIONS: Record<Environment, number> = {
  production: 3,
  staging: 4,
  development: 5,
}

// ── YAML Syntax Highlighting ────────────────────────────────────────

function highlightYaml(yaml: string): React.ReactElement[] {
  return yaml.split("\n").map((line, i) => {
    const parts: React.ReactElement[] = []
    // Comment lines
    if (line.trimStart().startsWith("#")) {
      parts.push(
        <span key={i} className="text-muted-foreground">
          {line}
        </span>,
      )
    }
    // Key-value lines
    else if (line.includes(":")) {
      const colonIdx = line.indexOf(":")
      const key = line.slice(0, colonIdx + 1)
      const value = line.slice(colonIdx + 1)
      parts.push(
        <span key={`${i}-k`} className="text-blue-400">
          {key}
        </span>,
      )
      if (value.trim()) {
        const trimmed = value.trim()
        // Quoted strings
        if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
          parts.push(
            <span key={`${i}-v`} className="text-emerald-400">
              {value}
            </span>,
          )
        }
        // Numbers
        else if (/^\s*\d+$/.test(value)) {
          parts.push(
            <span key={`${i}-v`} className="text-purple-400">
              {value}
            </span>,
          )
        }
        // Arrays or other
        else {
          parts.push(
            <span key={`${i}-v`} className="text-foreground/80">
              {value}
            </span>,
          )
        }
      }
    }
    // List items
    else if (line.trimStart().startsWith("-")) {
      parts.push(
        <span key={i} className="text-foreground/80">
          {line}
        </span>,
      )
    } else {
      parts.push(
        <span key={i} className="text-foreground/80">
          {line}
        </span>,
      )
    }
    return (
      <div key={i} className="leading-relaxed">
        {parts}
      </div>
    )
  })
}

// ── Environment Badge ───────────────────────────────────────────────

function EnvBadge({ env }: { env: string }) {
  const colors = ENV_COLORS[env as Environment]
  if (!colors) {
    return (
      <Badge variant="outline" className="text-[10px]">
        {env}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={`${colors.bg} ${colors.text} ${colors.border} text-[10px] font-medium`}
    >
      {env}
    </Badge>
  )
}

// ── Status Dot ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "offline" }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        status === "online" ? "bg-emerald-400" : "bg-zinc-500"
      }`}
    />
  )
}

// ── Version Badge (drift-aware) ─────────────────────────────────────

function VersionBadge({
  version,
  expectedVersion,
}: {
  version: number
  expectedVersion: number
}) {
  const isDrifted = version !== expectedVersion
  if (isDrifted) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/15 font-mono text-[10px] text-amber-400"
      >
        <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
        v{version}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/15 font-mono text-[10px] text-emerald-400"
    >
      v{version}
    </Badge>
  )
}

// ── Bundles Tab ─────────────────────────────────────────────────────

function BundlesTab() {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-xs">Version</TableHead>
            <TableHead className="text-xs">Revision Hash</TableHead>
            <TableHead className="text-xs">Uploaded By</TableHead>
            <TableHead className="text-xs">Uploaded At</TableHead>
            <TableHead className="text-xs">Deployed To</TableHead>
            <TableHead className="text-xs">Agents</TableHead>
            <TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_BUNDLES.map((bundle: Bundle) => (
            <BundleRow
              key={bundle.version}
              bundle={bundle}
              isExpanded={expandedVersion === bundle.version}
              onToggle={() =>
                setExpandedVersion(
                  expandedVersion === bundle.version ? null : bundle.version,
                )
              }
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function BundleRow({
  bundle,
  isExpanded,
  onToggle,
}: {
  bundle: Bundle
  isExpanded: boolean
  onToggle: () => void
}) {
  const agentsOnVersion = agentsByVersion(bundle.version)
  const agentCount = agentsOnVersion.length

  return (
    <>
      <TableRow
        className="cursor-pointer border-border hover:bg-accent/50"
        onClick={onToggle}
      >
        <TableCell className="font-mono text-sm font-medium">
          <span className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            v{bundle.version}
            {bundle.version === MOCK_BUNDLES[0]!.version && (
              <Badge className="ml-1 bg-primary/15 text-primary text-[9px] px-1.5 py-0">
                latest
              </Badge>
            )}
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {bundle.revision_hash}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {bundle.uploaded_by}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {relativeTime(bundle.created_at)}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {bundle.deployed_envs.length === 0 ? (
              <span className="text-xs text-muted-foreground">--</span>
            ) : (
              bundle.deployed_envs.map((env) => (
                <EnvBadge key={env} env={env} />
              ))
            )}
          </div>
        </TableCell>
        <TableCell>
          {agentCount > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {agentCount}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View YAML
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Rocket className="mr-1 h-3 w-3" />
                  Deploy...
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ENVIRONMENTS.map((env) => (
                  <DropdownMenuItem key={env} className="text-xs">
                    Deploy to{" "}
                    <span className={ENV_COLORS[env].text}>{env}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="border-border bg-card/30 hover:bg-card/30">
          <TableCell colSpan={7} className="p-0">
            <div className="border-t border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  org-base-contracts v{bundle.version} -- YAML
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                  >
                    <GitCompare className="mr-1 h-3 w-3" />
                    Compare with...
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-[300px]">
                <pre className="px-4 py-3 font-mono text-[11px] leading-relaxed">
                  {highlightYaml(MOCK_YAML)}
                </pre>
              </ScrollArea>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ── Environments Tab ────────────────────────────────────────────────

function EnvironmentsTab() {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-3">
      {ENVIRONMENTS.map((env) => {
        const stack = MOCK_COMPOSITION_STACKS[env]
        const colors = ENV_COLORS[env]
        const currentDeployment = MOCK_DEPLOYMENTS.find((d) => d.env === env)
        const latestVersion = MOCK_BUNDLES[0]!.version
        const isOnLatest = currentDeployment?.bundle_version === latestVersion
        const expectedVersion = DEPLOYED_VERSIONS[env]
        const envAgents = agentsByEnv(env)
        const onlineCount = onlineAgentsByEnv(env).length
        const drifted = driftedAgents(env, expectedVersion)

        return (
          <Card key={env} className="overflow-hidden border-border p-0">
            {/* Colored header bar */}
            <div className={`h-1 ${colors.dot}`} />
            <div className="space-y-3 p-4">
              {/* Environment header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${colors.dot}`}
                  />
                  <span className="text-sm font-semibold capitalize text-foreground">
                    {env}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {envAgents.length} agent{envAgents.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {currentDeployment && (
                  <span className="text-[10px] text-muted-foreground">
                    v{currentDeployment.bundle_version} --{" "}
                    {relativeTime(currentDeployment.created_at)}
                  </span>
                )}
              </div>

              {/* Version drift banner */}
              {drifted.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="text-[11px] text-amber-400">
                    {drifted.length} agent{drifted.length !== 1 ? "s" : ""} running outdated contracts
                  </span>
                </div>
              )}

              {/* Composition stack */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  Composition Stack
                </div>
                <div className="space-y-1">
                  {stack.map((layer, idx) => {
                    const isObserve = layer.mode === "observe_alongside"
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between rounded-md px-3 py-2 ${
                          isObserve
                            ? "border border-dashed border-blue-500/30 bg-blue-500/5"
                            : "border border-solid border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {layer.bundle_name}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            v{layer.version}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            isObserve
                              ? "border-blue-500/30 bg-blue-500/15 text-blue-400"
                              : "border-amber-500/30 bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {isObserve ? (
                            <Eye className="mr-0.5 h-2.5 w-2.5" />
                          ) : null}
                          {isObserve ? "observe" : "enforce"}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Agent list */}
              {envAgents.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Users className="h-3 w-3" />
                    Connected Agents
                    <span className="text-muted-foreground/60">
                      ({onlineCount}/{envAgents.length} online)
                    </span>
                  </div>
                  <div className="space-y-1">
                    {envAgents.map((agent) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center justify-between rounded-md border border-border bg-card/50 px-2.5 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot status={agent.status} />
                          <span className="font-mono text-xs text-foreground">
                            {agent.agent_id}
                          </span>
                        </div>
                        <VersionBadge
                          version={agent.contract_version}
                          expectedVersion={expectedVersion}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {!isOnLatest && (
                  <Button size="sm" className="h-7 text-xs">
                    <Rocket className="mr-1 h-3 w-3" />
                    Deploy v{latestVersion}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                >
                  <GitCompare className="mr-1 h-3 w-3" />
                  View Stack Diff
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Fleet Tab ───────────────────────────────────────────────────────

function FleetTab() {
  const [envFilter, setEnvFilter] = useState<"all" | Environment>("all")

  const totalAgents = MOCK_AGENTS.length
  const onlineAgents = MOCK_AGENTS.filter((a) => a.status === "online").length
  const allDrifted = ENVIRONMENTS.flatMap((env) =>
    driftedAgents(env, DEPLOYED_VERSIONS[env]),
  )
  const driftCount = allDrifted.length
  const envCount = new Set(MOCK_AGENTS.map((a) => a.env)).size

  const filteredAgents =
    envFilter === "all"
      ? MOCK_AGENTS
      : MOCK_AGENTS.filter((a) => a.env === envFilter)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {totalAgents}
          </div>
        </Card>
        <Card className="border-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Online
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xl font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {onlineAgents}
          </div>
        </Card>
        <Card className="border-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Version Drift
          </div>
          <div
            className={`mt-1 flex items-center gap-1.5 text-xl font-semibold ${
              driftCount > 0 ? "text-amber-400" : "text-foreground"
            }`}
          >
            {driftCount > 0 && (
              <AlertTriangle className="h-4 w-4" />
            )}
            {driftCount}
          </div>
        </Card>
        <Card className="border-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Environments
          </div>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {envCount}
          </div>
        </Card>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        <FilterPill
          label="All"
          active={envFilter === "all"}
          onClick={() => setEnvFilter("all")}
        />
        {ENVIRONMENTS.map((env) => (
          <FilterPill
            key={env}
            label={env.charAt(0).toUpperCase() + env.slice(1)}
            active={envFilter === env}
            onClick={() => setEnvFilter(env)}
            dotColor={ENV_COLORS[env].dot}
          />
        ))}
      </div>

      {/* Agent table */}
      <Card className="overflow-hidden border-border p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs">Agent ID</TableHead>
              <TableHead className="text-xs">Environment</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Contract Version</TableHead>
              <TableHead className="text-xs">Events (24h)</TableHead>
              <TableHead className="text-xs">Denials (24h)</TableHead>
              <TableHead className="text-xs">Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAgents.map((agent) => (
              <AgentRow key={agent.agent_id} agent={agent} />
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Version drift section */}
      {driftCount > 0 && envFilter === "all" && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">
              {driftCount} agent{driftCount !== 1 ? "s" : ""} with version drift
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {allDrifted.map((agent) => {
              const expected = DEPLOYED_VERSIONS[agent.env]
              return (
                <div
                  key={agent.agent_id}
                  className="flex items-center justify-between rounded-md border border-amber-500/20 bg-background/50 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={agent.status} />
                    <span className="font-mono text-xs text-foreground">
                      {agent.agent_id}
                    </span>
                    <EnvBadge env={agent.env} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">
                      expected{" "}
                      <span className="font-mono text-emerald-400">
                        v{expected}
                      </span>
                      {" "}/ running{" "}
                      <span className="font-mono text-amber-400">
                        v{agent.contract_version}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 border-amber-500/30 px-2 text-[10px] text-amber-400 hover:bg-amber-500/10"
                    >
                      <Search className="mr-1 h-3 w-3" />
                      Investigate
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

function FilterPill({
  label,
  active,
  onClick,
  dotColor,
}: {
  label: string
  active: boolean
  onClick: () => void
  dotColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-accent/50"
      }`}
    >
      {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
      {label}
    </button>
  )
}

function AgentRow({ agent }: { agent: ConnectedAgent }) {
  const expectedVersion = DEPLOYED_VERSIONS[agent.env]

  return (
    <TableRow className="border-border hover:bg-accent/50">
      <TableCell className="font-mono text-xs font-medium text-foreground">
        {agent.agent_id}
      </TableCell>
      <TableCell>
        <EnvBadge env={agent.env} />
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-xs">
          <StatusDot status={agent.status} />
          <span className={agent.status === "online" ? "text-emerald-400" : "text-zinc-400"}>
            {agent.status}
          </span>
        </span>
      </TableCell>
      <TableCell>
        <VersionBadge
          version={agent.contract_version}
          expectedVersion={expectedVersion}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {agent.events_24h.toLocaleString()}
      </TableCell>
      <TableCell>
        <span
          className={`text-xs ${
            agent.denials_24h > 0 ? "font-medium text-red-400" : "text-muted-foreground"
          }`}
        >
          {agent.denials_24h}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {relativeTime(agent.last_seen)}
      </TableCell>
    </TableRow>
  )
}

// ── Playground Tab ──────────────────────────────────────────────────

function PlaygroundTab() {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Select defaultValue="file-agent">
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue placeholder="Select example..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="file-agent">File Agent</SelectItem>
              <SelectItem value="research-agent">Research Agent</SelectItem>
              <SelectItem value="devops-agent">DevOps Agent</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">
            Example scenario
          </span>
        </div>
        <Button size="sm" className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700">
          <Play className="mr-1 h-3 w-3" />
          Run
        </Button>
      </div>

      {/* Editor panels */}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
        {/* YAML panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Contract YAML
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground"
            >
              <Copy className="mr-1 h-2.5 w-2.5" />
              Copy
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <pre className="p-3 font-mono text-[11px] leading-relaxed">
              {highlightYaml(MOCK_YAML)}
            </pre>
          </ScrollArea>
        </div>

        {/* Python panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Python Code
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground"
            >
              <Copy className="mr-1 h-2.5 w-2.5" />
              Copy
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <pre className="p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
              {MOCK_PLAYGROUND_PYTHON}
            </pre>
          </ScrollArea>
        </div>
      </div>

      {/* Output panel */}
      <div className="border-t border-border">
        <div className="flex items-center border-b border-border px-3 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Output
          </span>
          <Badge variant="outline" className="ml-2 text-[9px]">
            {MOCK_PLAYGROUND_OUTPUT.length} entries
          </Badge>
        </div>
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1.5 p-3">
            {MOCK_PLAYGROUND_OUTPUT.map((entry, idx) => (
              <PlaygroundOutputCard key={idx} entry={entry} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function PlaygroundOutputCard({ entry }: { entry: PlaygroundOutput }) {
  if (entry.type === "text") {
    return (
      <div className="rounded-md border border-border bg-card/50 px-3 py-2">
        <pre className="font-mono text-[11px] text-muted-foreground">
          {entry.text}
        </pre>
      </div>
    )
  }

  if (!entry.event) return null

  const isDenied = entry.event.action === "call_denied"
  const isAllowed =
    entry.event.action === "call_allowed" ||
    entry.event.action === "call_executed"

  let borderColor = "border-l-border"
  let bgColor = "bg-card/50"
  let Icon = CheckCircle2
  let iconColor = "text-muted-foreground"

  if (isDenied) {
    borderColor = "border-l-red-500"
    bgColor = "bg-red-500/5"
    Icon = ShieldX
    iconColor = "text-red-400"
  } else if (isAllowed) {
    borderColor = "border-l-emerald-500"
    bgColor = "bg-emerald-500/5"
    Icon =
      entry.event.action === "call_allowed" ? ShieldCheck : CheckCircle2
    iconColor = "text-emerald-400"
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border border-border ${borderColor} border-l-[3px] ${bgColor} px-3 py-2`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {entry.event.action.replace("_", " ")}
          </span>
          <Badge variant="outline" className="font-mono text-[9px]">
            {entry.event.tool_name}
          </Badge>
        </div>
        {entry.event.decision_name && (
          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
            contract: {entry.event.decision_name}
          </span>
        )}
        {entry.event.reason && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {entry.event.reason}
          </span>
        )}
      </div>
    </div>
  )
}

// ── History Tab ─────────────────────────────────────────────────────

function HistoryTab() {
  // Group deployments by date
  const grouped = groupDeploymentsByDate()

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {grouped.map((group) => (
          <div key={group.label}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="relative ml-4 space-y-0 border-l-2 border-border pl-6">
              {group.deployments.map((dep, idx) => {
                const colors = ENV_COLORS[dep.env as Environment]
                const nextDep = group.deployments[idx + 1]

                return (
                  <div key={dep.id} className="relative pb-6">
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-background ${colors?.dot ?? "bg-muted"}`}
                    />

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <EnvBadge env={dep.env} />
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          v{dep.bundle_version}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by {dep.deployed_by}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {relativeTime(dep.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Diff link to next deployment in group */}
                    {nextDep && (
                      <button className="mt-1.5 flex items-center gap-1 text-[10px] text-primary hover:underline">
                        <GitCompare className="h-3 w-3" />
                        Compare v{dep.bundle_version} &#8592; v
                        {nextDep.bundle_version}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

interface DeploymentGroup {
  label: string
  deployments: typeof MOCK_DEPLOYMENTS
}

function groupDeploymentsByDate(): DeploymentGroup[] {
  const now = new Date("2026-02-27T08:15:00Z")
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000)
    .toISOString()
    .slice(0, 10)

  const sorted = [...MOCK_DEPLOYMENTS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const groups: Record<string, typeof MOCK_DEPLOYMENTS> = {}

  for (const dep of sorted) {
    const date = dep.created_at.slice(0, 10)
    let label: string
    if (date === today) label = "Today"
    else if (date === yesterday) label = "Yesterday"
    else label = new Date(dep.created_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })

    if (!groups[label]) groups[label] = []
    groups[label]!.push(dep)
  }

  return Object.entries(groups).map(([label, deployments]) => ({
    label,
    deployments,
  }))
}

// ── Main Component ──────────────────────────────────────────────────

export default function ContractsV5() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Contracts</h1>
          <p className="text-xs text-muted-foreground">
            Manage contract bundles, environments, and deployments
          </p>
        </div>
        <Button size="sm" className="h-8">
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload Contract
        </Button>
      </div>

      {/* Tabbed workbench */}
      <Tabs defaultValue="bundles" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6">
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger
              value="bundles"
              className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Bundles
              <Badge
                variant="outline"
                className="ml-1.5 h-4 px-1 text-[9px]"
              >
                {MOCK_BUNDLES.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="environments"
              className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Environments
            </TabsTrigger>
            <TabsTrigger
              value="fleet"
              className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Fleet
              <Badge
                variant="outline"
                className="ml-1.5 h-4 px-1 text-[9px]"
              >
                {MOCK_AGENTS.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="playground"
              className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Playground
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              History
              <Badge
                variant="outline"
                className="ml-1.5 h-4 px-1 text-[9px]"
              >
                {MOCK_DEPLOYMENTS.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="bundles" className="mt-0 flex-1 overflow-auto">
          <BundlesTab />
        </TabsContent>

        <TabsContent value="environments" className="mt-0 flex-1 overflow-auto">
          <EnvironmentsTab />
        </TabsContent>

        <TabsContent value="fleet" className="mt-0 flex-1 overflow-auto">
          <FleetTab />
        </TabsContent>

        <TabsContent
          value="playground"
          className="mt-0 flex min-h-0 flex-1 flex-col"
        >
          <PlaygroundTab />
        </TabsContent>

        <TabsContent value="history" className="mt-0 flex-1">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
