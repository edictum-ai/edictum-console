# Audit 5 — Frontend Security & Quality

**Context:** The frontend is the operator's window into agent governance.
If it leaks data, has broken auth, or shows wrong information, operators make wrong decisions.
Save findings to `audits/results/AUDIT-5-results.md`.

---

## Setup

```bash
cd ~/workspace/edictum-console/dashboard

# TypeScript strict check
npx tsc --noEmit 2>&1 | tee ../audits/results/tsc.txt

# ESLint
npx eslint src/ --ext .ts,.tsx --max-warnings 0 2>&1 | tee ../audits/results/eslint.txt

# Build — must succeed with zero errors
pnpm build 2>&1 | tee ../audits/results/frontend-build.txt
```

---

## Step 1 — Security: auth and session handling

Grep the source for these patterns and report every match:

```bash
cd ~/workspace/edictum-console/dashboard/src

# Auth tokens must NEVER be in localStorage or sessionStorage
grep -rn "localStorage\|sessionStorage" . --include="*.ts" --include="*.tsx"

# No sensitive data in console.log (API keys, tokens, passwords)
grep -rn "console\.log" . --include="*.ts" --include="*.tsx" | \
  grep -i "key\|token\|password\|secret\|auth"

# dangerouslySetInnerHTML — every instance is an XSS risk
grep -rn "dangerouslySetInnerHTML" . --include="*.ts" --include="*.tsx"

# Check for eval() usage
grep -rn "\beval\b" . --include="*.ts" --include="*.tsx"

# Direct DOM manipulation (can lead to XSS)
grep -rn "innerHTML\|outerHTML" . --include="*.ts" --include="*.tsx"
```

For each `dangerouslySetInnerHTML` found: Is the content sanitized? Is it from user input?
Any unsanitized user input → XSS → **ship-blocker**.

---

## Step 2 — Security: API client

```bash
cd ~/workspace/edictum-console/dashboard/src

# All API calls must go through lib/api.ts — no fetch() or axios outside it
grep -rn "fetch(" . --include="*.ts" --include="*.tsx" | grep -v "lib/api"
grep -rn "axios" . --include="*.ts" --include="*.tsx"

# Check lib/api.ts — does it include credentials?
grep -n "credentials\|withCredentials" lib/api.ts

# Check for hardcoded URLs or API keys
grep -rn "http://\|https://" . --include="*.ts" --include="*.tsx" | \
  grep -v "onrender.com\|localhost\|placeholder\|example.com\|render.com"
```

---

## Step 3 — TypeScript: any usage

```bash
cd ~/workspace/edictum-console/dashboard/src

# Every `any` is a type safety gap — list them all
grep -rn ": any\|as any\|<any>" . --include="*.ts" --include="*.tsx" | \
  grep -v "//.*any" | grep -v "test"

# Count total
grep -rn ": any\|as any\|<any>" . --include="*.ts" --include="*.tsx" | wc -l
```

Any `any` in auth, API response parsing, or event handling is a finding.

---

## Step 4 — Light mode completeness

The CLAUDE.md rule: `text-*-600 dark:text-*-400` for ALL semantic colors.
`text-*-400` alone is invisible on white backgrounds.

```bash
cd ~/workspace/edictum-console/dashboard/src

# Find text colors that only have dark: variant (missing light fallback)
grep -rn "dark:text-" . --include="*.tsx" | while read line; do
  # Check if the same line has a light-mode color paired with it
  echo "$line"
done | head -50

# Find standalone -400 colors (invisible in light mode)
grep -rn "text-[a-z]*-400\b" . --include="*.tsx" | \
  grep -v "dark:text-[a-z]*-400" | grep -v "//.*text-"

# Find bg colors missing light-mode variant
grep -rn "dark:bg-" . --include="*.tsx" | grep -v "bg-" | head -20
```

---

## Step 5 — shadcn/ui compliance

Raw HTML elements that should be shadcn components:

```bash
cd ~/workspace/edictum-console/dashboard/src

# Raw <button> tags (should be shadcn Button)
grep -rn "<button\b" . --include="*.tsx" | grep -v "//.*<button"

# Raw <input> (should be shadcn Input)
grep -rn "<input\b" . --include="*.tsx" | grep -v "//.*<input"

# Raw <select> (should be shadcn Select)
grep -rn "<select\b" . --include="*.tsx" | grep -v "//.*<select"

# Raw <label> (should be shadcn Label)
grep -rn "<label\b" . --include="*.tsx" | grep -v "//.*<label"

# Hand-rolled progress bars
grep -rn "w-\[.*%\]\|style.*width.*%" . --include="*.tsx" | head -20
```

---

## Step 6 — State management and lifecycle correctness

Read each of these files and answer the questions:

**`src/pages/approvals-queue.tsx`**
- Does the approval timer clean up on unmount? (`clearInterval` or `clearTimeout` in useEffect cleanup)
- When an approval expires, does the UI update correctly without a full refresh?
- Is there any floating promise (async call without await/catch)?

**`src/pages/events-feed.tsx`**
- Does the SSE EventSource close on component unmount?
- If the SSE connection drops, does it reconnect?
- Does the filter panel actually filter — is every dropdown wired to real behavior?

**`src/pages/contracts.tsx`**
- Does the YAML editor reflect the deployed version or the latest upload?
- Does the diff view correctly show additions/removals?
- If the playground/evaluate tab sends a request, is the response displayed?

**`src/pages/dashboard-home.tsx`**
- Are all stat numbers real API data or hardcoded?
- Do charts render correctly with 0 data points?

---

## Step 7 — Duplicate code

Check the shared modules rule from CLAUDE.md:

```bash
cd ~/workspace/edictum-console/dashboard/src

# formatRelativeTime defined more than once?
grep -rn "formatRelativeTime\|formatTime\|formatArgs" . --include="*.ts" --include="*.tsx" | \
  grep -v "import\|lib/format"

# verdictColor defined more than once?
grep -rn "verdictColor\|VerdictIcon\|verdictDot" . --include="*.ts" --include="*.tsx" | \
  grep -v "import\|lib/verdict"

# ENV_COLORS or EnvBadge defined inline?
grep -rn "EnvBadge\|ENV_COLORS" . --include="*.ts" --include="*.tsx" | \
  grep -v "import\|lib/env-colors"
```

Any function defined in two places is a bug — list each one.

---

## Report format

```
# Audit 5 Results — Frontend Security & Quality

## TypeScript
- tsc errors: X
- ESLint errors: X
- `any` usage count: X (list security-relevant ones)

## Security findings
- dangerouslySetInnerHTML instances: (list each — sanitized? user input?)
- localStorage/sessionStorage usage: (list each)
- fetch() outside lib/api.ts: (list each)
- console.log with sensitive data: (list each)

## Light mode issues
- Standalone -400 colors found: X (list files)
- Missing light-mode bg variants: X (list files)

## shadcn compliance
- Raw <button>: X instances
- Raw <input>: X instances
- Raw <select>: X instances

## Lifecycle issues
(Timer leaks, floating promises, unclosed SSE connections)

## Duplicate code
(Functions defined in multiple places)

## Ship-blockers
(XSS risks, auth issues, broken data display)

## Recommendations
```
