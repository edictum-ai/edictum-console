import { Bell } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

interface ChannelEmptyStateProps {
  onCreateClick: () => void
}

export function ChannelEmptyState({ onCreateClick }: ChannelEmptyStateProps) {
  return (
    <EmptyState
      icon={<Bell className="h-10 w-10" />}
      title="No notification channels"
      description="Get alerted when approvals are requested, contracts are deployed, or agents disconnect. Supports Telegram, Slack, webhooks, and email."
      action={{ label: "Add Channel", onClick: onCreateClick }}
    />
  )
}
