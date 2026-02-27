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
