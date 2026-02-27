import { Button } from "@/components/ui/button"
import { CheckCircle2, Code2, MessageSquare } from "lucide-react"
import type { ApprovalResponse } from "@/lib/api"
import { formatDecisionSource } from "@/lib/payload-helpers"
import { ChannelBadge, EnvBadge } from "./badges"
import { DenyButton } from "./deny-button"
import { getTimerState } from "./timer"

interface ExpandedDetailProps {
  approval: ApprovalResponse
  onApprove: (id: string) => void
  onDeny: (id: string, reason: string) => void
  acting?: boolean
}

export function ExpandedDetail({ approval, onApprove, onDeny, acting }: ExpandedDetailProps) {
  const { zone } = getTimerState(approval.created_at, approval.timeout_seconds)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Tool Args + Message */}
        <div className="col-span-2 space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tool Arguments</span>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
              {approval.tool_args ? JSON.stringify(approval.tool_args, null, 2) : "(no arguments)"}
            </pre>
          </div>
          {approval.message && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Agent Message</span>
              </div>
              <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground leading-relaxed">
                {approval.message}
              </p>
            </div>
          )}
        </div>

        {/* Right: Context + Actions */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-3">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Request Context
            </h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agent</dt>
                <dd className="font-mono text-xs">{approval.agent_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Environment</dt>
                <dd><EnvBadge env={approval.env} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Timeout</dt>
                <dd className="text-xs">{approval.timeout_seconds}s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">On timeout</dt>
                <dd className={`text-xs font-medium ${approval.timeout_effect === "allow" ? "text-amber-400" : "text-red-400"}`}>
                  {approval.timeout_effect}
                </dd>
              </div>
              {approval.contract_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Required by</dt>
                  <dd className="font-mono text-xs">{approval.contract_name}</dd>
                </div>
              )}
              {approval.decision_source && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Contract type</dt>
                  <dd className="text-xs">{formatDecisionSource(approval.decision_source)}</dd>
                </div>
              )}
              {approval.status !== "pending" && approval.decided_via && (
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground">Decided via</dt>
                  <dd><ChannelBadge channel={approval.decided_via} /></dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onApprove(approval.id)}
              disabled={acting || zone === "expired"}
            >
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
            <DenyButton
              onDeny={(reason) => onDeny(approval.id, reason)}
              disabled={acting || zone === "expired"}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
