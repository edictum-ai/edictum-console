# Audit 7 — Infrastructure & Secrets

**Context:** A perfectly coded app can be compromised by bad infrastructure.
This audit covers Docker hardening, secrets management, and the Render deployment config.
Save findings to `audits/results/AUDIT-7-results.md`.

---

## Step 1 — Docker security

```bash
cd ~/workspace/edictum-console

# Check Dockerfile for common issues
cat Dockerfile
```

Verify each of the following manually:

- [ ] Multi-stage build — final image does NOT contain build tools, node_modules, or source code
- [ ] Non-root user — the `USER app` directive exists and is the last user set before ENTRYPOINT
- [ ] No secrets baked in — no ENV with actual secret values, no COPY of .env files
- [ ] Base image is pinned or at minimum named (not `python:latest`)
- [ ] Build args that could leak (ARG with sensitive values)

```bash
# Check the actual final image layers for sensitive content
docker build -t edictum-audit . 2>/dev/null
docker run --rm edictum-audit find /app -name "*.env" -o -name "*.key" -o -name "*.pem" 2>/dev/null
docker run --rm edictum-audit ls /app/
docker run --rm edictum-audit env | grep -iE "secret|password|key|token" 2>/dev/null
docker history edictum-audit 2>/dev/null
```

---

## Step 2 — Git history secret scan

```bash
cd ~/workspace/edictum-console

# Install truffleHog or gitleaks
pip install trufflehog 2>/dev/null || \
  (curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/main/scripts/install.sh | sh -s -- -b /tmp)

# Scan git history for secrets
/tmp/gitleaks detect --source . --no-git 2>&1 | tee audits/results/gitleaks.txt
# or
trufflehog git file://. 2>&1 | tee audits/results/trufflehog.txt

# Manual check — look at every commit that touched .env or config files
git log --all --oneline -- "*.env" ".env*" "*.ini" "*.cfg" "pyproject.toml"
```

---

## Step 3 — Secrets in .gitignore

```bash
cd ~/workspace/edictum-console

# Verify .gitignore exists and protects sensitive files
cat .gitignore

# These MUST be gitignored:
for f in ".env" ".env.local" "*.key" "*.pem" "*.p12" "*.pfx"; do
  if git ls-files --error-unmatch "$f" 2>/dev/null; then
    echo "DANGER: $f is tracked by git!"
  else
    echo "OK: $f is not tracked"
  fi
done

# Check if .env is accidentally tracked
git ls-files | grep -E "\.env$|\.env\."
```

---

## Step 4 — CORS configuration

```bash
BASE=https://edictum-console.onrender.com

# What origins are allowed?
curl -sI -H "Origin: https://evil.com" -X OPTIONS $BASE/api/v1/events \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control"

curl -sI -H "Origin: https://evil.com" -X OPTIONS $BASE/api/v1/auth/login \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control"

# Wildcard CORS is a critical vulnerability
# Expected: Access-Control-Allow-Origin should be specific, not *
```

Read `src/edictum_server/main.py` — find the CORS middleware config:
- Is the allowed origins list explicit (not `*`)?
- Is it driven by `EDICTUM_CORS_ORIGINS` env var?
- What happens if `EDICTUM_CORS_ORIGINS` is not set?

---

## Step 5 — HTTP security headers

```bash
BASE=https://edictum-console.onrender.com

curl -sI $BASE/dashboard | grep -iE \
  "x-content-type|x-frame|content-security|strict-transport|referrer-policy|permissions-policy"
```

Required headers and expected values:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (no clickjacking)
- `Strict-Transport-Security: max-age=...` (HSTS)
- `Content-Security-Policy` (ideally present)

If these are not set by the app, note it — Render may add some at the edge but the app should not rely on that.

---

## Step 6 — Environment variable hardening

Check `src/edictum_server/config.py` or wherever settings are defined:

```bash
cd ~/workspace/edictum-console
grep -rn "EDICTUM_SECRET_KEY\|SECRET_KEY\|default=" src/edictum_server/ --include="*.py" | \
  grep -v test
```

Verify:
- `EDICTUM_SECRET_KEY` has no default value (must fail if not set)
- `EDICTUM_SIGNING_KEY_SECRET` has no default value
- `EDICTUM_ADMIN_PASSWORD` has no default value and no dangerous fallback

```bash
# Simulate missing secret key — should the app refuse to start?
EDICTUM_SECRET_KEY="" python3 -c "from edictum_server.config import settings; print(settings.secret_key)" 2>&1
```

---

## Step 7 — Render-specific security

Check `render.yaml`:
- Are any secret values hardcoded in render.yaml? (they should all be `sync: false`)
- Is the health check path correct and unauthenticated?
- Is auto-deploy restricted to the right branch?

```bash
cat ~/workspace/edictum-console/render.yaml
```

---

## Report format

```
# Audit 7 Results — Infrastructure & Secrets

## Docker
- Non-root user: yes/no
- Multi-stage build effective: yes/no (build tools present in final image?)
- Secrets baked in: yes/no
- Sensitive files in image: (list any found)

## Git History
- Secrets found in git history: yes/no (list any — CRITICAL if yes)
- .env tracked by git: yes/no

## CORS
- Wildcard CORS: yes/no (CRITICAL if yes)
- Allowed origins: (list)
- Misconfigured preflight: yes/no

## Security Headers
- X-Content-Type-Options: present/missing
- X-Frame-Options: present/missing
- HSTS: present/missing
- CSP: present/missing

## Environment Variables
- SECRET_KEY has no default: yes/no
- SIGNING_KEY_SECRET has no default: yes/no
- ADMIN_PASSWORD has no default: yes/no

## render.yaml
- Secrets hardcoded: yes/no

## Ship-blockers
(Wildcard CORS, secrets in git, secrets baked in Docker, non-root missing)

## Recommendations
```
