# Audit 4 — Dependency & Supply Chain Security

**Context:** A security product with a vulnerable dependency is itself vulnerable.
Every CVE in your stack is a CVE in edictum-console.
Save findings to `audits/results/AUDIT-4-results.md`.

---

## Step 1 — Python dependency audit

```bash
cd ~/workspace/edictum-console
source .venv/bin/activate

# Install pip-audit
pip install pip-audit

# Audit all dependencies
pip-audit --output json > audits/results/pip-audit.json 2>&1
pip-audit 2>&1 | tee audits/results/pip-audit.txt

# Check for outdated packages (not vulnerabilities, but good hygiene)
pip list --outdated 2>&1 | tee audits/results/pip-outdated.txt

# Check pinning — are versions pinned in pyproject.toml?
cat pyproject.toml | grep -A 50 '\[project\]' | grep -A 50 'dependencies'
```

For each CVE found: record the package, CVE ID, severity, and whether it's in a
security-critical path (auth, crypto, HTTP parsing).

---

## Step 2 — Node/npm dependency audit

```bash
cd ~/workspace/edictum-console/dashboard

# Audit npm dependencies
npm audit --audit-level=moderate --json > ../audits/results/npm-audit.json 2>&1
npm audit 2>&1 | tee ../audits/results/npm-audit.txt

# Check for outdated
npm outdated 2>&1 | tee ../audits/results/npm-outdated.txt
```

---

## Step 3 — Dependency review

```bash
cd ~/workspace/edictum-console

# List all Python dependencies with their purposes
pip list | tee audits/results/pip-list.txt

# Flag any unexpected packages — things that shouldn't be there
# Known expected: fastapi, uvicorn, sqlalchemy, alembic, pydantic, redis, bcrypt,
#                 cryptography, pynacl, httpx, sse-starlette, python-multipart
# Flag anything else that is not in pyproject.toml
pip list | grep -Fvf <(grep -oP '(?<=")[a-zA-Z0-9_-]+(?=[>=<"])' pyproject.toml)
```

---

## Step 4 — License audit

```bash
pip install pip-licenses
pip-licenses --format=table 2>&1 | tee audits/results/licenses.txt

# Flag any GPL/AGPL licenses — incompatible with Apache 2.0
pip-licenses --format=table | grep -iE "GPL|AGPL"
```

---

## Step 5 — Key crypto library versions

These are critical — check they are current:

```bash
python3 -c "import cryptography; print('cryptography:', cryptography.__version__)"
python3 -c "import nacl; print('pynacl:', nacl.__version__)"
python3 -c "import bcrypt; print('bcrypt:', bcrypt.__version__)"
python3 -c "import redis; print('redis:', redis.__version__)"
```

Look up the current version of each on PyPI and flag if behind by more than one major version.

---

## Report format

```
# Audit 4 Results — Dependencies

## Python CVEs
| Package | Version | CVE | Severity | In security path? |
|---------|---------|-----|----------|-------------------|

## npm CVEs
| Package | Version | CVE | Severity | Notes |
|---------|---------|-----|----------|-------|

## Outdated (critical packages only)
| Package | Current | Latest |
|---------|---------|--------|

## License issues
(Any GPL/AGPL or unknown licenses)

## Ship-blockers
(Any HIGH/CRITICAL CVE in a security-critical path)

## Recommendations
(Prioritized list of updates)
```
