import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TableCell } from "@/components/ui/table"
import { Clock } from "lucide-react"
import type { EventResponse } from "@/lib/api"
import { extractProvenance, isObserveFinding } from "@/lib/payload-helpers"
import { verdictColor, VerdictIcon } from "@/lib/verdict-helpers"
import { EnvBadge } from "@/lib/env-colors"
import { DecisionContextCard } from "./detail-decision-context"
import { ToolArgsCard } from "./detail-tool-args"
import { ContractsEvaluatedCard } from "./detail-contracts-evaluated"
import { EventRowActions } from "./event-row-actions"

interface EventRowDetailProps {
  event: EventResponse
  colSpan: number
}

function truncateId(id: string, max = 16): string {
  return id.length > max ? id.slice(0, max) + "..." : id
}

export function EventRowDetail({ event, colSpan }: EventRowDetailProps) {
  const payload = event.payload ?? {}
  const prov = extractProvenance(event)
  const observe = isObserveFinding(event)

  const toolArgs =
    (payload.tool_args as Record<string, unknown> | undefined) ?? null
  const durationMs =
    typeof payload.duration_ms === "number" ? payload.duration_ms : undefined
  const traceId =
    typeof payload.trace_id === "string" ? payload.trace_id : undefined
  const environment =
    typeof payload.environment === "string"
      ? payload.environment
      : typeof payload.env === "string"
        ? payload.env
        : undefined

  const contractsEvaluated = Array.isArray(payload.contracts_evaluated)
    ? (payload.contracts_evaluated as Array<{
        name: string
        type: string
        passed: boolean
        message?: string
        observed?: boolean
      }>)
    : null

  const ts = new Date(event.timestamp)
  const timeStr = ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  })
  const dateStr = ts.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

  return (
    <TableCell colSpan={colSpan} className="p-0">
      <div className="animate-in slide-in-from-top-1 duration-150 border-t border-b border-border bg-muted/30 px-4 py-3 space-y-3">
        {/* Observe mode alert */}
        {observe && (
          <Alert className="border-amber-500/20 bg-amber-500/10">
            <AlertDescription className="text-xs text-amber-600 dark:text-amber-400">
              Observe mode — tool call was allowed regardless of verdict.
            </AlertDescription>
          </Alert>
        )}

        {/* Header: verdict + mode + env | timestamp */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`rounded border px-2 py-0.5 text-xs font-medium ${verdictColor(event.verdict)}`}
            >
              <VerdictIcon verdict={event.verdict} className="h-3 w-3" />
              <span className="ml-1 uppercase">{event.verdict}</span>
            </Badge>
            {event.mode && (
              <Badge variant="outline" className="rounded text-[10px] font-normal">
                {event.mode}
              </Badge>
            )}
            {environment && <EnvBadge env={environment} />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-mono">{timeStr}</span>
            <span>{dateStr}</span>
          </div>
        </div>

        {/* Two-column grid: Decision Context + Tool Args */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DecisionContextCard prov={prov} />
          {toolArgs && <ToolArgsCard toolArgs={toolArgs} />}
        </div>

        {/* Contracts Evaluated */}
        {contractsEvaluated && contractsEvaluated.length > 0 && (
          <ContractsEvaluatedCard contracts={contractsEvaluated} />
        )}

        {/* IDs row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Event: <span className="font-mono text-foreground">{truncateId(event.id)}</span>
          </span>
          {event.call_id && (
            <span>
              Call: <span className="font-mono text-foreground">{truncateId(event.call_id)}</span>
            </span>
          )}
          {traceId && (
            <span>
              Trace: <span className="font-mono text-foreground">{truncateId(traceId)}</span>
            </span>
          )}
          {durationMs !== undefined && (
            <span>
              Dur:{" "}
              <span className="font-mono text-foreground">
                {durationMs === 0 ? "< 1ms" : `${durationMs}ms`}
              </span>
            </span>
          )}
        </div>

        {/* Action buttons */}
        <EventRowActions event={event} toolArgs={toolArgs} />
      </div>
    </TableCell>
  )
}
