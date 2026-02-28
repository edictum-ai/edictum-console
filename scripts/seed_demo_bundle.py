#!/usr/bin/env python3
"""Seed the database with a demo contract bundle.

Run after bootstrap is complete:
    python scripts/seed_demo_bundle.py

Requires: httpx (pip install httpx)
"""

import asyncio
import sys

import httpx

BASE_URL = "http://localhost:8000"

DEMO_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: devops-agent
  description: "Governance for CI/CD and infrastructure agents."
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
      message: "Sensitive file '{args.path}' denied. Skip and continue."
      tags: [secrets, dlp]

  - id: block-destructive-bash
    type: pre
    tool: bash
    when:
      any:
        - args.command: { matches: '\\brm\\s+(-rf?|--recursive)\\b' }
        - args.command: { matches: '\\bmkfs\\b' }
        - args.command: { matches: '\\bdd\\s+' }
        - args.command: { contains: '> /dev/' }
    then:
      effect: deny
      message: "Destructive command denied: '{args.command}'. Use a safer alternative."
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
          - '\\b[A-Z]{2}\\d{2}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{0,2}\\b'
    then:
      effect: warn
      message: "PII pattern detected in output. Redact before using."
      tags: [pii, compliance]

  - id: file-sandbox
    type: sandbox
    tools: [read_file, write_file, bash]
    within:
      - /workspace
      - /tmp
    not_within:
      - /workspace/.git
      - /workspace/.env
    outside: deny
    message: "File access outside allowed directories: {args.path}"

  - id: exec-sandbox
    type: sandbox
    tool: bash
    allows:
      commands: [git, npm, pnpm, node, python, pytest, ruff, ls, cat, grep]
    outside: deny
    message: "Command not in allowlist: {args.command}"

  - id: session-limits
    type: session
    limits:
      max_tool_calls: 50
      max_attempts: 120
      max_calls_per_tool:
        deploy_service: 3
        send_notification: 10
    then:
      effect: deny
      message: "Session limit reached. Summarize progress and stop."
      tags: [rate-limit]
"""


async def main() -> int:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
        # 1. Login
        print("Logging in...")
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "TestPassword123"},
        )
        if login_resp.status_code != 200:
            print(f"Login failed: {login_resp.status_code} {login_resp.text}")
            print("Make sure the server is running and you've completed bootstrap.")
            print("You may need to reset the admin password (see DEV-NOTES.md).")
            return 1

        # Extract session cookie
        cookies = login_resp.cookies

        # 2. Check if bundles already exist
        print("Checking existing bundles...")
        bundles_resp = await client.get("/api/v1/bundles", cookies=cookies)
        if bundles_resp.status_code != 200:
            print(f"Failed to list bundles: {bundles_resp.status_code}")
            return 1

        bundles = bundles_resp.json()
        if bundles and "--force" not in sys.argv:
            print(f"Found {len(bundles)} existing bundle(s). Skipping seed.")
            print("Use --force to re-seed anyway (uploads a new version).")
            return 0

        # 3. Upload demo bundle
        print("Uploading demo bundle...")
        upload_resp = await client.post(
            "/api/v1/bundles",
            json={"yaml_content": DEMO_YAML},
            cookies=cookies,
        )
        if upload_resp.status_code != 201:
            print(f"Upload failed: {upload_resp.status_code} {upload_resp.text}")
            return 1

        bundle = upload_resp.json()
        print(f"Created bundle v{bundle['version']} ({bundle['revision_hash'][:16]}...)")

        # 4. Deploy to development
        print("Deploying to development environment...")
        deploy_resp = await client.post(
            f"/api/v1/bundles/{bundle['version']}/deploy",
            json={"env": "development"},
            cookies=cookies,
        )
        if deploy_resp.status_code != 201:
            print(f"Deploy failed: {deploy_resp.status_code} {deploy_resp.text}")
            return 1

        print("Deployed to development!")
        print("\nDemo bundle seeded successfully.")
        print("Visit http://localhost:5173/dashboard/contracts to see it.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
