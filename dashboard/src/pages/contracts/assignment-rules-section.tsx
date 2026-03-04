import { useState, useEffect, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, Plus, Trash2, Loader2, Info } from "lucide-react"
import {
  getAssignmentRules,
  deleteAssignmentRule,
  type AssignmentRule,
} from "@/lib/api/agents"
import { EnvBadge } from "@/lib/env-colors"
import { toast } from "sonner"
import { AddRuleDialog } from "./add-rule-dialog"
import { ResolutionPreview } from "./resolution-preview"

interface AssignmentRulesSectionProps {
  bundleNames: string[]
}

export function AssignmentRulesSection({ bundleNames }: AssignmentRulesSectionProps) {
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fetchGenRef = useRef(0)

  const fetchRules = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setError(null)
    try {
      const data = await getAssignmentRules()
      if (gen !== fetchGenRef.current) return
      setRules(data)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      setError(e instanceof Error ? e.message : "Failed to load rules")
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAssignmentRule(deleteTarget.id)
      toast.success(`Deleted rule #${deleteTarget.priority}`)
      setDeleteTarget(null)
      await fetchRules()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" size="sm" className="ml-2" onClick={() => { setLoading(true); fetchRules() }}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger>
            <Info className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            Rules match agents by glob pattern and tags. Lower priority number = evaluated first.
            Explicit assignments always override rules.
          </TooltipContent>
        </Tooltip>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5 mr-1.5" />
          Add Rule
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            No assignment rules. Agents use explicit assignments or their own bundle_name.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Priority</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Tag Match</TableHead>
              <TableHead>Bundle</TableHead>
              <TableHead className="w-28">Environment</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-sm">{rule.priority}</TableCell>
                <TableCell className="font-mono text-sm">{rule.pattern}</TableCell>
                <TableCell>
                  {rule.tag_match ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(rule.tag_match).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">
                          {k}={v}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{rule.bundle_name}</TableCell>
                <TableCell><EnvBadge env={rule.env} /></TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(rule)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Separator />
      <ResolutionPreview />

      <AddRuleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        bundleNames={bundleNames}
        existingPriorities={rules.map((r) => r.priority)}
        onCreated={fetchRules}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule #{deleteTarget?.priority}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pattern <code className="font-mono">{deleteTarget?.pattern}</code> will no longer match agents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDelete() }}
            >
              {deleting ? <><Loader2 className="animate-spin" /> Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
