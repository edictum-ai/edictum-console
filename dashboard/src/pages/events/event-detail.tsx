import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  X,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import type { EventResponse } from "@/lib/api"
import {
  extractProvenance,
  formatDecisionSource,
  isObserveFinding,
} from "@/lib/payload-helpers"

function verdictColor(v: string) {
  switch (v) {
    case "allowed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "denied":
      return "bg-red-500/15 text-red-400 border-red-500/30"
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30"
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  }
}

function VerdictIcon({ verdict }: { verdict: string }) {
  const cls = "h-3.5 w-3.5"
  switch (verdict) {
    case "allowed":
      return <ShieldCheck className={`${cls} text-emerald-400`} />
    case "denied":
      return <ShieldAlert className={`${cls} text-red-400`} />
    case "pending":
      return <ShieldQuestion className={`${cls} text-amber-400`} />
    default:
      return <Shield className={`${cls} text-zinc-400`} />
  }
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

interface EventDetailProps {
  event: EventResponse
  onClose: () => void
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  const [jsonExpanded, setJsonExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedVersion, setCopiedVersion] = useState(false)

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

  // Forward-compatible: renders when core library adds contracts_evaluated to ServerAuditSink payload
  const contractsEvaluated = Array.isArray(payload.contracts_evaluated)
    ? (payload.contracts_evaluated as Array<{ name: string; type: string; passed: boolean; message?: string; observed?: boolean }>)
    : null

  const handleCopyArgs = async () => {
    const text = toolArgs ? JSON.stringify(toolArgs, null, 2) : "{}"
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleCopyVersion = async () => {
    if (!prov.policyVersion) return
    await navigator.clipboard.writeText(prov.policyVersion)
    setCopiedVersion(true)
    setTimeout(() => setCopiedVersion(false), 1500)
  }

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
            {/* Observe mode banner */}
            {observe && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <p className="text-xs text-amber-400">
                  Observe mode — tool call allowed regardless of verdict.
                </p>
              </div>
            )}

            {/* Header badges */}
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

            {/* Core fields */}
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

            {/* Decision Context */}
            {(prov.contractName ?? prov.decisionSource ?? prov.reason) && (
              <Card className="border-border bg-background/50 p-0">
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Decision Context
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {prov.contractName && (
                    <DetailRow label="Contract" value={prov.contractName} mono />
                  )}
                  {prov.decisionSource && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Type
                      </span>
                      <Badge
                        variant="outline"
                        className="h-5 rounded px-1.5 text-[10px] font-normal"
                      >
                        {formatDecisionSource(prov.decisionSource)}
                      </Badge>
                    </div>
                  )}
                  {prov.policyVersion && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Bundle Version
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="truncate text-right font-mono text-[11px] text-foreground">
                          {prov.policyVersion.length > 12
                            ? prov.policyVersion.slice(0, 12) + "..."
                            : prov.policyVersion}
                        </span>
                        <button
                          onClick={() => void handleCopyVersion()}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          {copiedVersion ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    </div>
                  )}
                  {prov.reason && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {prov.reason}
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Right column: tool args, contracts, raw JSON */}
          <div className="min-w-[200px] flex-1 space-y-3">
            {/* Tool Arguments */}
            {toolArgs && Object.keys(toolArgs).length > 0 && (
              <Card className="border-border bg-background/50 p-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">
                    Tool Arguments
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleCopyArgs()}
                    className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="mr-1 h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    <span className="text-[10px]">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <div className="space-y-1.5 p-3">
                  {Object.entries(toolArgs).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {key}:
                      </span>
                      <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Contracts Evaluated */}
            {contractsEvaluated && contractsEvaluated.length > 0 && (
              <Card className="border-border bg-background/50 p-0">
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Contracts Evaluated
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {contractsEvaluated.map((c) => (
                    <div
                      key={`${c.name}-${c.type}`}
                      className="flex items-start gap-2 rounded-md border border-border bg-background/50 px-2.5 py-2"
                    >
                      {c.passed ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-foreground">
                            {c.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="h-4 rounded px-1 text-[9px] font-normal"
                          >
                            {c.type}
                          </Badge>
                          {c.observed && (
                            <Badge
                              variant="outline"
                              className="h-4 rounded px-1 text-[9px] font-normal border-amber-500/30 text-amber-400"
                            >
                              observed
                            </Badge>
                          )}
                        </div>
                        {!c.passed && c.message && (
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {c.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Raw JSON */}
            <div className="max-w-full">
              <button
                onClick={() => setJsonExpanded(!jsonExpanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {jsonExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Raw JSON
                <ExternalLink className="ml-1 h-3 w-3" />
              </button>
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

