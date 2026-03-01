/**
 * Tooltip content for contract concepts.
 * All "Learn more" links point to docs.edictum.dev.
 */

import { ExternalLink } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const DOCS = "https://docs.edictum.dev"

interface DocTooltipProps {
  children: React.ReactNode
  title: string
  description: string
  href: string
}

function DocTooltip({ children, title, description, href }: DocTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[220px] space-y-1 p-3">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Docs <ExternalLink className="size-2.5" />
        </a>
      </TooltipContent>
    </Tooltip>
  )
}

export const EFFECT_TOOLTIPS: Record<string, { title: string; description: string; href: string }> = {
  deny: {
    title: "deny",
    description: "Blocks the tool call. The agent receives an error and cannot proceed.",
    href: `${DOCS}/contracts/effects#deny`,
  },
  approve: {
    title: "approve",
    description: "Auto-approves the tool call, bypassing any HITL queues.",
    href: `${DOCS}/contracts/effects#approve`,
  },
  warn: {
    title: "warn",
    description: "Allows the call but emits a warning in the audit log.",
    href: `${DOCS}/contracts/effects#warn`,
  },
  redact: {
    title: "redact",
    description: "Allows the call but redacts matching data from the result.",
    href: `${DOCS}/contracts/effects#redact`,
  },
  observe: {
    title: "observe",
    description: "Logs the event without blocking. Used for monitoring in shadow mode.",
    href: `${DOCS}/contracts/effects#observe`,
  },
}

export const TYPE_TOOLTIPS: Record<string, { title: string; description: string; href: string }> = {
  pre: {
    title: "pre — precondition",
    description: "Evaluated before tool execution. Can deny, warn, approve, or require HITL sign-off.",
    href: `${DOCS}/contracts/types#pre`,
  },
  post: {
    title: "post — postcondition",
    description: "Evaluated after tool execution using the result. Used for output validation.",
    href: `${DOCS}/contracts/types#post`,
  },
  session: {
    title: "session — session limit",
    description: "Spans an entire conversation session. Used for call budgets and rate limits.",
    href: `${DOCS}/contracts/types#session`,
  },
  sandbox: {
    title: "sandbox",
    description: "Restricts which tools an agent can call within a defined scope.",
    href: `${DOCS}/contracts/types#sandbox`,
  },
}

export const MODE_TOOLTIPS: Record<string, { title: string; description: string; href: string }> = {
  enforce: {
    title: "enforce",
    description: "Violations block execution. The default mode for production.",
    href: `${DOCS}/contracts/modes#enforce`,
  },
  observe: {
    title: "observe",
    description: "Violations are logged but allowed through. Use for shadow testing.",
    href: `${DOCS}/contracts/modes#observe`,
  },
  log: {
    title: "log",
    description: "Silent logging only — no side effects on the agent.",
    href: `${DOCS}/contracts/modes#log`,
  },
}

export const SIDE_EFFECT_TOOLTIPS: Record<string, { title: string; description: string; href: string }> = {
  irreversible: {
    title: "irreversible",
    description: "Actions that cannot be undone: file deletion, code execution, shell commands.",
    href: `${DOCS}/contracts/side-effects#irreversible`,
  },
  write: {
    title: "write",
    description: "Modifies state but is potentially reversible.",
    href: `${DOCS}/contracts/side-effects#write`,
  },
  read: {
    title: "read",
    description: "Read-only access. Lowest risk classification.",
    href: `${DOCS}/contracts/side-effects#read`,
  },
}

/** Wrap any element with a doc tooltip, or render as-is if no tooltip defined */
export function withDocTooltip(
  node: React.ReactNode,
  map: Record<string, { title: string; description: string; href: string }>,
  key: string,
): React.ReactNode {
  const tip = map[key]
  if (!tip) return node
  return (
    <DocTooltip title={tip.title} description={tip.description} href={tip.href}>
      {node as React.ReactElement}
    </DocTooltip>
  )
}
