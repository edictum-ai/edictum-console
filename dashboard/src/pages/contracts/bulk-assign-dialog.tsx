import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, AlertCircle, Package } from "lucide-react"
import { bulkAssignBundle } from "@/lib/api/agents"
import { toast } from "sonner"

interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAgentIds: string[]
  bundleNames: string[]
  onAssigned: () => void
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  selectedAgentIds,
  bundleNames,
  onAssigned,
}: BulkAssignDialogProps) {
  const [bundleName, setBundleName] = useState<string>("")
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAssign = async () => {
    if (!bundleName) return
    setAssigning(true)
    setError(null)
    try {
      const res = await bulkAssignBundle(selectedAgentIds, bundleName)
      toast.success(`Assigned ${bundleName} to ${res.updated} agent${res.updated !== 1 ? "s" : ""}`)
      onAssigned()
      handleClose(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk assign failed")
    } finally {
      setAssigning(false)
    }
  }

  const handleClose = (v: boolean) => {
    if (!v) {
      setBundleName("")
      setError(null)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Assign Bundle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Assign a bundle to{" "}
            <span className="font-medium text-foreground">
              {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? "s" : ""}
            </span>.
          </p>

          <div className="space-y-2">
            <Label>Bundle</Label>
            <Select value={bundleName} onValueChange={setBundleName}>
              <SelectTrigger>
                <SelectValue placeholder="Select a bundle" />
              </SelectTrigger>
              <SelectContent>
                {bundleNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    <div className="flex items-center gap-2">
                      <Package className="size-3.5 text-muted-foreground" />
                      {name}
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
          <Button onClick={handleAssign} disabled={assigning || !bundleName}>
            {assigning && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
