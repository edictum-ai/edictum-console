import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search } from "lucide-react"
import { resolveAgentBundle, type ResolvedAssignment } from "@/lib/api/agents"
import { toast } from "sonner"

/** Mini panel to test rule resolution for a given agent_id. */
export function ResolutionPreview() {
  const [agentId, setAgentId] = useState("")
  const [result, setResult] = useState<ResolvedAssignment | null>(null)
  const [resolving, setResolving] = useState(false)

  const handleResolve = async () => {
    if (!agentId.trim()) return
    setResolving(true)
    setResult(null)
    try {
      const res = await resolveAgentBundle(agentId.trim())
      setResult(res)
    } catch {
      toast.error("Resolution failed")
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Test Resolution</Label>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Enter agent_id to test..."
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleResolve()}
          className="h-8 max-w-xs text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleResolve}
          disabled={resolving || !agentId.trim()}
        >
          {resolving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
        </Button>
      </div>
      {result && (
        <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          {result.bundle_name ? (
            <p>
              <span className="font-medium">{result.bundle_name}</span>{" "}
              <span className="text-muted-foreground">via {result.source}</span>
              {result.rule_pattern && (
                <span className="text-muted-foreground">
                  {" "}(pattern: <code className="font-mono">{result.rule_pattern}</code>)
                </span>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">No bundle resolved for this agent.</p>
          )}
        </div>
      )}
    </div>
  )
}
