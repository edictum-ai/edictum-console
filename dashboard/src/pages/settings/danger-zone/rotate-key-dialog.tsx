import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { rotateSigningKey } from "@/lib/api"

interface RotateKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RotateKeyDialog({ open, onOpenChange }: RotateKeyDialogProps) {
  const [confirm, setConfirm] = useState("")
  const [rotating, setRotating] = useState(false)

  const canConfirm = confirm === "rotate" && !rotating

  async function handleRotate() {
    setRotating(true)
    try {
      const result = await rotateSigningKey()
      toast.success(
        `Signing key rotated. ${result.deployments_re_signed} deployment(s) re-signed.`,
      )
      onOpenChange(false)
    } catch {
      toast.error("Failed to rotate signing key")
    } finally {
      setRotating(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setConfirm("")
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rotate Signing Key</AlertDialogTitle>
          <AlertDialogDescription>
            This will generate a new Ed25519 signing key. All active
            deployments will be re-signed and connected agents will need to
            re-fetch contracts. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rotate-confirm">
            Type <span className="font-mono font-semibold">rotate</span> to
            confirm
          </Label>
          <Input
            id="rotate-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="rotate"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={rotating}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={handleRotate}
          >
            {rotating && <Loader2 className="mr-2 size-4 animate-spin" />}
            Rotate Key
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
