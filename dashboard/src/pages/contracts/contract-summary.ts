import type { Expression, ParsedContract } from "./types"
import { truncate } from "@/lib/format"

/**
 * Render a human-readable summary string for a contract.
 * Pure function — no JSX.
 */
export function renderContractSummary(contract: ParsedContract): string {
  switch (contract.type) {
    case "pre":
      return renderPreSummary(contract)
    case "post":
      return renderPostSummary(contract)
    case "session":
      return renderSessionSummary(contract)
    case "sandbox":
      return renderSandboxSummary(contract)
    default:
      return `Unknown contract type: ${contract.type}`
  }
}

function renderPreSummary(c: ParsedContract): string {
  const effect = c.then?.effect ?? "deny"
  const verb =
    effect === "deny" ? "Denies" : effect === "approve" ? "Approves" : "Warns on"
  const tool = c.tool ?? c.tools?.join(", ") ?? "*"
  const when = c.when ? ` when ${renderExpression(c.when)}` : ""
  return `${verb} ${tool}${when}`
}

function renderPostSummary(c: ParsedContract): string {
  const effect = c.then?.effect ?? "warn"
  const verb =
    effect === "redact"
      ? "Redacts output from"
      : effect === "warn"
        ? "Warns on"
        : "Checks"
  const tool = c.tool ?? c.tools?.join(", ") ?? "*"
  const when = c.when ? ` when ${renderExpression(c.when)}` : ""
  return `${verb} ${tool}${when}`
}

function renderSessionSummary(c: ParsedContract): string {
  const parts: string[] = []
  if (c.limits?.max_tool_calls) parts.push(`max ${c.limits.max_tool_calls} tool calls`)
  if (c.limits?.max_attempts) parts.push(`${c.limits.max_attempts} attempts`)
  if (c.limits?.max_calls_per_tool) {
    const perTool = Object.entries(c.limits.max_calls_per_tool)
      .map(([tool, n]) => `${tool}: ${n}`)
      .join(", ")
    parts.push(`per-tool limits: ${perTool}`)
  }
  return parts.length > 0 ? parts.join(", ") : "Session constraints"
}

function renderSandboxSummary(c: ParsedContract): string {
  const tools = c.tools?.join(", ") ?? c.tool ?? "*"
  const parts: string[] = [`Restricts ${tools}`]
  if (c.within?.length) parts.push(`to ${c.within.join(", ")}`)
  if (c.not_within?.length) parts.push(`excluding ${c.not_within.join(", ")}`)
  if (c.allows?.commands?.length) {
    const cmds = c.allows.commands
    const preview =
      cmds.length > 5
        ? `${cmds.slice(0, 5).join(", ")}... ${cmds.length - 5} more`
        : cmds.join(", ")
    parts.push(`allows commands: ${preview}`)
  }
  if (c.allows?.domains?.length) {
    parts.push(`allows domains: ${c.allows.domains.join(", ")}`)
  }
  if (c.not_allows?.domains?.length) {
    parts.push(`blocks domains: ${c.not_allows.domains.join(", ")}`)
  }
  return parts.join("; ")
}

function renderExpression(expr: Expression): string {
  if ("all" in expr) {
    const parts = (expr as { all: Expression[] }).all.map(renderExpression)
    return parts.length === 1 ? parts[0] : parts.map((s) => `(${s})`).join(" AND ")
  }
  if ("any" in expr) {
    const parts = (expr as { any: Expression[] }).any.map(renderExpression)
    return parts.length === 1 ? parts[0] : parts.map((s) => `(${s})`).join(" OR ")
  }
  if ("not" in expr) {
    return `NOT (${renderExpression((expr as { not: Expression }).not)})`
  }

  // Leaf: first key is selector, value is operator->operand map
  const entries = Object.entries(expr as Record<string, Record<string, unknown>>)
  if (entries.length === 0) return "(empty)"

  const [selector, ops] = entries[0]
  const opParts = Object.entries(ops).map(([op, val]) => renderOperator(op, val))
  return `${selector} ${opParts.join(", ")}`
}

function renderOperator(op: string, val: unknown): string {
  switch (op) {
    case "contains":
      return `contains ${String(val)}`
    case "contains_any":
      return `contains ${Array.isArray(val) ? val.join(", ") : String(val)}`
    case "matches":
      return `matches ${truncate(String(val), 50)}`
    case "matches_any":
      return `matches ${Array.isArray(val) ? val.map((v) => truncate(String(v), 50)).join(", ") : truncate(String(val), 50)}`
    case "equals":
      return `equals ${String(val)}`
    case "not_in":
      return `not in [${Array.isArray(val) ? val.join(", ") : String(val)}]`
    case "exists":
      return val ? "is set" : "is not set"
    case "gt":
      return `> ${val}`
    case "gte":
      return `>= ${val}`
    case "lt":
      return `< ${val}`
    case "lte":
      return `<= ${val}`
    default:
      return `${op} ${String(val)}`
  }
}
