// Shared mock data for View 6: Contracts mockup variations

export interface Bundle {
  version: number
  revision_hash: string
  uploaded_by: string
  created_at: string
  deployed_envs: string[]
}

export interface CompositionLayer {
  bundle_name: string
  version: number
  mode: "enforce" | "observe_alongside"
}

export interface Deployment {
  id: string
  env: string
  bundle_version: number
  deployed_by: string
  created_at: string
}

export interface PlaygroundOutput {
  type: "audit" | "text"
  event?: {
    action: string
    tool_name: string
    decision_name: string | null
    reason: string | null
  }
  text?: string
}

export const ENVIRONMENTS = ["production", "staging", "development"] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const ENV_COLORS: Record<Environment, { bg: string; text: string; dot: string; border: string }> = {
  production: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    dot: "bg-red-400",
    border: "border-red-500/30",
  },
  staging: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    dot: "bg-amber-400",
    border: "border-amber-500/30",
  },
  development: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    border: "border-emerald-500/30",
  },
}

export const MOCK_BUNDLES: Bundle[] = [
  {
    version: 5,
    revision_hash: "sha256:e7f2a1...",
    uploaded_by: "admin@example.com",
    created_at: "2026-02-27T08:00:00Z",
    deployed_envs: ["development"],
  },
  {
    version: 4,
    revision_hash: "sha256:b3c8d9...",
    uploaded_by: "admin@example.com",
    created_at: "2026-02-27T06:30:00Z",
    deployed_envs: ["staging"],
  },
  {
    version: 3,
    revision_hash: "sha256:a1b2c3...",
    uploaded_by: "admin@example.com",
    created_at: "2026-02-26T14:00:00Z",
    deployed_envs: ["production"],
  },
  {
    version: 2,
    revision_hash: "sha256:d4e5f6...",
    uploaded_by: "admin@example.com",
    created_at: "2026-02-25T10:00:00Z",
    deployed_envs: [],
  },
  {
    version: 1,
    revision_hash: "sha256:112233...",
    uploaded_by: "admin@example.com",
    created_at: "2026-02-24T09:00:00Z",
    deployed_envs: [],
  },
]

export const MOCK_COMPOSITION_STACKS: Record<Environment, CompositionLayer[]> = {
  production: [
    { bundle_name: "org-base-contracts", version: 3, mode: "enforce" },
    { bundle_name: "team-api-contracts", version: 2, mode: "enforce" },
  ],
  staging: [
    { bundle_name: "org-base-contracts", version: 4, mode: "enforce" },
    { bundle_name: "team-api-contracts", version: 2, mode: "enforce" },
    { bundle_name: "candidate-pii-detection", version: 1, mode: "observe_alongside" },
  ],
  development: [
    { bundle_name: "org-base-contracts", version: 5, mode: "enforce" },
  ],
}

export const MOCK_DEPLOYMENTS: Deployment[] = [
  {
    id: "d1",
    env: "production",
    bundle_version: 3,
    deployed_by: "admin@example.com",
    created_at: "2026-02-26T14:30:00Z",
  },
  {
    id: "d2",
    env: "staging",
    bundle_version: 4,
    deployed_by: "admin@example.com",
    created_at: "2026-02-27T06:45:00Z",
  },
  {
    id: "d3",
    env: "development",
    bundle_version: 5,
    deployed_by: "admin@example.com",
    created_at: "2026-02-27T08:10:00Z",
  },
  {
    id: "d4",
    env: "staging",
    bundle_version: 3,
    deployed_by: "admin@example.com",
    created_at: "2026-02-26T12:00:00Z",
  },
  {
    id: "d5",
    env: "production",
    bundle_version: 2,
    deployed_by: "admin@example.com",
    created_at: "2026-02-25T16:00:00Z",
  },
]

export const MOCK_YAML = `apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: org-base-contracts
  description: "Organization-wide security contracts"
defaults:
  mode: enforce
contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret", "credentials"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' denied."
      tags: [secrets, dlp]

  - id: prod-deploy-approval
    type: pre
    tool: exec
    when:
      all:
        - args.command:
            contains: "deploy"
        - environment:
            equals: production
    then:
      effect: approve
      message: "Production deploy requires approval"
      timeout: 300
      timeout_effect: deny

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 100
      max_attempts: 200
    then:
      effect: deny
      message: "Session limit reached."`

