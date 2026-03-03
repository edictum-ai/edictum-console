import { useNavigate } from "react-router"
import { Bot } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { type AgentSummary } from "@/lib/derive-agents"
import { AgentCard } from "./agent-card"

interface AgentGridProps {
  agents: AgentSummary[]
}

export function AgentGrid({ agents }: AgentGridProps) {
  const navigate = useNavigate()

  if (agents.length === 0) {
    return (
      <div className="overflow-auto px-6 py-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Agent Fleet
        </h2>
        <EmptyState
          icon={<Bot className="h-10 w-10" />}
          title="No agents connected"
          description="Agents appear here when they connect using an API key. Create an API key, install the SDK (pip install edictum[server]), and configure your agent."
          action={{ label: "Create API Key", onClick: () => navigate("/dashboard/keys") }}
        />
      </div>
    )
  }

  return (
    <div className="px-6 py-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Agent Fleet
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </div>
  )
}
