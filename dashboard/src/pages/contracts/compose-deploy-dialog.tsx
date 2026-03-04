import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Rocket, Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import {
  deployComposition,
  type ComposeDeployResponse,
} from "@/lib/api/compositions"
import { EnvBadge } from "@/lib/env-colors"
import { toast } from "sonner"

interface ComposeDeployDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compositionName: string
  contractCount: number
  onDeployed: () => void
}

const ENVS = ["production", "staging", "development"] as const

export function ComposeDeployDialog({
  open,
  onOpenChange,
  compositionName,
  contractCount,
  onDeployed,
}: ComposeDeployDialogProps) {
  const [env, setEnv] = useState<string>("staging")
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComposeDeployResponse | null>(null)

  const handleDeploy = async () => {
    setDeploying(true)
    setError(null)
    try {
      const res = await deployComposition(compositionName, env)
      setResult(res)
      toast.success(`Deployed ${compositionName} v${res.bundle_version} to ${env}`)
      onDeployed()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed")
    } finally {
      setDeploying(false)
    }
  }

  const handleClose = (v: boolean) => {
    if (!v) {
      setResult(null)
      setError(null)
      setEnv("staging")
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deploy — {compositionName}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <Alert>
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <AlertDescription className="leading-relaxed">
                Deployed <strong>{result.bundle_name}</strong> v{result.bundle_version} to <strong>{env}</strong>. {result.contracts_assembled.length} contract{result.contracts_assembled.length !== 1 ? "s" : ""} assembled.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={env} onValueChange={setEnv}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVS.map((e) => (
                    <SelectItem key={e} value={e}>
                      <div className="flex items-center gap-2">
                        <EnvBadge env={e} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {env === "production" && (
              <Alert>
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription>
                  Deploying to <span className="font-medium">production</span> will
                  push to agents subscribed to this bundle immediately.
                </AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-muted-foreground">
              This will assemble {contractCount} contract
              {contractCount !== 1 ? "s" : ""} and push to agents subscribed to this bundle in{" "}
              <span className="font-medium">{env}</span>.
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleDeploy} disabled={deploying}>
                {deploying ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Rocket className="size-4 mr-1.5" />
                )}
                Deploy
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
