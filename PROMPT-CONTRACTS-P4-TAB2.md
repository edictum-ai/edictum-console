# P4: Tab 2 — Versions ("What exists and where is it deployed?")

> **Scope:** upload-sheet, deploy-dialog, version-detail, versions-tab
> **Depends on:** P3 (Tab 1 working), MULTI-BUNDLE-P2B-FIXUP (name-scoped API)
> **Deliverable:** Upload → deploy → rollback flow working end-to-end with SSE
> **Time budget:** Single session

---

> **⚠️ MULTI-BUNDLE UPDATE:** The bundle API is now name-scoped. Key changes for this prompt:
>
> - **`deployBundle(name, version, env)`** — takes bundle name as first param (not just version)
> - **`getBundleYaml(name, version)`** — takes bundle name as first param
> - **`BundleWithDeployments`** now has a `name: string` field
> - **`DeploymentResponse`** now has a `bundle_name: string` field
> - **The page shell passes `selectedBundle: string`** — use it in all API calls
> - **Props that took `version: number` now also need `bundleName: string`**
> - **deploy-dialog:** `deployBundle(bundleName, version, selectedEnv)` not `deployBundle(version, env)`
> - **version-detail:** `getBundleYaml(bundleName, bundle.version)` not `getBundleYaml(selectedVersion)`
> - Read `PROMPT-MULTI-BUNDLE-P2B-FIXUP.md` for the full API client changes

---

## Required Reading

1. `contracts_spec.md` §4 (Tab 2: Versions), §4.4 (Deploy Dialog), §4.5 (Upload Sheet)
2. Existing `lib/api/bundles.ts` — `uploadBundle`, `deployBundle`, `listDeployments` functions
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate

## Shared Modules — MUST Import

| Need | Import from |
|------|-------------|
| Environment badges | `EnvBadge`, `ENV_COLORS` from `@/lib/env-colors` |
| Relative timestamps | `formatRelativeTime` from `@/lib/format` |
| String truncation | `truncate` from `@/lib/format` |
| Bundle validation | `validateBundle` from `./yaml-parser` (from P2) |
| YAML highlighting | Reuse the highlighting function from `yaml-sheet.tsx` (from P3). If it's inlined, extract to a shared `highlightYaml(line: string): ReactNode` utility in `yaml-sheet.tsx` and export it. |

---

## Files to Create (4 files)

### 1. `pages/contracts/upload-sheet.tsx`

**Trigger:** `Button variant="outline"` labeled "Upload" — placed in the page header by contracts-tab or the page shell.

**Sheet:** shadcn `Sheet side="right"` with `SheetHeader`, `SheetContent`.

**Layout:**
```
┌──── Upload Contract Bundle ──────────┐
│                                      │
│  Template: [Select a template... ▾]  │
│                                      │
│  Paste YAML or drag a .yaml file     │
│  ┌────────────────────────────────┐  │
│  │                               │  │
│  │  (monospace textarea)         │  │
│  │                               │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌ Validation ───────────────────┐  │
│  │ ✓ Valid edictum/v1 bundle     │  │
│  │ 8 contracts found             │  │
│  └───────────────────────────────┘  │
│                                      │
│  [Cancel]         [Upload Bundle ▸]  │
└──────────────────────────────────────┘
```

**Template picker:** shadcn `Select` at the top:
- "DevOps Agent (starter)" — 6 contracts, simple
- "Production Governance (advanced)" — 11 contracts, L2 sandbox

Store both templates as `const DEVOPS_AGENT_TEMPLATE = \`...\`` and `const GOVERNANCE_V5_TEMPLATE = \`...\`` — copy from `contracts_spec.md` §3.9.

Selecting a template populates the textarea. If textarea already has content, confirm before replacing ("Replace current content with template?").

**Textarea:** shadcn `Textarea` with `className="font-mono min-h-[300px]"`. Full-width.

