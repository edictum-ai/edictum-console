import { Badge } from "@/components/ui/badge"
import { Shield } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import type { ContractCoverage } from "@/lib/api"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import type { ContractType, ContractBundle } from "./types"
import { ContractRow } from "./contract-row"

const TYPE_META: Record<ContractType, { label: string; desc: string }> = {
  pre: { label: "Preconditions", desc: "before execution" },
  post: { label: "Postconditions", desc: "after execution" },
  session: { label: "Session Limits", desc: "aggregate limits" },
  sandbox: { label: "Sandboxes", desc: "restrict operations" },
}

interface ContractsAccordionProps {
  nonEmptyTypes: ContractType[]
  grouped: Record<ContractType, ContractBundle["contracts"]>
  coverageMap: Map<string, ContractCoverage>
  defaultMode: string
}

export function ContractsAccordion({ nonEmptyTypes, grouped, coverageMap, defaultMode }: ContractsAccordionProps) {
  const sectionStats = (type: ContractType) => {
    const cs = grouped[type]
    const enforcing = cs.filter((c) => (c.mode ?? defaultMode) === "enforce").length
    const triggered = cs.filter((c) => coverageMap.has(c.id) && coverageMap.get(c.id)!.total_evaluations > 0).length
    return { enforcing, observing: cs.length - enforcing, triggered, total: cs.length }
  }

  return (
    <Accordion type="multiple" defaultValue={nonEmptyTypes}>
      {nonEmptyTypes.map((type) => {
        const stats = sectionStats(type)
        return (
          <AccordionItem key={type} value={type} className="border-b-0 mb-1">
            <AccordionTrigger className="rounded-md bg-muted/30 px-3 py-2 text-sm hover:bg-muted/50 hover:no-underline">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${CONTRACT_TYPE_COLORS[type]}`}>
                  {stats.total}
                </Badge>
                <span className="font-medium">{TYPE_META[type].label}</span>
                <span className="text-[11px] text-muted-foreground font-normal">{TYPE_META[type].desc}</span>
              </div>
              <div className="ml-auto mr-2 flex items-center gap-3 text-[11px] text-muted-foreground font-normal">
                <span className="flex items-center gap-1">
                  <Shield className="size-3 text-emerald-600 dark:text-emerald-400" />
                  {stats.enforcing}
                </span>
                {stats.observing > 0 && (
                  <span className="flex items-center gap-1">
                    <Shield className="size-3 text-amber-600 dark:text-amber-400" />
                    {stats.observing}
                  </span>
                )}
                {stats.total - stats.triggered > 0 && (
                  <span className="text-muted-foreground/50">{stats.total - stats.triggered} untriggered</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-0">
              <div className="space-y-px">
                {grouped[type].map((contract) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    coverage={coverageMap.get(contract.id) ?? null}
                    defaultMode={defaultMode}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
