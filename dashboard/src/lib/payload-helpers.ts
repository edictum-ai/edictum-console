/**
 * Helpers for extracting contract provenance and observe-mode info
 * from event payloads sent by ServerAuditSink.
 */

function extractString(
  payload: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!payload) return null
  for (const key of keys) {
    const val = payload[key]
    if (typeof val === "string" && val.length > 0) return val
  }
  return null
}

export interface Provenance {
  contractName: string | null
  decisionSource: string | null
  policyVersion: string | null
  reason: string | null
}

export function extractProvenance(event: {
  payload: Record<string, unknown> | null
}): Provenance {
  const p = event.payload
  return {
    contractName: extractString(p, "decision_name"),
    decisionSource: extractString(p, "decision_source"),
    policyVersion: extractString(p, "policy_version"),
    reason: extractString(p, "reason"),
  }
}

const SOURCE_LABELS: Record<string, string> = {
  yaml_precondition: "Precondition",
  yaml_sandbox: "Sandbox",
  session_contract: "Session",
  attempt_limit: "Attempt Limit",
  operation_limit: "Operation Limit",
  hook: "Hook",
}

export function formatDecisionSource(source: string | null): string {
  if (!source) return "Unknown"
  return SOURCE_LABELS[source] ?? source
}

export function contractLabel(prov: Provenance): string | null {
  if (prov.contractName) return prov.contractName
  if (prov.decisionSource) return formatDecisionSource(prov.decisionSource)
  return null
}

export function isObserveFinding(event: {
  mode: string
  verdict: string
}): boolean {
  return (
    event.mode === "observe" &&
    (event.verdict === "call_would_deny" || event.verdict === "call_denied")
  )
}

/** Tool-name-aware extraction of the most relevant argument for preview. */
export function extractArgsPreview(event: {
  tool_name: string
  payload: Record<string, unknown> | null
}): string {
  const payload = event.payload
  if (!payload) return ""
  const toolArgs = payload.tool_args as Record<string, unknown> | undefined
  if (!toolArgs) return ""

  const tool = event.tool_name.toLowerCase()
  if (tool.includes("exec") || tool.includes("shell")) {
    const cmd = toolArgs.command ?? toolArgs.cmd
    if (typeof cmd === "string") return cmd
  }
  if (tool.includes("file") || tool.includes("read") || tool.includes("write")) {
    const path = toolArgs.path ?? toolArgs.file
    if (typeof path === "string") return path
  }
  if (tool.includes("sql") || tool.includes("query")) {
    const query = toolArgs.query ?? toolArgs.sql
    if (typeof query === "string") return query
  }
  if (tool.includes("mcp")) {
    const server = toolArgs.server ?? toolArgs.function
    const method = toolArgs.method ?? ""
    if (typeof server === "string") {
      return method ? `${server}.${method}` : server
    }
  }
  if (tool.includes("http") || tool.includes("request") || tool.includes("fetch")) {
    const url = toolArgs.url ?? toolArgs.endpoint
    if (typeof url === "string") return url
  }

  const firstVal = Object.values(toolArgs)[0]
  if (firstVal !== undefined) {
    return typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal)
  }
  return ""
}

export function extractUniqueContracts(
  events: Array<{ payload: Record<string, unknown> | null }>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of events) {
    const name = extractString(e.payload, "decision_name")
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return counts
}