export const MOCK_YAML_V3 = `apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: org-base-contracts
  description: "Organization-wide security contracts"
defaults:
  mode: enforce
contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret"]
    then:
      effect: deny
      message: "Sensitive file denied."
      tags: [secrets]

  - id: prod-deploy-approval
    type: pre
    tool: exec
    when:
      args.command:
        contains: "deploy"
    then:
      effect: approve
      message: "Deploy requires approval"
      timeout: 300
      timeout_effect: deny`

export const MOCK_DIFF_LINES: { type: "add" | "remove" | "context"; line: string; lineNum: number }[] = [
  { type: "context", line: "  - id: block-sensitive-reads", lineNum: 8 },
  { type: "context", line: "    type: pre", lineNum: 9 },
  { type: "context", line: "    tool: read_file", lineNum: 10 },
  { type: "context", line: "    when:", lineNum: 11 },
  { type: "context", line: "      args.path:", lineNum: 12 },
  { type: "remove", line: '        contains_any: [".env", ".secret"]', lineNum: 13 },
  { type: "add", line: '        contains_any: [".env", ".secret", "credentials"]', lineNum: 13 },
  { type: "context", line: "    then:", lineNum: 14 },
  { type: "context", line: "      effect: deny", lineNum: 15 },
  { type: "remove", line: '      message: "Sensitive file denied."', lineNum: 16 },
  { type: "add", line: "      message: \"Sensitive file '{args.path}' denied.\"", lineNum: 16 },
  { type: "remove", line: "      tags: [secrets]", lineNum: 17 },
  { type: "add", line: "      tags: [secrets, dlp]", lineNum: 17 },
  { type: "context", line: "", lineNum: 18 },
  { type: "context", line: "  - id: prod-deploy-approval", lineNum: 19 },
  { type: "context", line: "    type: pre", lineNum: 20 },
  { type: "context", line: "    tool: exec", lineNum: 21 },
  { type: "context", line: "    when:", lineNum: 22 },
  { type: "remove", line: "      args.command:", lineNum: 23 },
  { type: "add", line: "      all:", lineNum: 23 },
  { type: "add", line: "        - args.command:", lineNum: 24 },
  { type: "context", line: '            contains: "deploy"', lineNum: 25 },
  { type: "add", line: "        - environment:", lineNum: 26 },
  { type: "add", line: "            equals: production", lineNum: 27 },
  { type: "context", line: "    then:", lineNum: 28 },
  { type: "context", line: "      effect: approve", lineNum: 29 },
  { type: "remove", line: '      message: "Deploy requires approval"', lineNum: 30 },
  { type: "add", line: '      message: "Production deploy requires approval"', lineNum: 30 },
  { type: "context", line: "      timeout: 300", lineNum: 31 },
  { type: "context", line: "      timeout_effect: deny", lineNum: 32 },
  { type: "add", line: "", lineNum: 33 },
  { type: "add", line: "  - id: session-limits", lineNum: 34 },
  { type: "add", line: "    type: session", lineNum: 35 },
  { type: "add", line: "    limits:", lineNum: 36 },
  { type: "add", line: "      max_tool_calls: 100", lineNum: 37 },
  { type: "add", line: "      max_attempts: 200", lineNum: 38 },
  { type: "add", line: "    then:", lineNum: 39 },
  { type: "add", line: "      effect: deny", lineNum: 40 },
  { type: "add", line: '      message: "Session limit reached."', lineNum: 41 },
]

export const MOCK_PLAYGROUND_PYTHON = `from edictum import Edictum, EdictumDenied

guard = Edictum.from_yaml("contracts.yaml")

# This will be DENIED - .env is a sensitive file
try:
    result = await guard.run(
        "read_file",
        {"path": "/app/.env"},
        read_file,
    )
except EdictumDenied as e:
    print(f"DENIED: {e.reason}")

# This will SUCCEED - safe file
result = await guard.run(
    "read_file",
    {"path": "/app/README.md"},
    read_file,
)`

