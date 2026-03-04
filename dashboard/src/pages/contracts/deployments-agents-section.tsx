import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Package, X } from "lucide-react"
import {
  getAgentRegistrations,
  updateAgentRegistration,
  type AgentRegistration,
} from "@/lib/api/agents"
import { subscribeDashboardSSE } from "@/lib/sse"
import { BulkAssignDialog } from "./bulk-assign-dialog"
import { AgentRegistrationRow } from "./agent-registration-row"
import { toast } from "sonner"

interface DeploymentsAgentsSectionProps {
  bundleNames: string[]
}

export function DeploymentsAgentsSection({ bundleNames }: DeploymentsAgentsSectionProps) {
  const [agents, setAgents] = useState<AgentRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [updatingAgent, setUpdatingAgent] = useState<string | null>(null)
  const fetchGenRef = useRef(0)

  const fetchAgents = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setError(null)
    try {
      const data = await getAgentRegistrations()
      if (gen !== fetchGenRef.current) return
      setAgents(data)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : "Failed to load agents")
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  useEffect(() => {
    return subscribeDashboardSSE({
      assignment_changed: () => fetchAgents(),
    })
  }, [fetchAgents])

  const toggleSelect = (agentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === agents.length) setSelected(new Set())
    else setSelected(new Set(agents.map((a) => a.agent_id)))
  }

  const handleAssignBundle = async (agentId: string, bundleName: string | null) => {
    setUpdatingAgent(agentId)
    try {
      await updateAgentRegistration(agentId, {
        bundle_name: bundleName === "none" ? "" : bundleName,
      })
      toast.success(bundleName && bundleName !== "none"
        ? `Assigned ${bundleName} to ${agentId}`
        : `Cleared assignment for ${agentId}`)
      await fetchAgents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    } finally {
      setUpdatingAgent(null)
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" size="sm" className="ml-2" onClick={() => { setLoading(true); fetchAgents() }}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No agents have connected yet. Agents are auto-registered on first SSE connect.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Package className="size-3.5 mr-1.5" />
            Bulk Assign
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={agents.length > 0 && selected.size === agents.length}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Agent ID</TableHead>
            <TableHead>Display Name</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="w-44">Assigned Bundle</TableHead>
            <TableHead>Resolved</TableHead>
            <TableHead className="w-24">Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <AgentRegistrationRow
              key={agent.id}
              agent={agent}
              selected={selected.has(agent.agent_id)}
              onToggleSelect={() => toggleSelect(agent.agent_id)}
              bundleNames={bundleNames}
              updating={updatingAgent === agent.agent_id}
              onAssignBundle={(v) => handleAssignBundle(agent.agent_id, v)}
            />
          ))}
        </TableBody>
      </Table>

      <BulkAssignDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedAgentIds={Array.from(selected)}
        bundleNames={bundleNames}
        onAssigned={() => {
          setSelected(new Set())
          fetchAgents()
        }}
      />
    </div>
  )
}
