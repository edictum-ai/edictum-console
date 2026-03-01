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
import { purgeEvents } from "@/lib/api/settings"

interface PurgeEventsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: number
}

export function PurgeEventsDialog({
  open,
  onOpenChange,
  days,
}: PurgeEventsDialogProps) {
  const [confirm, setConfirm] = useState("")
  const [purging, setPurging] = useState(false)

  const canConfirm = confirm === "purge events" && !purging

  async function handlePurge() {
    setPurging(true)
    try {
      const result = await purgeEvents(days)
      toast.success(
        `Purged ${result.deleted_count} event(s) older than ${days} days.`,
      )
      onOpenChange(false)
    } catch {
      toast.error("Failed to purge events")
    } finally {
      setPurging(false)
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
          <AlertDialogTitle>Purge Audit Events</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all audit events older than{" "}
            <span className="font-semibold">{days} days</span>. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="purge-confirm">
            Type{" "}
            <span className="font-mono font-semibold">purge events</span> to
            confirm
          </Label>
          <Input
            id="purge-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="purge events"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={handlePurge}
          >
            {purging && <Loader2 className="mr-2 size-4 animate-spin" />}
            Purge Events
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