**Drag-drop:**
- `onDragOver`: `e.preventDefault()`, visual feedback (border highlight)
- `onDrop`: read file as text
- **File type check:** Accept `.yaml`, `.yml`, `.txt`, `.md`. Check `file.name` extension on drop. If wrong type → `toast.error("Only YAML files are supported (.yaml, .yml, .txt, .md)")` and reject.

**Validation:** Run `validateBundle(textareaValue)` on every change (debounced ~300ms). Show inline:
- Valid: `Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"` + "N contracts found"
- Invalid: `Badge variant="destructive"` + error message
- Empty: nothing shown

**Submit:**
- `uploadBundle(yamlContent)` → on success: `toast.success("Bundle uploaded")`, close sheet, call `onRefresh()`
- On 422: show server error inline below textarea
- Button disabled when: textarea empty OR validation failed OR submitting

**File size target:** ~120-150 lines. If approaching 200, extract the template constants to a `templates.ts` file.

### 2. `pages/contracts/deploy-dialog.tsx`

**Props:** `version: number`, `currentlyDeployedVersion: number | null`, `envs: string[]`, `changeSummary: string | null`, `onSuccess: () => void`

**Trigger:** `Button` labeled "Deploy v{version}" — placed in version-detail.

**Dialog:** shadcn `Dialog` + `DialogContent` + `DialogHeader` + `DialogFooter`.

**Layout:**
```
Deploy v5 to production?

Environment: [production ▾]

Currently deployed: v3
Changes: +2 contracts, ~1 modified

[Cancel]              [Deploy v5 ▸]
```

**Environment picker:** shadcn `Select` with options: "production", "staging", "development". Default to "staging" (safer default than production).

**Info display:**
- "Currently deployed: v{N}" — look up which version is currently in the selected env (from bundles data). If none → "No version deployed"
- Change summary: if available, show "+N added, -N removed, ~N modified"

**Deploy button:** `className="bg-amber-600 hover:bg-amber-700 text-white"` — amber to signal caution.

**On confirm:**
```typescript
await deployBundle(version, selectedEnv)
toast.success(`Deployed v${version} to ${selectedEnv}`)
onSuccess()
setOpen(false)
```

**On error:** `toast.error(error.message)`

**File size target:** ~80-100 lines

### 3. `pages/contracts/version-detail.tsx`

**Props:** `bundle: BundleWithDeployments`, `allBundles: BundleWithDeployments[]`, `parsedBundle: ContractBundle | null`, `yamlContent: string`, `onRefresh: () => void`

**Layout:** Right panel of the two-panel versions view.

**Sections:**

1. **Header:**
   - "v{version} — {bundleName}"
   - Revision hash: `truncate(bundle.revision_hash, 12)` + copy button (shadcn `Tooltip` wrapping a button → `navigator.clipboard.writeText` + toast)
   - "Uploaded {formatRelativeTime(bundle.created_at)}"
   - "by {bundle.uploaded_by}" — display email, or truncated UUID with `Tooltip` if not resolvable

2. **Deployment status:**
   - "Deployed to:" header
   - For each env this version is deployed to: `EnvBadge` + "({formatRelativeTime(deployedAt)})"
   - If not deployed anywhere: "Not deployed to any environment"

3. **Deploy action:**
   - `Select` for env + `Button` "Deploy" → opens `DeployDialog`
   - Or just a "Deploy to..." button that opens the dialog with env picker inside

4. **Change summary:**
   - Compare this version with the previous version (version - 1, if it exists)
   - Use `diffContracts` from yaml-parser (P2)
   - Show "+N added, -N removed, ~N modified"
   - Clickable → navigates to `?tab=diff&from={prev}&to={this}` using `useSearchParams`

5. **YAML preview:**
   - `ScrollArea` with `<pre>` — reuse YAML highlighting from yaml-sheet
   - Max height with scroll (not full page)

**File size target:** ~120-150 lines

### 4. `pages/contracts/versions-tab.tsx`

**Props:** `bundles`, `onRefresh`

**Layout:** Two-panel, matching Events page:

```
┌──────────────────────────┬───────────────────────────┐
│ Left: version list       │ Right: version detail      │
│ (scrollable)             │ (selected version)         │
└──────────────────────────┴───────────────────────────┘
```

