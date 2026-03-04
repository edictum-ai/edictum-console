export interface StarterPack {
  name: string
  description: string
  contractCount: number
  types: string[]
  yamlContent: string
}

export const STARTER_PACKS: StarterPack[] = [
  {
    name: "Research Agent",
    description:
      "Safe browsing, no file writes, session limits. Ideal for agents that search and summarize.",
    contractCount: 4,
    types: ["pre", "post", "session"],
    yamlContent: `apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: research-agent
  description: "Safe browsing, no file writes, session limits."

defaults:
  mode: enforce

contracts:
  - id: deny-file-writes
    type: pre
    tool: write_file
    when: { tool.name: { exists: true } }
    then:
      effect: deny
      message: "Research agents cannot write files."
      tags: [safety, read-only]

  - id: block-dangerous-urls
    type: pre
    tool: web_fetch
    when:
      args.url:
        matches_any:
          - '169\\.254\\.169\\.254'
          - 'metadata\\.google\\.internal'
    then:
      effect: deny
      message: "Blocked endpoint: {args.url}"
      tags: [security, ssrf]

  - id: pii-in-output
    type: post
    tool: "*"
    when:
      output.text:
        matches_any:
          - '\\b\\d{3}-\\d{2}-\\d{4}\\b'
    then:
      effect: warn
      message: "PII pattern detected in output. Review before sharing."
      tags: [pii, compliance]

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 30
      max_attempts: 100
    then:
      effect: deny
      message: "Session limit reached. Summarize progress and stop."
      tags: [rate-limit]
`,
  },
  {
    name: "DevOps Agent",
    description:
      "Deployment safety gates, prod protections, ticket requirements, PII detection.",
    contractCount: 6,
    types: ["pre", "post", "session"],
    yamlContent: `apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: devops-agent
  description: "Contracts for DevOps agents. Prod gates, ticket requirements, PII detection."

defaults:
  mode: enforce

contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret", "kubeconfig", "credentials", ".pem", "id_rsa"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' denied."
      tags: [secrets, dlp]

  - id: block-destructive-bash
    type: pre
    tool: bash
    when:
      any:
        - args.command: { matches: '\\brm\\s+(-rf?|--recursive)\\b' }
        - args.command: { matches: '\\bmkfs\\b' }
        - args.command: { contains: '> /dev/' }
    then:
      effect: deny
      message: "Destructive command denied: '{args.command}'."
      tags: [destructive, safety]

  - id: prod-deploy-requires-senior
    type: pre
    tool: deploy_service
    when:
      all:
        - environment: { equals: production }
        - principal.role: { not_in: [senior_engineer, sre, admin] }
    then:
      effect: deny
      message: "Production deploys require senior role (sre/admin)."
      tags: [change-control, production]

  - id: prod-requires-ticket
    type: pre
    tool: deploy_service
    when:
      all:
        - environment: { equals: production }
        - principal.ticket_ref: { exists: false }
    then:
      effect: deny
      message: "Production changes require a ticket reference."
      tags: [change-control, compliance]

  - id: pii-in-output
    type: post
    tool: "*"
    when:
      output.text:
        matches_any:
          - '\\b\\d{3}-\\d{2}-\\d{4}\\b'
    then:
      effect: warn
      message: "PII pattern detected in output. Redact before using."
      tags: [pii, compliance]

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 20
      max_attempts: 50
    then:
      effect: deny
      message: "Session limit reached. Summarize progress and stop."
      tags: [rate-limit]
`,
  },
  {
    name: "Production Governance",
    description:
      "Sandbox enforcement, rate limits, MCP approval gates. For production-grade agent fleets.",
    contractCount: 5,
    types: ["pre", "sandbox", "session"],
    yamlContent: `apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: production-governance
  description: "Production governance — sandboxes, rate limits, MCP approval gates."

defaults:
  mode: enforce

contracts:
  - id: deny-destructive
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(rm\\s+-rf\\s+/|mkfs|dd\\s+if=/dev/|shutdown|reboot).*'
    then:
      effect: deny
      message: "Destructive command denied: {args.command}"
      tags: [destructive, safety]

  - id: file-sandbox
    type: sandbox
    tools: [read_file, write_file, edit_file, list_dir]
    within:
      - /app/workspace
      - /tmp
    not_within:
      - /app/workspace/.git
    outside: deny
    message: "File access outside workspace: {args.path}"

  - id: exec-sandbox
    type: sandbox
    tools: [exec]
    allows:
      commands: [ls, pwd, echo, cat, head, tail, grep, find, sort,
                 wc, date, git, python, node, npm, pnpm, pip,
                 mkdir, touch, cp, mv, curl, jq, docker]
    within:
      - /app/workspace
      - /tmp
    outside: deny
    message: "Command outside sandbox: {args.command}"

  - id: approve-mcp
    type: pre
    tool: "mcp_*"
    when: { tool.name: { exists: true } }
    then:
      effect: approve
      message: "MCP call requires approval: {tool.name}"
      timeout: 120
      timeout_effect: deny
    tags: [mcp, approval]

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 50
      max_attempts: 200
    then:
      effect: deny
      message: "Session limit reached. Report progress and stop."
      tags: [rate-limit]
`,
  },
]
