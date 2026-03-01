import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RotateKeyDialog } from "./danger-zone/rotate-key-dialog"
import { PurgeEventsDialog } from "./danger-zone/purge-events-dialog"

export function DangerZoneSection() {
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false)
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [purgeDays, setPurgeDays] = useState(30)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-destructive">
          Danger Zone
        </h2>
        <p className="text-sm text-muted-foreground">
          These actions are irreversible. Proceed with caution.
        </p>
      </div>

      <Card className="border-destructive/50">
        <CardContent className="divide-y divide-border p-0">
          {/* Rotate Signing Key */}
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Rotate Signing Key</p>
              <p className="text-sm text-muted-foreground">
                Generate a new Ed25519 signing key. All connected agents will
                need to re-fetch contracts.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={() => setRotateDialogOpen(true)}
            >
              Rotate Key
            </Button>
          </div>

          {/* Purge Audit Events */}
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Purge Audit Events</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete all audit events older than a specified
                number of days.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={String(purgeDays)}
                onValueChange={(v) => setPurgeDays(Number(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="destructive"
                onClick={() => setPurgeDialogOpen(true)}
              >
                Purge Events
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <RotateKeyDialog
        open={rotateDialogOpen}
        onOpenChange={setRotateDialogOpen}
      />
      <PurgeEventsDialog
        open={purgeDialogOpen}
        onOpenChange={setPurgeDialogOpen}
        days={purgeDays}
      />
    </div>
  )
}
