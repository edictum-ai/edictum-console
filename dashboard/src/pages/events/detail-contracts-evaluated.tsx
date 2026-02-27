import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, CheckCircle2, XCircle } from "lucide-react"

interface ContractResult {
  name: string
  type: string
  passed: boolean
  message?: string
  observed?: boolean
}

interface ContractsEvaluatedCardProps {
  contracts: ContractResult[]
}

export function ContractsEvaluatedCard({ contracts }: ContractsEvaluatedCardProps) {
  if (contracts.length === 0) return null

  return (
    <Card className="border-border bg-background/50 p-0">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">
          Contracts Evaluated
        </span>
      </div>
      <div className="space-y-2 p-3">
        {contracts.map((c) => (
          <div
            key={`${c.name}-${c.type}`}
            className="flex items-start gap-2 rounded-md border border-border bg-background/50 px-2.5 py-2"
          >
            {c.passed ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
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
                    className="h-4 rounded px-1 text-[9px] font-normal border-amber-500/30 text-amber-600 dark:text-amber-400"
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
  )
}
