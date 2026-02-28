# PROMPT-MULTI-BUNDLE-P2B-FIXUP — Update Contracts UI for Name-Scoped API

> **Scope:** Update the already-built contracts page shell, Tab 1, and bundle header to work with the new name-scoped bundle API. Also update the frontend API client.
> **Depends on:** MULTI-BUNDLE-P2-ROUTES (new API endpoints must exist).
> **Deliverable:** Contracts view works with named bundles — two-level selection (bundle name → version), API calls use name-scoped paths.
> **Time budget:** ~45 min

---

## Context

CONTRACTS-P1 through P3 were built against the old single-lineage API:
- `GET /bundles` returned a flat `BundleWithDeployments[]`
- All routes used `/bundles/{version}` (no name)
- The UI assumed one bundle lineage per tenant

After MULTI-BUNDLE-P2, the API is name-scoped:
- `GET /bundles` returns `BundleSummary[]` (distinct bundle names)
- `GET /bundles/{name}` returns `BundleWithDeployments[]` (versions for one name)
- All routes include `{name}` in the path

This prompt updates the existing UI to match.

---

## Required Reading

1. `Multi-BundleDataModel.md` §5 (new route structure), §7 (frontend API types)
2. `dashboard/src/pages/contracts.tsx` — Page shell (198 lines, MUST CHANGE)
3. `dashboard/src/pages/contracts/contracts-tab.tsx` — Tab 1 (199 lines, MUST CHANGE)
4. `dashboard/src/pages/contracts/bundle-header.tsx` — Header (173 lines, MUST CHANGE)
5. `dashboard/src/lib/api/bundles.ts` — API client (105 lines, MUST CHANGE)
6. `dashboard/src/lib/api/index.ts` — Re-exports (MUST CHANGE)

**Safe files (no changes needed):**
- `types.ts`, `yaml-parser.ts`, `yaml-diff.ts`, `contract-summary.ts` — pure YAML content types
- `contract-row.tsx`, `contract-detail.tsx`, `expression-tree.tsx` — work with parsed types only
- `yaml-sheet.tsx` — receives props, caller passes correct values

---

## Files to Modify

### 1. `dashboard/src/lib/api/bundles.ts` — API Client Types + Functions

**Types to update:**
- `BundleResponse`: Add `name: string`
- `DeploymentResponse`: Add `bundle_name: string`

**Types to add:**
- `BundleSummary`: `{ name, latest_version, version_count, last_updated, deployed_envs }`

**Functions to update:**
- `listBundles()` → return type becomes `BundleSummary[]` (was `BundleWithDeployments[]`)
- `deployBundle(name, version, env)` → URL becomes `/bundles/${encodeURIComponent(name)}/${version}/deploy`
- `getBundleYaml(name, version)` → URL becomes `/bundles/${encodeURIComponent(name)}/${version}/yaml`, return `Promise<string>`
- `getCurrentBundle(name, env)` → URL becomes `/bundles/${encodeURIComponent(name)}/current?env=...`
- `listDeployments(bundleName?, env?, limit?)` → add `bundle_name` query param

**Functions to add:**
- `listBundleVersions(name)` → `GET /bundles/${encodeURIComponent(name)}`, returns `BundleWithDeployments[]`

**Functions unchanged:**
- `uploadBundle(yamlContent)` — POST path unchanged (name extracted server-side)
- `evaluateBundle(body)` — takes raw YAML, unchanged

**Use `encodeURIComponent(name)` in all URL path segments.**

### 2. `dashboard/src/lib/api/index.ts` — Re-exports

Add `listBundleVersions` to function exports, `BundleSummary` to type exports.

### 3. `dashboard/src/pages/contracts.tsx` — Page Shell

**The core change: two-level selection model.**

Old model: `selectedVersion: number` → flat list
New model: `selectedBundle: string | null` + `selectedVersion: number | null`

**State changes:**
```typescript
// OLD
const [selectedVersion, setSelectedVersion] = useState<number>(0)

// NEW
const [selectedBundle, setSelectedBundle] = useState<string | null>(null)
const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
```

**Data fetching changes:**

```typescript
// Step 1: Fetch bundle summaries (names)
const [summaries, setSummaries] = useState<BundleSummary[]>([])
// ... fetch with listBundles()

// Step 2: When selectedBundle changes, fetch versions for that bundle
const [bundles, setBundles] = useState<BundleWithDeployments[]>([])
// ... fetch with listBundleVersions(selectedBundle) when selectedBundle changes

// Step 3: When selectedVersion changes, fetch YAML
// ... fetch with getBundleYaml(selectedBundle, selectedVersion)
```

**Default selection logic:**
```typescript
// When summaries load, auto-select the first bundle name
if (summaries.length > 0 && !selectedBundle) {
  setSelectedBundle(summaries[0].name)
}
// When versions load, auto-select the latest version
if (bundles.length > 0 && !selectedVersion) {
  setSelectedVersion(bundles[0].version)
}
```

