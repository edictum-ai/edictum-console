import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Circle, Rocket } from "lucide-react"
import {
  type Environment,
  MOCK_AGENTS,
  MOCK_ENV_STATUS,
} from "./contracts-data"
import { ContractsTabBar } from "./contracts-tab-bar"
import {
  AgentRow,
  deployedVersionForEnv,
  RecentDeploysStrip,
} from "./contracts-deploy-v5-parts"
import { EnvironmentSection } from "./contracts-deploy-v5-env-section"

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractsDeployV5() {
  const [selectedEnv, setSelectedEnv] = useState<Environment | "all">("all")

  const filteredAgents = useMemo(() => {
    if (selectedEnv === "all") return MOCK_AGENTS
    return MOCK_AGENTS.filter((a) => a.env === selectedEnv)
  }, [selectedEnv])

  const onlineCount = filteredAgents.filter(
    (a) => a.status === "online",
  ).length
  const driftCount = filteredAgents.filter((a) => {
    const expected = deployedVersionForEnv(MOCK_ENV_STATUS, a.env)
    return a.contract_version !== expected
  }).length

  const filterOptions: Array<{ key: Environment | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "production", label: "Production" },
    { key: "staging", label: "Staging" },
    { key: "development", label: "Development" },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Contracts</h1>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white">
          <Rocket className="size-3.5" />
          Deploy Version...
        </Button>
      </div>

      {/* Tab bar */}
      <ContractsTabBar activeTab="deployments" />

      {/* Two-panel split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Environments (55%) */}
        <div className="flex w-[55%] shrink-0 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Environments
            </span>
          </div>
          <ScrollArea className="flex-1">
            {MOCK_ENV_STATUS.map((envStatus) => (
              <EnvironmentSection
                key={envStatus.env}
                envStatus={envStatus}
                isSelected={selectedEnv === envStatus.env}
                onSelect={() =>
                  setSelectedEnv((prev) =>
                    prev === envStatus.env ? "all" : envStatus.env,
                  )
                }
              />
            ))}
          </ScrollArea>
        </div>

        {/* Right panel: Agents (45%) */}
        <div className="flex flex-1 flex-col">
          {/* Agent header + filter pills */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agents
            </span>
            <div className="flex items-center gap-1">
              {filterOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSelectedEnv(opt.key)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                    selectedEnv === opt.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary line */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-1.5">
            <span className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {filteredAgents.length}
              </span>{" "}
              agents
            </span>
            <span className="text-xs text-muted-foreground/50">|</span>
            <span className="flex items-center gap-1 text-xs">
              <Circle className="size-1.5 fill-emerald-400 text-emerald-400" />
              <span className="text-emerald-400">{onlineCount}</span>
              <span className="text-muted-foreground">online</span>
            </span>
            {driftCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground/50">|</span>
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle className="size-3" />
                  {driftCount} drift
                </span>
              </>
            )}
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-3 border-b border-border bg-muted/10 px-3 py-1.5">
            <span className="w-[8px]" />
            <span className="w-[140px] text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Agent ID
            </span>
            <span className="w-[64px] text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Version
            </span>
            <span className="w-[60px] text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Events
            </span>
            <span className="w-[40px] text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Denials
            </span>
            <span className="flex-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Last seen
            </span>
          </div>

          {/* Agent rows */}
          <ScrollArea className="flex-1">
            {filteredAgents.map((agent) => (
              <AgentRow
                key={agent.agent_id}
                agent={agent}
                expectedVersion={deployedVersionForEnv(
                  MOCK_ENV_STATUS,
                  agent.env,
                )}
              />
            ))}
          </ScrollArea>
        </div>
      </div>

      {/* Bottom strip: recent deploys */}
      <RecentDeploysStrip />
    </div>
  )
}
