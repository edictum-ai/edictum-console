import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, ChevronRight, FlaskConical, Loader2 } from "lucide-react"
import { listEvents, evaluateBundle } from "@/lib/api"
import type { EventResponse } from "@/lib/api"

interface DiffImpactProps {
  oldYaml: string
  newYaml: string
}

interface VerdictChange {
  eventId: string
  toolName: string
  oldVerdict: string
  newVerdict: string
  decidingContract: string | null
}

interface ImpactResults {
  total: number
  evaluated: number
  failed: number
  unchanged: number
  changes: VerdictChange[]
  errors: Array<{ eventId: string; toolName: string; error: string }>
}

type ImpactState =
  | { status: "idle" }
  | { status: "running"; progress: number; total: number }
  | { status: "done"; results: ImpactResults }
  | { status: "error"; message: string }

export function DiffImpact({ oldYaml, newYaml }: DiffImpactProps) {
  const [state, setState] = useState<ImpactState>({ status: "idle" })
  const [showErrors, setShowErrors] = useState(false)

  const runAnalysis = useCallback(async () => {
    setState({ status: "running", progress: 0, total: 0 })

    let events: EventResponse[]
    try {
      events = await listEvents({ limit: 50 })
    } catch (e) {
      setState({ status: "error", message: `Failed to fetch events: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    if (events.length === 0) {
      setState({ status: "done", results: { total: 0, evaluated: 0, failed: 0, unchanged: 0, changes: [], errors: [] } })
      return
    }

    setState({ status: "running", progress: 0, total: events.length })

    const changes: VerdictChange[] = []
    const errors: Array<{ eventId: string; toolName: string; error: string }> = []
    let evaluated = 0

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!
      const toolArgs = (event.payload as Record<string, unknown> | null)?.tool_args as Record<string, unknown> | undefined

      try {
        const [oldResult, newResult] = await Promise.all([
          evaluateBundle({ yaml_content: oldYaml, tool_name: event.tool_name, tool_args: toolArgs ?? {} }),
          evaluateBundle({ yaml_content: newYaml, tool_name: event.tool_name, tool_args: toolArgs ?? {} }),
        ])

        evaluated++
        if (oldResult.verdict !== newResult.verdict) {
          changes.push({
            eventId: event.id,
            toolName: event.tool_name,
            oldVerdict: oldResult.verdict,
            newVerdict: newResult.verdict,
            decidingContract: newResult.deciding_contract,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (i === 0 && msg.includes("404")) {
          setState({ status: "error", message: "Impact analysis requires the evaluate endpoint. Deploy the backend with the evaluate feature enabled." })
          return
        }
        errors.push({ eventId: event.id, toolName: event.tool_name, error: msg })
      }

      setState({ status: "running", progress: i + 1, total: events.length })
    }

    setState({
      status: "done",
      results: {
        total: events.length,
        evaluated,
        failed: errors.length,
        unchanged: evaluated - changes.length,
        changes,
        errors,
      },
    })
  }, [oldYaml, newYaml])

  if (state.status === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8">
        <FlaskConical className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Replay recent events against both versions to preview verdict changes.</p>
        <Button variant="outline" size="sm" onClick={runAnalysis}>
          Run Impact Analysis
        </Button>
      </div>
    )
  }

  if (state.status === "running") {
    return (
      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Evaluating {state.progress}/{state.total}...
        </div>
        <Progress value={(state.progress / state.total) * 100} />
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8">
        <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" size="sm" onClick={runAnalysis}>Retry</Button>
      </div>
    )
  }

  // Done
  const { results } = state
  if (results.total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-8 text-center">
        <p className="text-sm text-muted-foreground">No events found. Run some agent tool calls first.</p>
      </div>
    )
  }

  const newDenials = results.changes.filter((c) => c.newVerdict === "deny")
  const relaxed = results.changes.filter((c) => c.oldVerdict === "deny" && c.newVerdict !== "deny")
  const other = results.changes.filter((c) => !newDenials.includes(c) && !relaxed.includes(c))

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm">
        Based on <span className="font-medium">{results.total}</span> most recent events:
        {results.failed > 0 && (
          <span className="text-muted-foreground"> {results.evaluated}/{results.total} evaluated, {results.failed} failed</span>
        )}
      </p>

      {results.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No verdict changes detected.</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            {results.changes.length} event{results.changes.length !== 1 ? "s" : ""} would change verdict
          </p>

          {newDenials.length > 0 && (
            <VerdictGroup
              label={`${newDenials.length}: newly denied`}
              changes={newDenials}
              color="text-red-600 dark:text-red-400"
            />
          )}
          {relaxed.length > 0 && (
            <VerdictGroup
              label={`${relaxed.length}: newly allowed`}
              changes={relaxed}
              color="text-emerald-600 dark:text-emerald-400"
            />
          )}
          {other.length > 0 && (
            <VerdictGroup
              label={`${other.length}: other changes`}
              changes={other}
              color="text-amber-600 dark:text-amber-400"
            />
          )}
        </>
      )}

      {results.errors.length > 0 && (
        <>
          <Separator />
          <Collapsible open={showErrors} onOpenChange={setShowErrors}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRight className={`size-3 transition-transform ${showErrors ? "rotate-90" : ""}`} />
              {results.errors.length} failed evaluation{results.errors.length !== 1 ? "s" : ""}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-4 mt-1 space-y-1">
                {results.errors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-mono">{err.toolName}</span>: {err.error}
                  </p>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <Separator />
      <Button variant="outline" size="sm" onClick={runAnalysis}>Re-run Analysis</Button>
    </div>
  )
}

function VerdictGroup({ label, changes, color }: {
  label: string
  changes: VerdictChange[]
  color: string
}) {
  return (
    <div className="space-y-1">
      <p className={`text-sm font-medium ${color}`}>{label}</p>
      <ul className="ml-4 space-y-0.5">
        {changes.slice(0, 5).map((c) => (
          <li key={c.eventId} className="text-xs text-muted-foreground">
            <span className="font-mono">{c.toolName}</span>: {c.oldVerdict} → {c.newVerdict}
            {c.decidingContract && <span className="ml-1">({c.decidingContract})</span>}
          </li>
        ))}
        {changes.length > 5 && (
          <li className="text-xs text-muted-foreground">...and {changes.length - 5} more</li>
        )}
      </ul>
    </div>
  )
}
