import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, AlertCircle } from "lucide-react"
import { createAssignmentRule } from "@/lib/api/agents"
import { EnvBadge } from "@/lib/env-colors"
import { toast } from "sonner"

const ENVS = ["production", "staging", "development"] as const

interface AddRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bundleNames: string[]
  existingPriorities: number[]
  onCreated: () => void
}

export function AddRuleDialog({
  open,
  onOpenChange,
  bundleNames,
  existingPriorities,
  onCreated,
}: AddRuleDialogProps) {
  const nextPriority = existingPriorities.length > 0
    ? Math.max(...existingPriorities) + 10
    : 10

  const [priority, setPriority] = useState(String(nextPriority))
  const [pattern, setPattern] = useState("")
  const [tagMatchRaw, setTagMatchRaw] = useState("")
  const [bundleName, setBundleName] = useState("")
  const [env, setEnv] = useState("production")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setError(null)

    const priorityNum = parseInt(priority, 10)
    if (isNaN(priorityNum) || priorityNum < 0) {
      setError("Priority must be a non-negative integer")
      return
    }
    if (!pattern.trim()) {
      setError("Pattern is required")
      return
    }
    if (!bundleName) {
      setError("Bundle is required")
      return
    }

    let tagMatch: Record<string, string> | null = null
    if (tagMatchRaw.trim()) {
      try {
        tagMatch = JSON.parse(tagMatchRaw.trim())
        if (typeof tagMatch !== "object" || Array.isArray(tagMatch)) {
          setError("Tag match must be a JSON object, e.g. {\"role\": \"finance\"}")
          return
        }
      } catch {
        setError("Invalid JSON in tag match")
        return
      }
    }

    setCreating(true)
    try {
      await createAssignmentRule({
        priority: priorityNum,
        pattern: pattern.trim(),
        tag_match: tagMatch,
        bundle_name: bundleName,
        env,
      })
      toast.success(`Created rule #${priorityNum}: ${pattern.trim()}`)
      onCreated()
      handleClose(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  const handleClose = (v: boolean) => {
    if (!v) {
      setPriority(String(nextPriority))
      setPattern("")
      setTagMatchRaw("")
      setBundleName("")
      setEnv("production")
      setError(null)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Assignment Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input
                type="number"
                min={0}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="10"
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">Lower = evaluated first</p>
            </div>
            <div className="space-y-2">
              <Label>Pattern</Label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="finance-*"
                className="h-8 font-mono"
              />
              <p className="text-xs text-muted-foreground">Glob: * ? supported</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tag Match (optional)</Label>
            <Textarea
              value={tagMatchRaw}
              onChange={(e) => setTagMatchRaw(e.target.value)}
              placeholder='{"role": "finance", "team": "trading"}'
              className="h-16 resize-none font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">JSON object. All tags must match (AND logic).</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bundle</Label>
              <Select value={bundleName} onValueChange={setBundleName}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select bundle" />
                </SelectTrigger>
                <SelectContent>
                  {bundleNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={env} onValueChange={setEnv}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVS.map((e) => (
                    <SelectItem key={e} value={e}>
                      <EnvBadge env={e} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
