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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, HelpCircle } from "lucide-react"
import { createComposition } from "@/lib/api/compositions"

interface NewBundleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string) => void
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/
const NAME_MAX_LEN = 128

const STRATEGY_TIPS: Record<string, string> = {
  manual: "You review and deploy updates manually. Safest option.",
  auto_deploy: "New contract versions are deployed automatically. Fastest.",
  observe_first: "New versions shadow-test in observe mode before promoting.",
}

export function NewBundleDialog({
  open,
  onOpenChange,
  onCreated,
}: NewBundleDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState("enforce")
  const [strategy, setStrategy] = useState("manual")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameValid = name.length > 0 && name.length <= NAME_MAX_LEN && NAME_RE.test(name)

  const handleCreate = async () => {
    if (!nameValid) return
    setCreating(true)
    setError(null)
    try {
      await createComposition({
        name,
        description: description || undefined,
        defaults_mode: mode,
        update_strategy: strategy,
      })
      onCreated(name)
      handleClose(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create bundle")
    } finally {
      setCreating(false)
    }
  }

  const handleClose = (v: boolean) => {
    if (!v) {
      setName("")
      setDescription("")
      setMode("enforce")
      setStrategy("manual")
      setError(null)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Bundle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bundle-name">Name</Label>
            <Input
              id="bundle-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="finance-agents"
              autoFocus
            />
            {name.length > 0 && !nameValid && (
              <p className="text-xs text-destructive">
                {name.length > NAME_MAX_LEN
                  ? `Name must be at most ${NAME_MAX_LEN} characters.`
                  : "Lowercase letters, digits, dots, hyphens, underscores. Must start with letter or digit."}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bundle-desc">Description (optional)</Label>
            <Input
              id="bundle-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contracts for the finance team agents"
            />
          </div>

          <div className="space-y-2">
            <Label>Default Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enforce">enforce</SelectItem>
                <SelectItem value="observe">observe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Update Strategy</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Controls how new contract versions are applied to this bundle.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger>
                <SelectValue>{strategy.replace(/_/g, " ")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STRATEGY_TIPS).map(([key, tip]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <span className="font-medium">{key.replace(/_/g, " ")}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{tip}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!nameValid || creating}>
            {creating && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
