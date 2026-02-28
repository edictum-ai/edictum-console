export const DEVOPS_AGENT_TEMPLATE = `apiVersion: edictum/v1
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
        - args.command: { matches: '\\\\brm\\\\s+(-rf?|--recursive)\\\\b' }
        - args.command: { matches: '\\\\bmkfs\\\\b' }
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
          - '\\\\b\\\\d{3}-\\\\d{2}-\\\\d{4}\\\\b'
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
`

export const GOVERNANCE_V5_TEMPLATE = `apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: edictum-agent
  description: "Production governance v5 — L2 sandbox"

defaults:
  mode: enforce

tools:
  exec: { side_effect: irreversible }
  write_file: { side_effect: irreversible }
  edit_file: { side_effect: irreversible }
  read_file: { side_effect: read }
  list_dir: { side_effect: read }
  web_search: { side_effect: read }
  web_fetch: { side_effect: read }
  message: { side_effect: write }
  spawn: { side_effect: irreversible }
  cron: { side_effect: write }
  "mcp_*": { side_effect: irreversible }

contracts:
  - id: deny-destructive
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(rm\\s+-rf\\s+/|mkfs|dd\\s+if=/dev/|shutdown|reboot|kill\\s+-9\\s+1\\b|chmod\\s+777\\s+/).*'
    then:
      effect: deny
      message: "Destructive: {args.command}"

  - id: deny-shells
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(nc\\s+.*-e|ncat\\s+.*-e|bash\\s+-i|/dev/tcp/|socat.*exec).*'
    then:
      effect: deny
      message: "Shell attack: {args.command}"

  - id: deny-exec-metadata
    type: pre
    tool: exec
    when:
      args.command:
        matches: '.*(169\\.254\\.169\\.254|metadata\\.google\\.internal|metadata\\.azure\\.com).*'
    then:
      effect: deny
      message: "Cloud metadata blocked: {args.command}"

  - id: file-sandbox
    type: sandbox
    tools: [read_file, write_file, edit_file, list_dir]
    within:
      - /root/.nanobot/workspace
      - /tmp
    not_within:
      - /root/.nanobot/workspace/.git
    outside: deny
    message: "File access outside workspace: {args.path}"

  - id: exec-sandbox
    type: sandbox
    tools: [exec]
    allows:
      commands: [ls, pwd, echo, cat, head, tail, grep, find, sort,
                 wc, date, uname, whoami, id, df, du, ps, tree,
                 git, pip, pip3, python, python3, node, npm, npx, pnpm,
                 mkdir, touch, cp, mv, rm, tar, gzip, unzip, zip, diff,
                 curl, wget, docker, jq, yq, file, stat, which,
                 free, uptime, top, htop, history, env, printenv,
                 ssh-keygen, openssl, base64, md5sum, sha256sum,
                 apt, dpkg, lsof, ss, netstat, ip, ping, dig, nslookup,
                 sed, awk, cut, tr, xargs, tee, less, more]
    within:
      - /root/.nanobot/workspace
      - /tmp
    not_within:
      - /etc/shadow
      - /etc/sudoers
      - /etc/gshadow
      - /proc
      - /sys
      - /root/.ssh
      - /root/.git-credentials
      - /root/.nanobot/config.json
      - /var/run/secrets
    outside: approve
    message: "Command outside sandbox: {args.command}"

  - id: web-sandbox
    type: sandbox
    tools: [web_fetch]
    allows:
      domains: ['*']
    not_allows:
      domains: [169.254.169.254, metadata.google.internal, metadata.azure.com,
                webhook.site, requestbin.com, canarytokens.org,
                burpcollaborator.net, interactsh.com, pipedream.net, hookbin.com]
    outside: deny
    message: "Blocked endpoint: {args.url}"

  - id: observe-spawn
    type: pre
    mode: observe
    tool: spawn
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "Spawn: {args.task}" }

  - id: observe-cron
    type: pre
    mode: observe
    tool: cron
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "Cron: {args.schedule}" }

  - id: approve-mcp
    type: pre
    tool: "mcp_*"
    when: { tool.name: { exists: true } }
    then: { effect: approve, message: "MCP: {tool.name}", timeout: 120, timeout_effect: deny }

  - id: observe-all
    type: pre
    mode: observe
    tool: "*"
    when: { tool.name: { exists: true } }
    then: { effect: deny, message: "{tool.name}: {args}" }
`
