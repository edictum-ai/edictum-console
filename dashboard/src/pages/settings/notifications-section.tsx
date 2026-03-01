import { useState, useEffect, useCallback } from "react"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listChannels, deleteChannel, updateChannel } from "@/lib/api"
import type { NotificationChannelInfo } from "@/lib/api"
import { toast } from "sonner"
import { ChannelTable } from "./notifications/channel-table"
import { ChannelDialog } from "./notifications/channel-dialog"
import { ChannelEmptyState } from "./notifications/channel-empty-state"

interface NotificationsSectionProps {
  onChannelCountChange: (count: number) => void
}

export function NotificationsSection({ onChannelCountChange }: NotificationsSectionProps) {
  const [channels, setChannels] = useState<NotificationChannelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<NotificationChannelInfo | null>(null)
  const [deletingChannel, setDeletingChannel] = useState<NotificationChannelInfo | null>(null)

  const fetchChannels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listChannels()
      setChannels(data)
      onChannelCountChange(data.filter((c) => c.enabled).length)
    } catch {
      setError("Failed to load notification channels")
    } finally {
      setLoading(false)
    }
  }, [onChannelCountChange])

  useEffect(() => { void fetchChannels() }, [fetchChannels])

  function openCreate() {
    setEditingChannel(null)
    setDialogOpen(true)
  }

  function openEdit(ch: NotificationChannelInfo) {
    setEditingChannel(ch)
    setDialogOpen(true)
  }

  async function handleToggleEnabled(ch: NotificationChannelInfo) {
    try {
      await updateChannel(ch.id, { enabled: !ch.enabled })
      toast.success(`${ch.name} ${ch.enabled ? "disabled" : "enabled"}`)
      void fetchChannels()
    } catch {
      toast.error(`Failed to ${ch.enabled ? "disable" : "enable"} channel`)
    }
  }

  async function handleDelete() {
    if (!deletingChannel) return
    try {
      await deleteChannel(deletingChannel.id)
      toast.success(`Deleted ${deletingChannel.name}`)
      setDeletingChannel(null)
      void fetchChannels()
    } catch {
      toast.error("Failed to delete channel")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Notification Channels</h2>
          <p className="text-sm text-muted-foreground">
            Receive alerts for approvals, deployments, and agent disconnects.
          </p>
        </div>
        {channels.length > 0 && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />Add Channel
          </Button>
        )}
      </div>

      {loading && channels.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error && channels.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void fetchChannels()}>Retry</Button>
        </div>
      ) : channels.length === 0 ? (
        <ChannelEmptyState onCreateClick={openCreate} />
      ) : (
        <ChannelTable channels={channels} onEdit={openEdit} onDelete={setDeletingChannel} onToggleEnabled={handleToggleEnabled} />
      )}

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channel={editingChannel}
        onSaved={fetchChannels}
      />

      <AlertDialog open={!!deletingChannel} onOpenChange={(o) => !o && setDeletingChannel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingChannel?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all notifications through this channel. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
