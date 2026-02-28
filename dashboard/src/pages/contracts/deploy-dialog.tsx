import { useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Loader2, Rocket } from "lucide-react"
import { toast } from "sonner"
import { deployBundle, type BundleWithDeployments } from "@/lib/api"
import { EnvBadge } from "@/lib/env-colors"

interface DeployDialogProps {
  bundleName: string
  version: number
  allBundles: BundleWithDeployments[]
  changeSummary: string | null
  onSuccess: () => void
}

const ENVS = ["staging", "development", "production"] as const

export function DeployDialog({
  bundleName, version, allBundles, changeSummary, onSuccess,
}: DeployDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedEnv, setSelectedEnv] = useState<string>("staging")
  const [deploying, setDeploying] = useState(false)

  // Find currently deployed version for the selected env
  const currentlyDeployed = allBundles.find((b) =>
    b.deployed_envs.includes(selectedEnv),
  )

  const handleDeploy = async () => {
    setDeploying(true)
    try {
      await deployBundle(bundleName, version, selectedEnv)
      toast.success(`Deployed v${version} to ${selectedEnv}`)
      onSuccess()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed")
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
          <Rocket className="mr-1.5 size-3.5" />
          Deploy v{version}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy v{version} to environment</DialogTitle>
          <DialogDescription>Choose a target environment for this bundle version.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Environment</label>
            <Select value={selectedEnv} onValueChange={setSelectedEnv}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENVS.map((env) => (
                  <SelectItem key={env} value={env}>{env}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              Currently deployed:
              {currentlyDeployed ? (
                <span className="font-mono font-medium text-foreground">
                  v{currentlyDeployed.version}
                </span>
              ) : (
                <span className="italic">None</span>
              )}
            </div>
            {changeSummary && (
              <div className="text-muted-foreground">Changes: {changeSummary}</div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Target:</span>
            <EnvBadge env={selectedEnv} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={deploying}
            onClick={handleDeploy}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {deploying && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Deploy v{version}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
