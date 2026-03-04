import { useEffect, useState, useCallback } from "react"
import yaml from "js-yaml"
import { Pencil, Copy, Trash2, Clock, Package, AlertCircle } from "lucide-react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { YamlEditor } from "@/components/yaml-editor"
import { CONTRACT_TYPE_COLORS } from "@/lib/contract-colors"
import { formatRelativeTime } from "@/lib/format"
import {
  getContract, getContractUsage,
  type LibraryContract, type ContractVersionInfo, type ContractUsageItem,
} from "@/lib/api/contracts"

interface ContractDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: string | null
  onEdit: (contractId: string) => void
  onDuplicate: (contractId: string) => void
  onDelete: (contractId: string) => void
}

export function ContractDetailSheet({
  open, onOpenChange, contractId, onEdit, onDuplicate, onDelete,
}: ContractDetailSheetProps) {
  const [contract, setContract] = useState<LibraryContract | null>(null)
  const [usage, setUsage] = useState<ContractUsageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [c, u] = await Promise.all([getContract(id), getContractUsage(id)])
      setContract(c)
      setUsage(u)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && contractId) {
      fetchData(contractId)
    } else if (!open) {
      setContract(null)
      setUsage([])
      setError(null)
    }
  }, [open, contractId, fetchData])

  const yamlStr = contract
    ? yaml.dump(contract.definition, { lineWidth: 80, noRefs: true })
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        {loading ? <LoadingSkeleton /> : error ? (
          <ErrorState error={error} onRetry={() => contractId && fetchData(contractId)} />
        ) : contract ? (
          <>
            <SheetHeader className="pr-8">
              <div className="flex items-center gap-2">
                <SheetTitle>{contract.name}</SheetTitle>
                <Badge variant="outline" className={CONTRACT_TYPE_COLORS[contract.type] ?? ""}>
                  {contract.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">v{contract.version}</Badge>
              </div>
              <SheetDescription className="font-mono text-xs">{contract.contract_id}</SheetDescription>
              {contract.description && (
                <p className="text-sm text-muted-foreground pt-1">{contract.description}</p>
              )}
              {contract.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {contract.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1 px-4">
              <div className="space-y-4 pb-4">
                <Separator />
                <Section title="Definition">
                  <YamlEditor value={yamlStr} readOnly height="200px" />
                </Section>

                <Separator />
                <Section title="Version History">
                  <VersionList versions={contract.versions} current={contract.version} />
                </Section>

                <Separator />
                <Section title="Usage">
                  <UsageList usage={usage} />
                </Section>
              </div>
            </ScrollArea>

            <SheetFooter className="flex-row gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => onEdit(contract.contract_id)}>
                <Pencil className="size-3.5 mr-1.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDuplicate(contract.contract_id)}>
                <Copy className="size-3.5 mr-1.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 dark:text-red-400 hover:bg-red-500/10"
                onClick={() => onDelete(contract.contract_id)}>
                <Trash2 className="size-3.5 mr-1.5" /> Delete
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2">
    <h4 className="text-sm font-medium text-foreground">{title}</h4>
    {children}
  </div>
}

function VersionList({ versions, current }: { versions: ContractVersionInfo[]; current: number }) {
  if (versions.length === 0) return <p className="text-sm text-muted-foreground">No version history</p>
  return (
    <div className="space-y-1">
      {[...versions].reverse().map((v) => (
        <div key={v.version}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            v.version === current ? "bg-accent font-medium" : ""
          }`}>
          <Badge variant={v.version === current ? "default" : "outline"} className="text-xs min-w-[3rem] justify-center">
            v{v.version}
          </Badge>
          <Clock className="size-3 text-zinc-600 dark:text-zinc-400" />
          <span className="text-zinc-600 dark:text-zinc-400">{formatRelativeTime(v.created_at)}</span>
          <span className="ml-auto text-xs text-muted-foreground">{v.created_by}</span>
        </div>
      ))}
    </div>
  )
}

function UsageList({ usage }: { usage: ContractUsageItem[] }) {
  if (usage.length === 0) return <p className="text-sm text-muted-foreground">Not used in any bundles</p>
  return (
    <div className="space-y-1">
      {usage.map((comp) => (
        <div key={comp.composition_id} className="flex items-center gap-2 text-sm">
          <Package className="size-3.5 text-blue-600 dark:text-blue-400" />
          <span>{comp.composition_name}</span>
        </div>
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-full" />
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="m-4">
      <AlertCircle className="size-4" />
      <AlertTitle>Error loading contract</AlertTitle>
      <AlertDescription>
        {error}{" "}
        <Button variant="outline" size="sm" className="ml-2" onClick={onRetry}>Retry</Button>
      </AlertDescription>
    </Alert>
  )
}
