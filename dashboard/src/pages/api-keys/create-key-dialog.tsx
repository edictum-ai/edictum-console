import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createKey, type CreateKeyResponse } from "@/lib/api"

interface CreateKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateKeyDialog({ open, onOpenChange, onCreated }: CreateKeyDialogProps) {
  const [step, setStep] = useState<"form" | "secret">("form")
  const [label, setLabel] = useState("")
  const [env, setEnv] = useState("production")
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreateKeyResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedExport, setCopiedExport] = useState(false)

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      const hadKey = createdKey !== null
      setStep("form")
      setLabel("")
      setEnv("production")
      setCreating(false)
      setCreatedKey(null)
      setCopied(false)
      setCopiedExport(false)
      clearTimeout(copyTimerRef.current)
      clearTimeout(copyExportTimerRef.current)
      onOpenChange(false)
      if (hadKey) onCreated()
    } else {
      onOpenChange(true)
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const result = await createKey(env, label.trim())
      setCreatedKey(result)
      setStep("secret")
    } catch {
      toast.error("Failed to create API key")
    } finally {
      setCreating(false)
    }
  }

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const copyExportTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    return () => {
      clearTimeout(copyTimerRef.current)
      clearTimeout(copyExportTimerRef.current)
    }
  }, [])

  async function handleCopy() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
    } catch {
      toast.error("Failed to copy — please select and copy manually")
      return
    }
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  async function handleCopyExport() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(`export EDICTUM_API_KEY=${createdKey.key}`)
      setCopiedExport(true)
    } catch {
      toast.error("Failed to copy — please select and copy manually")
      return
    }
    clearTimeout(copyExportTimerRef.current)
    copyExportTimerRef.current = setTimeout(() => setCopiedExport(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                API keys authenticate agents connecting to the server.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="key-label">Label</Label>
                <Input
                  id="key-label"
                  placeholder="e.g. production-agent-1"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-env">Environment</Label>
                <Select value={env} onValueChange={setEnv}>
                  <SelectTrigger id="key-env">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Production keys connect deployed agents. Use staging for testing.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !label.trim()}>
                {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  Copy this key now. It won't be shown again.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdKey?.key ?? ""}
                  className="font-mono text-xs min-w-0"
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="transition-all shrink-0">
                  {copied ? (
                    <>
                      <Check className="mr-2 size-4 text-emerald-600 dark:text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="relative group">
                <pre className="rounded bg-muted p-3 pr-16 text-xs font-mono overflow-x-auto break-all whitespace-pre-wrap">
                  {`export EDICTUM_API_KEY=${createdKey?.key ?? ""}`}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyExport}
                  className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {copiedExport ? (
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
