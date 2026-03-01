import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Shield, Copy, Check } from "lucide-react"
import { formatDecisionSource } from "@/lib/payload-helpers"
import { DetailRow } from "@/components/detail-row"

interface Provenance {
  contractName: string | null
  decisionSource: string | null
  reason: string | null
  policyVersion: string | null
}

export function DecisionContextCard({ prov }: { prov: Provenance }) {
  const [copiedVersion, setCopiedVersion] = useState(false)

  if (!(prov.contractName ?? prov.decisionSource ?? prov.reason)) return null

  const handleCopyVersion = async () => {
    if (!prov.policyVersion) return
    await navigator.clipboard.writeText(prov.policyVersion)
    setCopiedVersion(true)
    setTimeout(() => setCopiedVersion(false), 1500)
  }

  return (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCopyVersion()}
                className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              >
                {copiedVersion ? (
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
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
  )
}