**Implementation:** `flex h-full` root. Left panel `w-[280px] shrink-0 border-r`. Right panel `flex-1 overflow-y-auto`.

**Left panel (version list):**

NOT TanStack Table — this is a selection list (matches Events left panel pattern).

- `ScrollArea` wrapping version rows
- Each row shows:
  - Version number: `font-mono font-semibold`
  - Env badges: `EnvBadge` for each deployed env
  - Uploaded by: email or truncated UUID
  - Time: `formatRelativeTime(created_at)`
- Currently deployed versions: `border-l-2` with env color (use `ENV_COLORS` map)
- Versions with no deployments: `opacity-60`
- Hover: `hover:bg-muted/50`
- Selected: `bg-muted/30 border-l-2 border-accent`
- Click: sets `selectedVersion` state

**Right panel:**

- When a version is selected: render `<VersionDetail />` with the selected bundle
- When no version selected: centered "Select a version to view details"
- Need to load YAML for the selected version: `getBundleYaml(selectedVersion)` on selection change

**Header:** "Versions" title + "Upload New" button (opens `UploadSheet`)

**States:**
- Loading: `Loader2` centered
- Error: Card with retry
- Empty: "No versions yet. Upload your first contract bundle. [Upload Bundle]"

**File size target:** ~100-130 lines

---

## Wire into Page Shell

Update `pages/contracts.tsx`:
- Import `VersionsTab` from `./contracts/versions-tab`
- Import `UploadSheet` from `./contracts/upload-sheet`
- Replace versions tab placeholder with `<VersionsTab bundles={bundles} onRefresh={refresh} />`
- Add "Upload" button to page header (opens UploadSheet)
- The UploadSheet's `onRefresh` triggers the page shell's `refresh()` to reload bundles

---

## Verification: End-to-End Flow

Start the server, navigate to `/dashboard/contracts?tab=versions`:

### Upload flow:
- [ ] Click "Upload New" → sheet slides in
- [ ] Select "DevOps Agent (starter)" template → textarea fills with YAML
- [ ] Validation shows: "✓ Valid edictum/v1 bundle, 6 contracts found"
- [ ] Click "Upload Bundle" → toast "Bundle uploaded" → sheet closes
- [ ] Version list updates with new version (SSE or refetch)
- [ ] New version auto-selected in list

### Upload with governance-v5:
- [ ] Select "Production Governance (advanced)" template → textarea fills
- [ ] Validation: "✓ Valid edictum/v1 bundle, 11 contracts found"
- [ ] Upload succeeds

### Drag-drop:
- [ ] Drag a .yaml file → textarea fills
- [ ] Drag a .png file → toast error "Only YAML files are supported"

### Invalid YAML:
- [ ] Type garbage in textarea → validation shows error badge + message
- [ ] Upload button disabled

### Version detail:
- [ ] Click a version in the list → right panel loads
- [ ] Revision hash truncated, copy button works
- [ ] Timestamps use relative format ("15m ago")
- [ ] Env badges show correctly

### Deploy flow:
- [ ] Click "Deploy to..." → dialog opens
- [ ] Select "production" env → shows currently deployed version (or "None")
- [ ] Click "Deploy v2" → toast "Deployed v2 to production"
- [ ] Env badges update on the version (SSE)
- [ ] Switch to Tab 1 → env badges in bundle header also updated

### Change summary:
- [ ] v2 detail shows "+N added, ~N modified" vs v1
- [ ] Click → navigates to `?tab=diff&from=1&to=2`

### Theme check:
- [ ] Dark mode: version list readable, badges visible
- [ ] Light mode: same — no invisible text, no washed-out badges

### Audit checklist:
- [ ] All files under 200 lines
- [ ] No raw HTML elements — all shadcn
- [ ] No duplicated utilities
- [ ] Hover states on version rows
- [ ] Selected state visually clear
- [ ] Empty state guides user
- [ ] Error state has retry button
