import { useState, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AlertTriangle, ChevronRight, Loader2, Play } from "lucide-react"
import { listEvents, evaluateBundle, getBundleYaml } from "@/lib/api"
import type { BundleWithDeployments, EventResponse } from "@/lib/api"
import { extractArgsPreview } from "@/lib/payload-helpers"
import { ReplayResultsTable, type VerdictChange } from "./replay-results-table"

interface EvaluateReplayProps {
  bundles: BundleWithDeployments[]
  selectedBundle: string | null
}

interface ReplayResults {
  total: number; evaluated: number; failed: number; unchanged: number; newDenials: number; relaxed: number
  changes: VerdictChange[]; errors: Array<{ toolName: string; error: string }>
}

type ReplayState =
  | { status: "idle" } | { status: "running"; progress: number; total: number }
  | { status: "done"; results: ReplayResults } | { status: "error"; message: string }

export function EvaluateReplay({ bundles, selectedBundle }: EvaluateReplayProps) {
  const sorted = useMemo(() => [...bundles].sort((a, b) => b.version - a.version), [bundles])

  const [testVersion, setTestVersion] = useState(sorted[0]?.version ? String(sorted[0].version) : "")
  const [baselineVersion, setBaselineVersion] = useState(sorted[1]?.version ? String(sorted[1].version) : "")
  const [eventSource, setEventSource] = useState("last50")
  const [state, setState] = useState<ReplayState>({ status: "idle" })
  const [showErrors, setShowErrors] = useState(false)
  // Reset versions when selected bundle changes
  useEffect(() => {
    setTestVersion(sorted[0]?.version ? String(sorted[0].version) : "")
    setBaselineVersion(sorted[1]?.version ? String(sorted[1].version) : "")
    setState({ status: "idle" })
  }, [selectedBundle]) // eslint-disable-line react-hooks/exhaustive-deps
  const runReplay = useCallback(async () => {
    if (!selectedBundle || !testVersion || !baselineVersion) return
    setState({ status: "running", progress: 0, total: 0 })

    let testYaml: string, baselineYaml: string
    try {
      ;[testYaml, baselineYaml] = await Promise.all([getBundleYaml(selectedBundle, Number(testVersion)), getBundleYaml(selectedBundle, Number(baselineVersion))])
    } catch (e) { setState({ status: "error", message: `Failed to load bundle YAML: ${e instanceof Error ? e.message : String(e)}` }); return }

    const filters: { limit: number; since?: string } = { limit: 50 }
    if (eventSource === "last24h") {
      filters.since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
    let events: EventResponse[]
    try { events = await listEvents(filters) }
    catch (e) { setState({ status: "error", message: `Failed to fetch events: ${e instanceof Error ? e.message : String(e)}` }); return }

    if (events.length === 0) { setState({ status: "done", results: { total: 0, evaluated: 0, failed: 0, unchanged: 0, newDenials: 0, relaxed: 0, changes: [], errors: [] } }); return }
    setState({ status: "running", progress: 0, total: events.length })

    const changes: VerdictChange[] = []
    const errors: Array<{ toolName: string; error: string }> = []
    let evaluated = 0

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!
      const toolArgs = (event.payload as Record<string, unknown> | null)?.tool_args as Record<string, unknown> | undefined
      try {
        const [baseResult, testResult] = await Promise.all([
          evaluateBundle({ yaml_content: baselineYaml, tool_name: event.tool_name, tool_args: toolArgs ?? {} }),
          evaluateBundle({ yaml_content: testYaml, tool_name: event.tool_name, tool_args: toolArgs ?? {} }),
        ])
        evaluated++
        if (baseResult.verdict !== testResult.verdict) {
          changes.push({
            id: event.id, tool_name: event.tool_name, argsPreview: extractArgsPreview(event),
            agent_id: event.agent_id, timestamp: event.timestamp,
            oldVerdict: baseResult.verdict, newVerdict: testResult.verdict,
            decidingContract: testResult.deciding_contract, oldResult: baseResult, newResult: testResult,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (i === 0 && msg.includes("404")) {
          setState({ status: "error", message: "The evaluate endpoint is not deployed yet. Check the server setup guide." })
          return
        }
        errors.push({ toolName: event.tool_name, error: msg })
      }
      setState({ status: "running", progress: i + 1, total: events.length })
    }

    const newDenials = changes.filter((c) => c.newVerdict === "deny").length
    const relaxed = changes.filter((c) => c.oldVerdict === "deny" && c.newVerdict !== "deny").length
    setState({ status: "done", results: { total: events.length, evaluated, failed: errors.length, unchanged: evaluated - changes.length, newDenials, relaxed, changes, errors } })
  }, [selectedBundle, testVersion, baselineVersion, eventSource])

  if (sorted.length === 0) {
    return <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border"><p className="text-sm text-muted-foreground">Upload a bundle to use replay evaluation.</p></div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border p-4">
        <div className="space-y-1">
          <Label className="text-xs">Test bundle</Label>
          <Select value={testVersion} onValueChange={setTestVersion}>
            <SelectTrigger><SelectValue placeholder="Version..." /></SelectTrigger>
            <SelectContent>
              {sorted.map((b) => (
                <SelectItem key={b.version} value={String(b.version)}>v{b.version}{b.deployed_envs.length > 0 ? ` (${b.deployed_envs.join(", ")})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Against</Label>
          <Select value={eventSource} onValueChange={setEventSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last50">Last 50 events</SelectItem>
              <SelectItem value="last24h">Last 24h (max 50)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Compare with</Label>
          <Select value={baselineVersion} onValueChange={setBaselineVersion}>
            <SelectTrigger><SelectValue placeholder="Version..." /></SelectTrigger>
            <SelectContent>
              {sorted.map((b) => (
                <SelectItem key={b.version} value={String(b.version)}>v{b.version}{b.deployed_envs.length > 0 ? ` (${b.deployed_envs.join(", ")})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={runReplay} disabled={state.status === "running" || !testVersion || !baselineVersion || testVersion === baselineVersion}>
        {state.status === "running" ? <><Loader2 className="size-4 animate-spin" /> Running...</> : <><Play className="size-4" /> Run Replay</>}
      </Button>
      {testVersion === baselineVersion && testVersion && <p className="text-xs text-muted-foreground">Select two different versions to compare.</p>}

      {state.status === "running" && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Evaluating {state.progress}/{state.total}...</div>
          <Progress value={(state.progress / state.total) * 100} />
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="size-4 text-destructive" />
          <p className="text-sm text-destructive">{state.message}</p>
          <Button variant="outline" size="sm" className="ml-auto" onClick={runReplay}>Retry</Button>
        </div>
      )}

      {state.status === "done" && <ReplayResultsView results={state.results} showErrors={showErrors} onToggleErrors={setShowErrors} />}
    </div>
  )
}

function ReplayResultsView({ results, showErrors, onToggleErrors }: { results: ReplayResults; showErrors: boolean; onToggleErrors: (v: boolean) => void }) {
  if (results.total === 0) {
    return <div className="rounded-lg border border-dashed border-border py-8 text-center"><p className="text-sm text-muted-foreground">No events found in the selected time range.</p></div>
  }
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">{results.total} events evaluated</p>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">{results.unchanged} unchanged</span>
        <span className="text-red-600 dark:text-red-400">{results.newDenials} new denials</span>
        <span className="text-emerald-600 dark:text-emerald-400">{results.relaxed} relaxed</span>
        {results.failed > 0 && <span className="text-amber-600 dark:text-amber-400">{results.failed} failed</span>}
      </div>
      {results.changes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Changed Verdicts ({results.changes.length})</p>
          <ReplayResultsTable changes={results.changes} />
        </div>
      )}
      {results.errors.length > 0 && (
        <Collapsible open={showErrors} onOpenChange={onToggleErrors}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className={`size-3 transition-transform ${showErrors ? "rotate-90" : ""}`} />
            {results.errors.length} failed evaluation{results.errors.length !== 1 ? "s" : ""}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-4 mt-1 space-y-1">
              {results.errors.map((err, i) => (
                <p key={i} className="text-xs text-muted-foreground"><span className="font-mono">{err.toolName}</span>: {err.error}</p>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
