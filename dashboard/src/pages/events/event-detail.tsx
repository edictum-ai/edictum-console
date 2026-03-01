import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { EventResponse } from "@/lib/api"
import { extractProvenance, isObserveFinding } from "@/lib/payload-helpers"
import { verdictColor, VerdictIcon } from "@/lib/verdict-helpers"
import { DetailRow } from "@/components/detail-row"
import { DecisionContextCard } from "./detail-decision-context"
import { ToolArgsCard } from "./detail-tool-args"
import { ContractsEvaluatedCard } from "./detail-contracts-evaluated"

interface EventDetailProps {
  event: EventResponse
  onClose: () => void
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  const [jsonExpanded, setJsonExpanded] = useState(false)

  const payload = event.payload ?? {}
  const prov = extractProvenance(event)
  const observe = isObserveFinding(event)

  const toolArgs =
    (payload.tool_args as Record<string, unknown> | undefined) ?? null
  const durationMs = typeof payload.duration_ms === "number" ? payload.duration_ms : undefined
  const traceId = typeof payload.trace_id === "string" ? payload.trace_id : undefined
  const environment = typeof payload.environment === "string"
    ? payload.environment
    : typeof payload.env === "string"
      ? payload.env
      : undefined

  const contractsEvaluated = Array.isArray(payload.contracts_evaluated)
    ? (payload.contracts_evaluated as Array<{ name: string; type: string; passed: boolean; message?: string; observed?: boolean }>)
    : null

  return (
    <div className="flex flex-col border-t border-border bg-card/50">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          Event Detail
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap gap-4 p-3">
          {/* Left column: header + core fields */}
          <div className="min-w-[200px] flex-1 space-y-3">
            {observe && (
              <Alert className="border-amber-500/20 bg-amber-500/10">
                <AlertDescription className="text-xs text-amber-600 dark:text-amber-400">
                  Observe mode — tool call allowed regardless of verdict.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded border px-2 py-0.5 text-xs font-medium ${verdictColor(event.verdict)}`}
                >
                  <VerdictIcon verdict={event.verdict} />
                  <span className="ml-1 capitalize">{event.verdict}</span>
                </Badge>
                {event.mode && (
                  <Badge
                    variant="outline"
                    className="rounded text-[10px] font-normal"
                  >
                    {event.mode}
                  </Badge>
                )}
                {environment && (
                  <Badge
                    variant="outline"
                    className="rounded text-[10px] font-normal"
                  >
                    {environment}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(event.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="space-y-1.5">
              <DetailRow label="Agent" value={event.agent_id} />
              <DetailRow label="Tool" value={event.tool_name} mono />
              <DetailRow label="Event ID" value={event.id} mono />
              {event.call_id && (
                <DetailRow label="Call ID" value={event.call_id} mono />
              )}
              {durationMs !== undefined && (
                <DetailRow
                  label="Duration"
                  value={durationMs === 0 ? "< 1ms" : `${durationMs}ms`}
                />
              )}
              {traceId && (
                <DetailRow label="Trace ID" value={traceId} mono />
              )}
            </div>

            <DecisionContextCard prov={prov} />
          </div>

          {/* Right column: tool args, contracts, raw JSON */}
          <div className="min-w-[200px] flex-1 space-y-3">
            {toolArgs && <ToolArgsCard toolArgs={toolArgs} />}

            {contractsEvaluated && contractsEvaluated.length > 0 && (
              <ContractsEvaluatedCard contracts={contractsEvaluated} />
            )}

            <div className="max-w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setJsonExpanded(!jsonExpanded)}
                className="h-auto px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {jsonExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Raw JSON
                <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
              {jsonExpanded && (
                <pre className="mt-2 max-h-[300px] max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(event, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
