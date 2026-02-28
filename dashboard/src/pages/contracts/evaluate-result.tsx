import { Badge } from "@/components/ui/badge"
import { Check, X, AlertTriangle, Circle } from "lucide-react"
import { VerdictIcon, VERDICT_STYLES } from "@/lib/verdict-helpers"
import type { EvaluateResponse, ContractEvaluation } from "@/lib/api"

interface EvaluateResultProps {
  result: EvaluateResponse
}

const WOULD_DENY_STYLE = "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"

function verdictStyle(verdict: string): string {
  if (verdict === "call_would_deny") return WOULD_DENY_STYLE
  return VERDICT_STYLES[verdict] ?? VERDICT_STYLES.timeout ?? ""
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "deny": return "DENIED"
    case "allow": return "ALLOWED"
    case "call_would_deny": return "WOULD DENY"
    case "warn": return "WARNING"
    case "approve": return "APPROVAL REQUIRED"
    default: return verdict.toUpperCase()
  }
}

function ContractLine({ c, isDeciding }: { c: ContractEvaluation; isDeciding: boolean }) {
  // Backend may return matched:false for the deciding contract — treat deciding as matched
  const acted = c.matched || isDeciding
  if (acted && c.effect === "deny") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <X className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
        <span className="font-mono text-xs">{c.id}</span>
        <span className="text-muted-foreground">— MATCHED → {c.effect}</span>
      </div>
    )
  }
  if (acted && (c.effect === "warn" || c.effect === "approve")) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-mono text-xs">{c.id}</span>
        <span className="text-muted-foreground">— MATCHED → {c.effect}</span>
        {c.message && <span className="text-xs text-muted-foreground">({c.message})</span>}
      </div>
    )
  }
  if (acted) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-mono text-xs">{c.id}</span>
        <span className="text-muted-foreground">— MATCHED → {c.effect ?? "passed"}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <Circle className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
      <span className="text-muted-foreground">— not matched</span>
    </div>
  )
}

export function EvaluateResult({ result }: EvaluateResultProps) {
  const verdictKey = result.verdict === "deny" ? "denied" : result.verdict === "allow" ? "allowed" : result.verdict

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {/* Verdict badge */}
      <div className="flex items-center gap-3">
        <VerdictIcon verdict={verdictKey} className="size-5" />
        <Badge variant="outline" className={`text-sm font-semibold ${verdictStyle(result.verdict)}`}>
          {verdictLabel(result.verdict)}
        </Badge>
        {result.deciding_contract && (
          <span className="text-sm text-muted-foreground">
            by <span className="font-mono">{result.deciding_contract}</span>
          </span>
        )}
      </div>

      {/* Message from deciding contract */}
      {result.contracts_evaluated.find((c) => c.id === result.deciding_contract)?.message && (
        <div className="rounded bg-muted p-2 font-mono text-sm">
          {result.contracts_evaluated.find((c) => c.id === result.deciding_contract)!.message}
        </div>
      )}

      {/* Pipeline trace */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Contracts evaluated: {result.contracts_evaluated.length}
        </p>
        <div className="ml-2 space-y-0.5">
          {result.contracts_evaluated.map((c) => (
            <ContractLine key={c.id} c={c} isDeciding={c.id === result.deciding_contract} />
          ))}
        </div>
      </div>

      {/* Evaluation time */}
      <p className="text-xs text-muted-foreground">
        Evaluation time: {result.evaluation_time_ms}ms
      </p>
    </div>
  )
}