export const MOCK_PLAYGROUND_OUTPUT: PlaygroundOutput[] = [
  {
    type: "audit",
    event: {
      action: "call_denied",
      tool_name: "read_file",
      decision_name: "block-sensitive-reads",
      reason: "Sensitive file '/app/.env' denied.",
    },
  },
  { type: "text", text: "DENIED: Sensitive file '/app/.env' denied." },
  {
    type: "audit",
    event: {
      action: "call_allowed",
      tool_name: "read_file",
      decision_name: null,
      reason: null,
    },
  },
  {
    type: "audit",
    event: {
      action: "call_executed",
      tool_name: "read_file",
      decision_name: null,
      reason: null,
    },
  },
]

// ── Agent fleet data ────────────────────────────────────────────────

export interface ConnectedAgent {
  agent_id: string
  env: Environment
  status: "online" | "offline"
  contract_version: number
  last_seen: string
  events_24h: number
  denials_24h: number
}

export const MOCK_AGENTS: ConnectedAgent[] = [
  // Production agents — running v3
  {
    agent_id: "deploy-agent-01",
    env: "production",
    status: "online",
    contract_version: 3,
    last_seen: "2026-02-27T08:14:00Z",
    events_24h: 142,
    denials_24h: 3,
  },
  {
    agent_id: "deploy-agent-02",
    env: "production",
    status: "online",
    contract_version: 3,
    last_seen: "2026-02-27T08:13:00Z",
    events_24h: 89,
    denials_24h: 1,
  },
  {
    agent_id: "support-bot",
    env: "production",
    status: "online",
    contract_version: 3,
    last_seen: "2026-02-27T08:12:00Z",
    events_24h: 67,
    denials_24h: 5,
  },
  {
    agent_id: "data-pipeline-03",
    env: "production",
    status: "offline",
    contract_version: 3,
    last_seen: "2026-02-27T07:45:00Z",
    events_24h: 34,
    denials_24h: 0,
  },
  // Staging agents — running v4
  {
    agent_id: "deploy-agent-stg",
    env: "staging",
    status: "online",
    contract_version: 4,
    last_seen: "2026-02-27T08:14:30Z",
    events_24h: 56,
    denials_24h: 2,
  },
  {
    agent_id: "research-agent-12",
    env: "staging",
    status: "online",
    contract_version: 4,
    last_seen: "2026-02-27T08:10:00Z",
    events_24h: 203,
    denials_24h: 12,
  },
  {
    agent_id: "qa-bot",
    env: "staging",
    status: "online",
    contract_version: 4,
    last_seen: "2026-02-27T08:11:00Z",
    events_24h: 45,
    denials_24h: 0,
  },
  // Development agents — running v5
  {
    agent_id: "dev-agent-local",
    env: "development",
    status: "online",
    contract_version: 5,
    last_seen: "2026-02-27T08:14:50Z",
    events_24h: 312,
    denials_24h: 8,
  },
  // Stale agent — still on old version (version drift)
  {
    agent_id: "legacy-worker",
    env: "production",
    status: "online",
    contract_version: 2,
    last_seen: "2026-02-27T08:14:55Z",
    events_24h: 18,
    denials_24h: 0,
  },
]

export function agentsByEnv(env: Environment): ConnectedAgent[] {
  return MOCK_AGENTS.filter((a) => a.env === env)
}

export function agentsByVersion(version: number): ConnectedAgent[] {
  return MOCK_AGENTS.filter((a) => a.contract_version === version)
}

export function onlineAgentsByEnv(env: Environment): ConnectedAgent[] {
  return MOCK_AGENTS.filter((a) => a.env === env && a.status === "online")
}

export function driftedAgents(env: Environment, expectedVersion: number): ConnectedAgent[] {
  return MOCK_AGENTS.filter(
    (a) => a.env === env && a.contract_version !== expectedVersion,
  )
}

// Helper: format relative time from ISO string
export function relativeTime(iso: string): string {
  const now = new Date("2026-02-27T08:15:00Z")
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays}d ago`
}
