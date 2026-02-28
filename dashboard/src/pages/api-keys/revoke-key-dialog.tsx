import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteKey, type ApiKeyInfo } from "@/lib/api"

interface RevokeKeyDialogProps {
  keyToRevoke: ApiKeyInfo | null
  onOpenChange: (open: boolean) => void
  onRevoked: () => void
}

export function RevokeKeyDialog({ keyToRevoke, onOpenChange, onRevoked }: RevokeKeyDialogProps) {
  const [confirmInput, setConfirmInput] = useState("")
  const [revoking, setRevoking] = useState(false)

  const hasLabel = !!keyToRevoke?.label
  const confirmDisabled = hasLabel && confirmInput !== keyToRevoke?.label

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setConfirmInput("")
      setRevoking(false)
    }
    onOpenChange(isOpen)
  }

  async function handleRevoke() {
    if (!keyToRevoke) return
    setRevoking(true)
    try {
      await deleteKey(keyToRevoke.id)
      toast.success("API key revoked")
      setConfirmInput("")
      setRevoking(false)
      onOpenChange(false)
      onRevoked()
    } catch {
      toast.error("Failed to revoke key")
      setRevoking(false)
    }
  }

  return (
    <AlertDialog open={keyToRevoke !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
          <AlertDialogDescription>
            {hasLabel
              ? `Revoke "${keyToRevoke?.label}"? Any agents using this key will immediately lose access.`
              : `Revoke key ${keyToRevoke?.prefix}? Any agents using this key will immediately lose access.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasLabel && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-label">Type the key label to confirm</Label>
            <Input
              id="confirm-label"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={keyToRevoke?.label ?? ""}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={revoking || confirmDisabled}
            onClick={handleRevoke}
          >
            {revoking && <Loader2 className="mr-2 size-4 animate-spin" />}
            Revoke
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
