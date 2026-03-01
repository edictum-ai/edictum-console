import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { createChannel, updateChannel } from "@/lib/api"
import type { NotificationChannelInfo, ChannelType, ChannelFilters } from "@/lib/api"
import { toast } from "sonner"
import { ConfigFields, EMPTY_CONFIG } from "./config-fields"
import { FilterFields } from "./filter-fields"

interface ChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: NotificationChannelInfo | null
  onSaved: () => void
}

function isValid(name: string, type: ChannelType, config: Record<string, string>): boolean {
  if (!name.trim()) return false
  if (type === "telegram") return !!config.bot_token && !!config.chat_id
  if (type === "slack") return !!config.webhook_url
  if (type === "slack_app") return !!config.bot_token && !!config.signing_secret && !!config.slack_channel
  if (type === "webhook") return !!config.url
  if (type === "email") return !!config.smtp_host && !!config.from_address && !!config.to_addresses
  return false
}

export function ChannelDialog({ open, onOpenChange, channel, onSaved }: ChannelDialogProps) {
  const isEdit = !!channel
  const [name, setName] = useState("")
  const [type, setType] = useState<ChannelType>("telegram")
  const [config, setConfig] = useState<Record<string, string>>({ ...EMPTY_CONFIG.telegram })
  const [filters, setFilters] = useState<ChannelFilters | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (channel) {
      setName(channel.name)
      setType(channel.channel_type)
      setConfig(channel.config as Record<string, string>)
      setFilters(channel.filters)
    } else {
      setName("")
      setType("telegram")
      setConfig({ ...EMPTY_CONFIG.telegram })
      setFilters(null)
    }
  }, [open, channel])

  function handleTypeChange(val: ChannelType) {
    setType(val)
    setConfig({ ...EMPTY_CONFIG[val] })
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (isEdit) {
        await updateChannel(channel.id, { name, config, filters })
        toast.success("Channel updated")
      } else {
        await createChannel({ name, channel_type: type, config, filters })
        toast.success("Channel created")
      }
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(isEdit ? "Failed to update channel" : "Failed to create channel")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Channel" : "Add Channel"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update notification channel settings." : "Configure a new notification channel."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ch-name">Name</Label>
            <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ops Alerts" />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => handleTypeChange(v as ChannelType)} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="slack">Slack (Webhook)</SelectItem>
                <SelectItem value="slack_app">Slack (Interactive)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <ConfigFields type={type} config={config} onChange={setConfig} />
          </div>

          <Separator />
          <FilterFields filters={filters} onChange={setFilters} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !isValid(name, type, config)}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
