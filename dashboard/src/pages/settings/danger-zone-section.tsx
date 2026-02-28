import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function DangerItem({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function DisabledButton({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant="destructive" disabled>
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  )
}

export function DangerZoneSection() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
      <Card className="border-destructive/50">
        <CardContent className="p-0">
          <DangerItem
            title="Rotate Signing Key"
            description="Generate a new Ed25519 signing key. All connected agents will need to re-fetch contracts."
          >
            <DisabledButton label="Rotate Key" />
          </DangerItem>

          <Separator />

          <DangerItem
            title="Purge Audit Events"
            description="Permanently delete all audit events older than a specified number of days."
          >
            <Select disabled>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="30 days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <DisabledButton label="Purge Events" />
          </DangerItem>
        </CardContent>
      </Card>
    </div>
  )
}
