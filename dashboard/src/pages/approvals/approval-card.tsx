import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Bot,
  CheckCircle2,
  Clock,
  MessageSquare,
  Shield,
  ShieldAlert,
} from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"
import { formatDecisionSource } from "@/lib/payload-helpers"
import { TimerBadge, TimerBar, getTimerState } from "./timer"
import { EnvBadge } from "./badges"
import { DenyButton } from "./deny-button"

function formatToolArgs(toolArgs: Record<string, unknown> | null): string {
  if (!toolArgs) return "(no arguments)"
  return JSON.stringify(toolArgs, null, 2)
}

interface ApprovalCardProps {
  approval: ApprovalResponse
  onApprove: (id: string) => void
  onDeny: (id: string, reason: string) => void
  acting?: boolean
}

export function ApprovalCard({ approval, onApprove, onDeny, acting }: ApprovalCardProps) {
  const { zone } = getTimerState(approval.created_at, approval.timeout_seconds)

  const borderColor: Record<string, string> = {
    green: "",
    amber: "border-amber-500/20",
    red: "border-red-500/30",
    expired: "border-zinc-500/30",
  }

  const bgTint = zone === "red" && approval.timeout_effect === "allow"
    ? "bg-red-500/[0.04]"
    : zone === "red"
      ? "bg-red-500/[0.02]"
      : ""

  return (
    <Card className={`flex flex-col border border-border bg-card ${borderColor[zone] ?? ""} ${bgTint} transition-all`}>
      <CardContent className="flex flex-col flex-1 p-4 space-y-3">
        {/* Row 1: Tool + Agent + Timer */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <ShieldAlert className="size-4.5 text-amber-500 dark:text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-card-foreground">{approval.tool_name}</span>
                <EnvBadge env={approval.env} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Bot className="size-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">{approval.agent_id}</span>
              </div>
            </div>
          </div>
          <TimerBadge createdAt={approval.created_at} timeoutSeconds={approval.timeout_seconds} />
        </div>

        {/* Row 2: Contract provenance */}
        {(approval.contract_name || approval.decision_source) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="size-3" />
            <span>Required by contract: </span>
            <code className="font-mono text-foreground">
              {approval.contract_name ?? formatDecisionSource(approval.decision_source)}
            </code>
          </div>
        )}

        {/* Row 3: Timer bar */}
        <TimerBar createdAt={approval.created_at} timeoutSeconds={approval.timeout_seconds} showLabel={false} />

        {/* Row 3: Agent message */}
        {approval.message && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
            <MessageSquare className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{approval.message}</p>
          </div>
        )}

        {/* Row 4: Tool arguments */}
        <div className="rounded-md border border-border bg-muted/50 dark:bg-zinc-950/80 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Tool Arguments</p>
          <pre className="text-sm font-mono text-card-foreground leading-relaxed break-all whitespace-pre-wrap">
            {formatToolArgs(approval.tool_args)}
          </pre>
        </div>

        {/* Row 5: Timeout effect */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>
            On timeout:{" "}
            <span
              className={
                approval.timeout_effect === "allow"
                  ? "text-amber-600 dark:text-amber-400 font-medium"
                  : "text-red-600 dark:text-red-400 font-medium"
              }
            >
              {approval.timeout_effect === "deny" ? "Request denied" : "Request allowed (dangerous)"}
            </span>
          </span>
        </div>

        {/* Spacer pushes actions to bottom of card */}
        <div className="flex-1" />

        {/* Row 6: Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex-[2]"
            onClick={() => onApprove(approval.id)}
            disabled={acting || zone === "expired"}
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
          <div className="flex-1 min-w-[100px]">
            <DenyButton
              onDeny={(reason) => onDeny(approval.id, reason)}
              disabled={acting || zone === "expired"}
              fullWidth
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
