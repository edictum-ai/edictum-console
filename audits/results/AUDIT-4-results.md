# Audit 4 — Dependencies & Supply Chain Results

**Date:** 2026-03-01

---

## Executive Summary

**Overall: GOOD**

Only pip itself has vulnerabilities (not a runtime dependency). All application dependencies are clean.

---

## Python Dependencies (pip-audit)

### Vulnerabilities Found

| Package | Version | CVE | Fix Version | Severity |
|---------|---------|-----|-------------|----------|
| pip | 25.0.1 | CVE-2025-8869 | 25.3 | To be assessed |
| pip | 25.0.1 | CVE-2026-1703 | 26.0 | To be assessed |

**Important:** These are vulnerabilities IN pip itself, not in application dependencies. Pip is not exposed to untrusted input in this application. 

**Recommendation:** Upgrade pip to 26.0+ in development environment (not security-critical for runtime).

### Application Dependencies
- **Status:** ✅ All clean
- **Note:** edictum-console itself isn't on PyPI (private package)

---

## Frontend Dependencies (pnpm audit)

- **Status:** ✅ No known vulnerabilities found

---

## License Compliance (pip-licenses)

All dependencies use permissive licenses (Apache-2.0, MIT, BSD-3-Clause, etc.).

No GPL or copyleft licenses detected in direct dependencies.

---

## Recommendations

1. **Low Priority:** Upgrade pip: `pip install --upgrade pip>=26.0`
2. **Ongoing:** Run `pip-audit` and `pnpm audit` in CI pipeline

---

## Raw Output Files

- `pip-audit.json` - Full JSON vulnerability report
- `pip-audit.txt` - Human-readable output
- `pip-licenses.json` - License information
- `pnpm-audit.json` - Frontend dependency audit
