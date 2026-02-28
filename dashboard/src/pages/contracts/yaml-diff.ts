import type { ContractBundle, ContractDiff, ParsedContract } from "./types"

/**
 * Compare two parsed bundles by contract ID.
 * Returns structured diff with human-readable change descriptions.
 */
export function diffContracts(
  oldBundle: ContractBundle,
  newBundle: ContractBundle,
): ContractDiff {
  const oldMap = new Map(oldBundle.contracts.map((c) => [c.id, c]))
  const newMap = new Map(newBundle.contracts.map((c) => [c.id, c]))

  const added: ParsedContract[] = []
  const removed: ParsedContract[] = []
  const modified: ContractDiff["modified"] = []
  const unchanged: string[] = []

  for (const [id, oldContract] of oldMap) {
    const newContract = newMap.get(id)
    if (!newContract) {
      removed.push(oldContract)
      continue
    }
    const changes = describeChanges(oldContract, newContract)
    if (changes.length === 0) {
      unchanged.push(id)
    } else {
      modified.push({ id, old: oldContract, new: newContract, changes })
    }
  }

  for (const [id, newContract] of newMap) {
    if (!oldMap.has(id)) {
      added.push(newContract)
    }
  }

  return { added, removed, modified, unchanged }
}

function describeChanges(
  oldC: ParsedContract,
  newC: ParsedContract,
): string[] {
  const changes: string[] = []

  if (oldC.type !== newC.type) {
    changes.push(`type: ${oldC.type} -> ${newC.type}`)
  }
  if (oldC.mode !== newC.mode) {
    changes.push(`mode: ${oldC.mode ?? "default"} -> ${newC.mode ?? "default"}`)
  }
  if (oldC.enabled !== newC.enabled) {
    changes.push(`enabled: ${String(oldC.enabled ?? true)} -> ${String(newC.enabled ?? true)}`)
  }
  if (JSON.stringify(oldC.when) !== JSON.stringify(newC.when)) {
    changes.push("when expression changed")
  }
  if (JSON.stringify(oldC.then) !== JSON.stringify(newC.then)) {
    changes.push("then block changed")
  }
  if (JSON.stringify(oldC.limits) !== JSON.stringify(newC.limits)) {
    changes.push(describeLimitChanges(oldC.limits, newC.limits))
  }
  if (JSON.stringify(oldC.within) !== JSON.stringify(newC.within)) {
    changes.push("within list changed")
  }
  if (JSON.stringify(oldC.not_within) !== JSON.stringify(newC.not_within)) {
    changes.push("not_within list changed")
  }
  if (JSON.stringify(oldC.allows) !== JSON.stringify(newC.allows)) {
    changes.push("allows changed")
  }
  if (JSON.stringify(oldC.not_allows) !== JSON.stringify(newC.not_allows)) {
    changes.push("not_allows changed")
  }
  if (oldC.tool !== newC.tool) {
    changes.push(`tool: ${oldC.tool ?? "none"} -> ${newC.tool ?? "none"}`)
  }
  if (JSON.stringify(oldC.tools) !== JSON.stringify(newC.tools)) {
    changes.push("tools list changed")
  }

  return changes
}

function describeLimitChanges(
  oldLimits: ParsedContract["limits"],
  newLimits: ParsedContract["limits"],
): string {
  if (!oldLimits && newLimits) return "limits added"
  if (oldLimits && !newLimits) return "limits removed"
  if (!oldLimits || !newLimits) return "limits changed"

  const parts: string[] = []
  if (oldLimits.max_tool_calls !== newLimits.max_tool_calls) {
    parts.push(
      `max_tool_calls ${oldLimits.max_tool_calls ?? "unset"} -> ${newLimits.max_tool_calls ?? "unset"}`,
    )
  }
  if (oldLimits.max_attempts !== newLimits.max_attempts) {
    parts.push(
      `max_attempts ${oldLimits.max_attempts ?? "unset"} -> ${newLimits.max_attempts ?? "unset"}`,
    )
  }
  if (
    JSON.stringify(oldLimits.max_calls_per_tool) !==
    JSON.stringify(newLimits.max_calls_per_tool)
  ) {
    parts.push("max_calls_per_tool changed")
  }

  return parts.length > 0 ? parts.join(", ") : "limits changed"
}
