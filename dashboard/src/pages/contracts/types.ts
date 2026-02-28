export type ContractType = "pre" | "post" | "session" | "sandbox"
export type Effect = "deny" | "approve" | "warn" | "redact"
export type Mode = "enforce" | "observe"

export type SideEffect = "pure" | "read" | "write" | "irreversible"

export interface ToolClassification {
  side_effect: SideEffect
}

export interface ContractBundle {
  apiVersion: "edictum/v1"
  kind: "ContractBundle"
  metadata: { name: string; description?: string }
  defaults: { mode: Mode }
  tools?: Record<string, ToolClassification>
  observe_alongside?: boolean
  contracts: ParsedContract[]
}

export interface ParsedContract {
  id: string
  type: ContractType
  enabled?: boolean
  mode?: Mode
  tool?: string
  tools?: string[]
  when?: Expression
  then?: ActionBlock
  // sandbox
  within?: string[]
  not_within?: string[]
  allows?: { commands?: string[]; domains?: string[] }
  not_allows?: { domains?: string[] }
  outside?: "deny" | "approve"
  message?: string
  // session
  limits?: {
    max_tool_calls?: number
    max_attempts?: number
    max_calls_per_tool?: Record<string, number>
  }
}

export interface ActionBlock {
  effect: Effect
  message: string
  tags?: string[]
  metadata?: Record<string, unknown>
  timeout?: number
  timeout_effect?: "deny" | "allow"
}

export type Expression =
  | { all: Expression[] }
  | { any: Expression[] }
  | { not: Expression }
  | Record<string, Record<string, unknown>> // leaf: selector -> operator -> value

export interface ContractDiff {
  added: ParsedContract[]
  removed: ParsedContract[]
  modified: Array<{
    id: string
    old: ParsedContract
    new: ParsedContract
    changes: string[]
  }>
  unchanged: string[]
}
