import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChannelEmptyStateProps {
  onCreateClick: () => void
}

export function ChannelEmptyState({ onCreateClick }: ChannelEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Bell className="size-10 text-muted-foreground" />
      <p className="mt-3 font-medium">No notification channels</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Configure channels to receive alerts when approvals are requested,
        contracts are deployed, or agents disconnect.
      </p>
      <Button className="mt-4" onClick={onCreateClick}>
        Add Channel
      </Button>
    </div>
  )
}
