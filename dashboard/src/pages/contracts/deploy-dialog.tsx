import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Rocket, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { deployBundle, getAgentStatus, type BundleWithDeployments } from "@/lib/api"
import { EnvBadge } from "@/lib/env-colors"

interface DeployDialogProps {
  bundleName: string
  version: number
  allBundles: BundleWithDeployments[]
  changeSummary: string | null
  onSuccess: () => void
}

const ENVS = ["production", "staging", "development"] as const

export function DeployDialog({
  bundleName, version, allBundles, changeSummary, onSuccess,
}: DeployDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedEnv, setSelectedEnv] = useState<string>("production")
  const [deploying, setDeploying] = useState(false)
  const [agents, setAgents] = useState<{ agent_id: string; env: string }[]>([])

  const currentlyDeployed = allBundles.find((b) => b.deployed_envs.includes(selectedEnv))
  const envAgents = agents.filter((a) => a.env === selectedEnv)

  useEffect(() => {
    if (!open) return
    getAgentStatus(bundleName)
      .then((s) => setAgents(s.agents))
      .catch(() => setAgents([]))
  }, [open, bundleName])

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
          <DialogTitle>Deploy v{version}</DialogTitle>
          <DialogDescription>
            All agents connected to the target environment will receive the updated contracts live.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Target environment</Label>
            <Select value={selectedEnv} onValueChange={setSelectedEnv}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENVS.map((env) => (
                  <SelectItem key={env} value={env}>
                    <div className="flex items-center gap-2">
                      <EnvBadge env={env} />
                      <span className="text-xs text-muted-foreground">
                        {agents.filter((a) => a.env === env).length} connected
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currently deployed version */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Current version:</span>
            {currentlyDeployed ? (
              <span className="font-mono font-medium text-foreground">v{currentlyDeployed.version}</span>
            ) : (
              <span className="italic">not deployed</span>
            )}
            {changeSummary && (
              <span className="text-xs">· {changeSummary}</span>
            )}
          </div>

          {/* Connected agents */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {envAgents.length > 0
                ? `${envAgents.length} agent${envAgents.length !== 1 ? "s" : ""} will receive this update`
                : "No agents currently connected to this environment"}
            </Label>
            {envAgents.length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                {envAgents.map((a) => (
                  <div key={a.agent_id} className="flex items-center gap-2 text-xs">
                    <Wifi className="size-3 shrink-0 text-emerald-500" />
                    <span className="font-mono text-muted-foreground">{a.agent_id}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <WifiOff className="size-3.5 shrink-0" />
                <span>
                  The bundle will still deploy — agents will pick it up when they connect.
                </span>
              </div>
            )}
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
