import { Send, Hash, Webhook } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const CHANNELS = [
  { icon: Send, label: "Telegram" },
  { icon: Hash, label: "Slack" },
  { icon: Webhook, label: "Webhook" },
] as const

export function NotificationsSection() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Notification Channels</h2>
      <Card>
        <CardHeader>
          <CardTitle>No channels configured</CardTitle>
          <CardDescription>
            Configure notification channels to receive alerts when approvals are
            requested, contracts are deployed, or agents disconnect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {CHANNELS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 py-2">
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
                <Badge variant="secondary" className="ml-auto">
                  Coming soon
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