**SSE handler updates:**
```typescript
// bundle_uploaded event now has bundle_name
case "bundle_uploaded": {
  const { bundle_name } = event as { bundle_name: string }
  // If the uploaded bundle matches the selected bundle, refresh versions
  if (bundle_name === selectedBundle) {
    refreshVersions()
  }
  // Always refresh summaries (version counts may change)
  refreshSummaries()
  break
}
// contract_update event now has bundle_name
case "contract_update": {
  const { bundle_name } = event as { bundle_name: string }
  if (bundle_name === selectedBundle) {
    refreshVersions()  // env badges may change
  }
  break
}
```

**Header text:** Change from `${bundles.length} versions uploaded` to `${summaries.length} bundles` or show the selected bundle's info.

**Pass `selectedBundle` to child components** that need it for API calls.

**URL state:** Add `bundle` param: `?tab=contracts&bundle=devops-agent&version=3`. Read on mount, write on selection change.

### 4. `dashboard/src/pages/contracts/contracts-tab.tsx` — Tab 1

**Props change:**
```typescript
// OLD
interface ContractsTabProps {
  bundles: BundleWithDeployments[]
  selectedVersion: number
  onVersionChange: (version: number) => void
  ...
}

// NEW
interface ContractsTabProps {
  summaries: BundleSummary[]            // NEW — for bundle name selector
  bundles: BundleWithDeployments[]      // versions for the selected bundle
  selectedBundle: string | null         // NEW
  selectedVersion: number | null
  onBundleChange: (name: string) => void  // NEW
  onVersionChange: (version: number) => void
  ...
}
```

**Bundle name selector:** Add a selector above or alongside the version dropdown. When there's only one bundle, it can be implicit (just show the name). When there are multiple, show a Select dropdown or a tab-like pill bar for bundle names.

**Version dropdown:** Now only shows versions for the selected bundle (not all versions across all bundles). This is already the right behavior since `bundles` prop will be pre-filtered.

**Empty state updates:**
- No summaries at all: "No contract bundles yet. Upload your first bundle."
- Summaries exist but no bundle selected: "Select a bundle to view contracts."
- Bundle selected but no versions: (shouldn't happen if summaries exist)

### 5. `dashboard/src/pages/contracts/bundle-header.tsx` — Bundle Header

**Props change:**
```typescript
// OLD
interface BundleHeaderProps {
  bundles: BundleWithDeployments[]
  selectedVersion: number
  onVersionChange: (version: number) => void
  ...
}

// NEW
interface BundleHeaderProps {
  bundleName: string                    // the selected bundle's name
  bundles: BundleWithDeployments[]      // versions for this bundle only
  selectedVersion: number | null
  onVersionChange: (version: number) => void
  ...
}
```

**Key fixes:**
1. **Bundle name display:** Use `bundleName` prop instead of `parsedBundle.metadata.name` (they should match, but the prop is the source of truth from the API).
2. **Env-version map (lines 65-70):** Already correct after this change — `bundles` is pre-filtered to one bundle name, so the env map won't mix versions from different bundles.
3. **Version dropdown:** Already correct — iterates `bundles` which are pre-filtered.

---

## What NOT to Change

- **`contract-row.tsx`, `contract-detail.tsx`, `expression-tree.tsx`** — These work with parsed YAML types (`ParsedContract`, `ContractBundle`), not API types. They're insulated from the API change.
- **`yaml-sheet.tsx`** — Receives `bundleName`, `version`, `yamlContent` as props. The caller just needs to pass the right values.
- **`yaml-parser.ts`, `yaml-diff.ts`, `contract-summary.ts`** — Pure content processing. No API coupling.
- **`types.ts`** — YAML domain types. Already has `metadata.name`. No change needed.

---

## Verification Checklist

### Functional
- [ ] `GET /bundles` returns bundle summaries (names) — verify in Network tab
- [ ] Bundle name selector shows all distinct bundle names
- [ ] Selecting a bundle loads its versions
- [ ] Selecting a version loads YAML and shows contracts in Tab 1
- [ ] Upload a new version → SSE updates the version list (if matching bundle) and summary counts
- [ ] Deploy a version → SSE updates env badges (if matching bundle)
- [ ] URL state: `?tab=contracts&bundle=devops-agent&version=3` works as deep link
- [ ] Switching bundles resets version selection to latest

### Multi-bundle scenario
- [ ] Upload two bundles with different `metadata.name` values
- [ ] Both appear in the bundle name selector
- [ ] Each has independent version numbering (both start at v1)
- [ ] Selecting bundle A shows only A's contracts
- [ ] Selecting bundle B shows only B's contracts
- [ ] Env badges are scoped — deploying A to production doesn't affect B's display

### Edge cases
- [ ] Single bundle: selector can be implicit (no dropdown needed, just show name)
- [ ] No bundles: empty state with upload guidance
- [ ] Bundle name with special characters: URL-encoded properly

### Theme check
- [ ] Dark mode: bundle selector readable, all badges visible
- [ ] Light mode: same — no invisible text

### Code quality
- [ ] All files under 200 lines
- [ ] No raw HTML elements — all shadcn
- [ ] No duplicated utilities
- [ ] TypeScript strict, no `any`
- [ ] `encodeURIComponent()` on all bundle names in URLs
