# Edictum Console — Overnight Security Audit

**You are running a comprehensive security and quality audit of edictum-console.**
This is a security product. The owner's job, startup, and reputation depend on it being airtight.
A bug here is not a UX issue — it is a security failure for every agent operator using this tool.

**Console URL:** https://edictum-console.onrender.com
**Admin email:** cartagena.arnold@gmail.com
**Repo:** https://github.com/acartag7/edictum-console

**Your mandate:** Run all 7 audits below, in order. Each one produces a results file.
At the end, produce a single executive summary at `audits/results/SUMMARY.md`
with every finding categorized by severity. Do not stop unless you encounter a
complete blocker (server unreachable, container broken). Work through failures.

---

## Execution order

Run these in sequence. Each builds on the previous.

### 1. Setup

```bash
mkdir -p ~/workspace
cd ~/workspace
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console
mkdir -p audits/results

python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Run all audits

Follow each file in order:

| # | File | What it covers | Priority |
|---|------|----------------|----------|
| 1 | `audits/AUDIT-1-BACKEND-SECURITY.md` | All 8 security boundaries, pytest -m security, bandit, mypy | CRITICAL |
| 2 | `audits/AUDIT-2-TENANT-ISOLATION-REDTEAM.md` | Cross-tenant bypass attempts on every endpoint | CRITICAL |
| 3 | `audits/AUDIT-3-LIVE-PENTEST.md` | Live attacks against the running Render instance | CRITICAL |
| 4 | `audits/AUDIT-4-DEPENDENCIES.md` | CVEs in pip and npm dependencies | HIGH |
| 5 | `audits/AUDIT-5-FRONTEND.md` | XSS, auth leaks, TypeScript, light mode, shadcn compliance | HIGH |
| 6 | `audits/AUDIT-6-CODE-QUALITY.md` | Coverage, DDD layers, type safety, async correctness | MEDIUM |
| 7 | `audits/AUDIT-7-INFRASTRUCTURE.md` | Docker, secrets, CORS, security headers | HIGH |

### 3. Executive summary

After all audits complete, write `audits/results/SUMMARY.md`:

```markdown
# Edictum Console — Security Audit Summary

**Date:** [today]
**Auditor:** nanobot-arnold
**Scope:** Full security + quality audit pre-launch

## CRITICAL — Ship-blockers (must fix before any public launch)
(List each finding: audit #, description, file:line, recommended fix)

## HIGH — Fix before launch
(List each finding)

## MEDIUM — Fix in first week post-launch
(List each finding)

## LOW / INFO — Hygiene items
(List each finding)

## Test results
- Security tests: X passed / X failed
- Overall coverage: X%
- Bandit findings: X
- CVEs: X (HIGH: X, MEDIUM: X, LOW: X)

## Verdict
[ ] LAUNCH READY — no ship-blockers found
[ ] NOT READY — X ship-blockers must be resolved first
```

---

## Important rules

- **Do not modify any source files** during the audit. Observe and report only.
- **Do not delete any data** from the production database.
- **Save every result file** — even if empty, create the file with "No issues found."
- **Be specific.** A finding without a file path and line number is not actionable.
- **Err on the side of reporting.** A false positive is better than a missed vulnerability.
- If you find a critical vulnerability (e.g., cross-tenant data leak works), stop that audit
  and note it prominently in SUMMARY.md immediately before continuing.
