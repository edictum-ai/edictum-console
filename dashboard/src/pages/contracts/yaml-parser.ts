import yaml from "js-yaml"
import type { ContractBundle, ParsedContract } from "./types"

export { diffContracts } from "./yaml-diff"

/**
 * Parse raw YAML string into a typed ContractBundle.
 * Throws on invalid YAML or missing required fields.
 */
export function parseContractBundle(yamlString: string): ContractBundle {
  const raw = yaml.load(yamlString) as Record<string, unknown>

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid YAML: expected an object")
  }

  if (raw.apiVersion !== "edictum/v1") {
    throw new Error(
      `Invalid apiVersion: expected "edictum/v1", got "${String(raw.apiVersion)}"`,
    )
  }

  if (raw.kind !== "ContractBundle") {
    throw new Error(
      `Invalid kind: expected "ContractBundle", got "${String(raw.kind)}"`,
    )
  }

  const metadata = raw.metadata as Record<string, unknown> | undefined
  if (!metadata || typeof metadata !== "object" || !metadata.name) {
    throw new Error("Missing required field: metadata.name")
  }

  const contracts = raw.contracts
  if (!Array.isArray(contracts)) {
    throw new Error("Missing or invalid field: contracts must be an array")
  }

  const defaults = (raw.defaults as Record<string, unknown>) ?? { mode: "enforce" }
  const tools = raw.tools as Record<string, { side_effect: string }> | undefined

  return {
    apiVersion: "edictum/v1",
    kind: "ContractBundle",
    metadata: {
      name: String(metadata.name),
      description: metadata.description ? String(metadata.description) : undefined,
    },
    defaults: {
      mode: (defaults.mode as "enforce" | "observe") ?? "enforce",
    },
    tools: tools as ContractBundle["tools"],
    observe_alongside: raw.observe_alongside === true,
    contracts: contracts.map(coerceContract),
  }
}

function coerceContract(raw: unknown): ParsedContract {
  const c = raw as Record<string, unknown>
  if (!c.id || !c.type) {
    throw new Error(`Contract missing required fields: id and type`)
  }

  return {
    id: String(c.id),
    type: c.type as ParsedContract["type"],
    enabled: c.enabled !== undefined ? Boolean(c.enabled) : undefined,
    mode: c.mode as ParsedContract["mode"],
    tool: c.tool ? String(c.tool) : undefined,
    tools: Array.isArray(c.tools) ? c.tools.map(String) : undefined,
    when: c.when as ParsedContract["when"],
    then: c.then as ParsedContract["then"],
    within: Array.isArray(c.within) ? c.within.map(String) : undefined,
    not_within: Array.isArray(c.not_within) ? c.not_within.map(String) : undefined,
    allows: c.allows as ParsedContract["allows"],
    not_allows: c.not_allows as ParsedContract["not_allows"],
    outside: c.outside as ParsedContract["outside"],
    message: c.message ? String(c.message) : undefined,
    limits: c.limits as ParsedContract["limits"],
  }
}

/**
 * Validate YAML without throwing. Returns validation result for upload sheet.
 */
export function validateBundle(
  yamlString: string,
): { valid: boolean; error?: string; contractCount?: number } {
  try {
    const bundle = parseContractBundle(yamlString)
    return { valid: true, contractCount: bundle.contracts.length }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid YAML" }
  }
}

