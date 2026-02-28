# P4: Tab 2 — Versions ("What exists and where is it deployed?")

> **Scope:** upload-sheet, deploy-dialog, version-detail, versions-tab + wire Upload button in page shell
> **Depends on:** P1 (backend endpoints), P2 (page shell), P3 (Tab 1 patterns)
> **Deliverable:** Full Tab 2 working against real data. Upload → deploy → version browsing flow end-to-end.
> **Time budget:** Single session

---

## Required Reading

1. `contracts_spec.md` §4 (Tab 2), §1.5 (shared modules), §1.7 (light/dark)
2. `PROMPT-FRONTEND-AUDIT.md` — This tab must pass items 1-5
3. `pages/events-feed.tsx` — Reference for two-panel layout pattern (flex with fixed widths, no ResizablePanelGroup)
4. `pages/contracts/bundle-header.tsx` — Reference for how `uploaded_by` is already displayed (email prefix or truncated UUID)
5. `pages/contracts/yaml-sheet.tsx` — Reference for YAML display and syntax highlighting (reuse the same highlighter)
6. `pages/contracts/yaml-parser.ts` — `validateBundle()` for client-side upload validation, `parseContractBundle()` for rendering

## Shared Modules — MUST Import (Do NOT Reimplement)

| Need | Import from |
|------|-------------|
| Environment badges | `EnvBadge` from `@/lib/env-colors` |
| Relative timestamps | `formatRelativeTime` from `@/lib/format` |
| String truncation | `truncate` from `@/lib/format` |
| Verdict colors | `verdictColor` from `@/lib/verdict-helpers` (for deploy status indicators) |
| Bundle API | `listBundles`, `uploadBundle`, `deployBundle`, `getBundleYaml`, `listDeployments` from `@/lib/api` |
| Types | `BundleWithDeployments`, `DeploymentResponse` from `@/lib/api` |
| Contract types | `ContractBundle` from `./types` |
| YAML validation | `validateBundle`, `parseContractBundle` from `./yaml-parser` |
| Contract diffing | `diffContracts` from `./yaml-parser` (re-exported from `./yaml-diff`) |
| Toast | `toast` from `sonner` |

**CRITICAL: Use the existing `DeploymentResponse` type from `@/lib/api`. Do NOT create a duplicate type.**

---

## Data Model Constraint

One tenant = one version lineage. There is no "bundle picker" — all versions belong to the same tenant. The `metadata.name` inside the YAML can change between versions (v1 might be "devops-agent", v6 might be "governance-v5"). The version selector is the only navigation axis.

- `listBundles()` returns all versions with their `deployed_envs[]`
- `listDeployments()` returns deployment history (which version was deployed to which env, when, by whom)
- `getBundleYaml(version)` returns raw YAML for any version

---

## Files to Create (4 files)

### 1. `pages/contracts/upload-sheet.tsx`

**Props:** `onUploaded: (version: number) => void`

Opens as a sheet from a trigger button. The sheet handles the entire upload flow.

**Layout:**
```
┌──── Upload Contract Bundle ───────────┐
│                                       │
│  Paste YAML or drag a .yaml file      │
│  ┌─────────────────────────────────┐  │
│  │ apiVersion: edictum/v1          │  │
│  │ kind: ContractBundle            │  │
│  │ ...                             │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  [Load starter template]              │
│                                       │
│  ┌ Validation ────────────────────┐   │
│  │ ✓ Valid edictum/v1 bundle      │   │
│  │ 8 contracts found              │   │
│  └────────────────────────────────┘   │
│                                       │
│  [Cancel]          [Upload Bundle ▸]  │
└───────────────────────────────────────┘
```

**Components:**
- Outer: shadcn `Sheet` (side="right") + `SheetContent` + `SheetHeader` + `SheetTitle` + `SheetDescription` + `SheetFooter`
- Width: `className="w-[50vw] sm:max-w-[50vw]"` (matches yaml-sheet pattern)
- Textarea: shadcn `Textarea` with `className="font-mono text-sm min-h-[400px]"` — large paste area
- Trigger button: `SheetTrigger asChild` wrapping a `Button variant="outline" size="sm"` labeled "Upload"

**Drag-and-drop:**
```typescript
const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml"))) {
    const reader = new FileReader()
    reader.onload = () => setYamlText(reader.result as string)
    reader.readAsText(file)
  }
}
```

Apply `onDragOver={handleDragOver}` and `onDrop={handleDrop}` to the Sheet content area. Visual feedback: when dragging over, add `ring-2 ring-amber-500/50` to the textarea.

**Client-side validation:**
- On every change to `yamlText` (debounced 300ms or on blur), call `validateBundle(yamlText)` from yaml-parser
- Show validation result below textarea:
  - Valid: `<Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">✓ Valid</Badge>` + "{N} contracts found"
  - Invalid: `<Badge variant="destructive">✗ Invalid</Badge>` + error message
  - Empty: nothing shown
- Upload button disabled when: `yamlText` is empty, or validation is invalid, or upload is in progress

**Starter template:**
- Button: `variant="ghost" size="sm"` labeled "Load starter template"
- On click: pastes a minimal valid bundle into the textarea:

```yaml
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: my-agent
defaults:
  mode: enforce
contracts:
  - id: example-deny
    type: pre
    tool: "*"
    when:
      tool_name:
        equals: dangerous_tool
    then:
      effect: deny
      message: This tool is not allowed
```

**Submit:**
```typescript
const handleUpload = async () => {
  setUploading(true)
  try {
    const result = await uploadBundle(yamlText)
    toast.success(`Version v${result.version} uploaded`)
    onUploaded(result.version)
    setOpen(false)
    setYamlText("")
  } catch (e) {
    const msg = e instanceof ApiError ? e.body : "Upload failed"
    toast.error(msg)
    setServerError(msg)
  } finally {
    setUploading(false)
  }
}
```

- On success: toast, call `onUploaded(newVersion)`, close sheet, clear textarea
- On 422: show server validation error inline below the client-side validation (server may catch things the client doesn't, like duplicate revision hash)

**File size target:** ~130-160 lines

### 2. `pages/contracts/deploy-dialog.tsx`

**Props:**
```typescript
interface DeployDialogProps {
  version: number
  bundleName: string
  bundles: BundleWithDeployments[]
  onDeployed: () => void
  trigger: React.ReactNode  // The button that opens the dialog
}
```

**Layout:**
```
┌───────────────────────────────────────┐
│ Deploy v5 to environment              │
│                                       │
│ Environment: [production ▾]           │
│                                       │
│ Currently deployed: v3                │
│                                       │
│ [Cancel]              [Deploy v5 ▸]   │
└───────────────────────────────────────┘
```

**Components:**
- Outer: shadcn `Dialog` + `DialogTrigger` + `DialogContent` + `DialogHeader` + `DialogTitle` + `DialogDescription` + `DialogFooter`
- Env picker: shadcn `Select` with known environments (production, staging, development). Default to first env without a deployment of this version.
- Current status: show what version is currently deployed to the selected env (if any). Use `EnvBadge` + version number.
- Cancel: `Button variant="outline"`
- Deploy: `Button className="bg-amber-600 hover:bg-amber-700 text-white"` — amber to match brand accent. Shows `Loader2` spinner when deploying.
- **Deploy button text:** "Deploy v{version}" (not just "Deploy")

**Logic:**
```typescript
const handleDeploy = async () => {
  setDeploying(true)
  try {
    await deployBundle(version, selectedEnv)
    toast.success(`v${version} deployed to ${selectedEnv}`)
    onDeployed()
    setOpen(false)
  } catch (e) {
    const msg = e instanceof ApiError ? e.body : "Deploy failed"
    toast.error(msg)
  } finally {
    setDeploying(false)
  }
}
```

**Current env status:** For the selected environment, find which version (if any) is currently deployed there:
```typescript
const currentlyDeployed = bundles.find(b => b.deployed_envs.includes(selectedEnv))
```

If `currentlyDeployed` exists and it's a different version: show "Currently deployed: v{currentlyDeployed.version}"
If same version is already deployed: show "Already deployed" and disable the deploy button.
If nothing deployed: show "No version currently deployed"

**File size target:** ~80-110 lines

### 3. `pages/contracts/version-detail.tsx`

**Props:**
```typescript
interface VersionDetailProps {
  bundle: BundleWithDeployments
  bundles: BundleWithDeployments[]   // for deploy dialog context
  parsedBundle: ContractBundle | null // parsed YAML of this version
  yamlContent: string
  onDeployed: () => void
  onNavigateDiff: (fromVersion: number, toVersion: number) => void
}
```

**Layout:**
```
┌───────────────────────────────────┐
│ v5 — devops-agent                 │
│ sha256:e7f2a1... [📋]            │
│ Uploaded 15m ago by admin         │
│                                   │
│ Deployed to:                      │
│ ● development (15m ago)           │
│                                   │
│ [Deploy to...  ▸]                 │
│                                   │
│ Changes from v4:                  │
│ +1 added, ~1 modified             │
│ [View full diff →]                │
│                                   │
│ ┌ YAML ─────────────────────────┐ │
│ │ apiVersion: edictum/v1        │ │
│ │ ...                           │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

**Sections:**

1. **Header**
   - Version: `text-lg font-semibold`
   - Bundle name from parsed YAML: `text-muted-foreground` (this may change per version)
   - Revision hash: `font-mono text-xs` truncated to 12 chars + Copy button via `Tooltip`
     - Copy: `navigator.clipboard.writeText(bundle.revision_hash)` + `toast.success("Hash copied")`
   - Uploaded by: follow `bundle-header.tsx` pattern — if contains `@` show email prefix, else truncated UUID
   - Timestamp: `formatRelativeTime(bundle.created_at)` with `Tooltip` showing full date

2. **Deployment status**
   - List each env this version is deployed to: `EnvBadge` + `formatRelativeTime(deployment.created_at)`
   - If not deployed anywhere: "Not deployed to any environment" in `text-muted-foreground`
   - Note: `bundle.deployed_envs` tells us WHERE, but not WHEN. For "when", we'd need `listDeployments()`. For v1, just show the env badges without "when" timestamps. Add a TODO comment for enriching with deployment timestamps later.

3. **Deploy action**
   - `DeployDialog` component with trigger `Button variant="outline" size="sm"` labeled "Deploy to..."

4. **Change summary vs previous version**
   - If `bundle.version > 1`: fetch previous version YAML, parse both, call `diffContracts(oldBundle, newBundle)`
   - Show: "+N added, -N removed, ~N modified, N unchanged"
   - Link: "View full diff →" using `Button variant="link"` → calls `onNavigateDiff(prevVersion, thisVersion)` which navigates to `?tab=diff&from={prev}&to={this}`
   - If version 1: "First version — no previous to compare"
   - **Loading state**: Show `Loader2` while computing diff (YAML fetch + parse + diff is async)
   - **Error state**: If previous version YAML fails to load, show "Could not compute changes" in `text-muted-foreground`

5. **YAML preview**
   - `ScrollArea` with `<pre>` — reuse the same YAML syntax highlighting approach from `yaml-sheet.tsx`
   - Limit preview height: `max-h-[400px]`
   - If yamlContent is empty or parse failed: show error message

**File size target:** ~140-180 lines

### 4. `pages/contracts/versions-tab.tsx`

**Props:**
```typescript
interface VersionsTabProps {
  bundles: BundleWithDeployments[]
  onRefresh: () => void
  onNavigateDiff: (fromVersion: number, toVersion: number) => void
}
```

**Layout:** Two-panel flex layout following Events Feed pattern (not ResizablePanelGroup):
```
┌──────────────────────────┬────────────────────────────┐
│ Version list (left)      │ Version detail (right)     │
│ scrollable, fixed width  │ scrollable, flex-1         │
└──────────────────────────┴────────────────────────────┘
```

**Left panel (version list):**
- Width: `w-[280px] shrink-0`
- Header: "Versions" + version count + `UploadSheet` trigger
- `ScrollArea` with version rows

Each version row:
```tsx
<button
  onClick={() => setSelectedVersion(b.version)}
  className={cn(
    "w-full text-left px-3 py-2.5 border-b border-border transition-colors",
    "hover:bg-muted/50",
    selectedVersion === b.version && "bg-muted/30 border-l-2 border-l-amber-500",
  )}
>
  <div className="flex items-center justify-between">
    <span className="font-mono text-sm font-medium">v{b.version}</span>
    <span className="text-[11px] text-muted-foreground">{formatRelativeTime(b.created_at)}</span>
  </div>
  <div className="mt-1 flex items-center gap-1.5">
    {b.deployed_envs.length > 0
      ? b.deployed_envs.map(env => <EnvBadge key={env} env={env} />)
      : <span className="text-[11px] text-muted-foreground opacity-60">no deployments</span>
    }
  </div>
  <div className="mt-1 text-[11px] text-muted-foreground">
    {b.uploaded_by.includes("@") ? b.uploaded_by.split("@")[0] : b.uploaded_by.slice(0, 8)}
  </div>
</button>
```

- **Currently deployed versions:** visually prominent (env badges shown)
- **Versions with no deployments:** `opacity-60` on the "no deployments" text
- **Selected:** `bg-muted/30` + amber left border (matches Events selected pattern)
- **Hover:** `hover:bg-muted/50`

**Right panel (version detail):**
- `flex-1 overflow-y-auto`
- Shows `VersionDetail` for the selected version
- Loads YAML on selection change:
  ```typescript
  useEffect(() => {
    if (!selectedVersion) return
    setDetailLoading(true)
    getBundleYaml(selectedVersion)
      .then(yaml => {
        setDetailYaml(yaml)
        try {
          setDetailParsed(parseContractBundle(yaml))
          setDetailError(null)
        } catch (e) {
          setDetailParsed(null)
          setDetailError(e instanceof Error ? e.message : "Parse error")
        }
      })
      .catch(() => setDetailError("Failed to load YAML"))
      .finally(() => setDetailLoading(false))
  }, [selectedVersion])
  ```

**Default selection:** Latest version (first in the list, since `listBundles()` returns newest first).

**Upload callback:**
```typescript
const handleUploaded = (newVersion: number) => {
  onRefresh()  // refresh the bundle list
  setSelectedVersion(newVersion)  // auto-select the new version
}
```

**States:**

**Loading (whole tab):** If `bundles.length === 0` and still loading from parent → `Loader2` centered.

**Empty (no versions):**
```
No versions uploaded yet.
Upload your first contract bundle to define
governance rules for your agents.

[Upload Bundle]
```

**Detail loading:** `Loader2` in the right panel while YAML is loading.

**Detail error:** Error message + retry in the right panel.

**No selection:** "Select a version to view details" centered in right panel (only shows if somehow nothing is selected — normally auto-selects latest).

**File size target:** ~130-160 lines

---

## Wire into Page Shell

Update `pages/contracts.tsx`:

1. **Enable Upload button:** Replace the disabled `<Button>Upload</Button>` with `<UploadSheet onUploaded={handleUploadCallback} />`. The UploadSheet renders its own trigger button.

2. **Handle upload callback:**
```typescript
const handleUploaded = (newVersion: number) => {
  void refresh()
  setSelectedVersion(newVersion)
}
```

3. **Replace Versions tab placeholder:**
```tsx
<TabsContent value="versions" className="mt-4">
  <VersionsTab
    bundles={bundles}
    onRefresh={refresh}
    onNavigateDiff={(from, to) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set("tab", "diff")
        next.set("from", String(from))
        next.set("to", String(to))
        return next
      })
    }}
  />
</TabsContent>
```

4. **Import new components:**
```typescript
import { VersionsTab } from "./contracts/versions-tab"
import { UploadSheet } from "./contracts/upload-sheet"
```

---

## Color Rules (Mandatory)

Every colored element must use the dual light/dark pattern:

| Element | Colors |
|---------|--------|
| Mode enforce | `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30` |
| Mode observe | `bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30` |
| Deploy button | `bg-amber-600 hover:bg-amber-700 text-white` (solid, not badge) |
| Valid badge | `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30` |
| Invalid badge | Use shadcn `Badge variant="destructive"` |
| Env badges | Use `EnvBadge` from `@/lib/env-colors` (already correct) |
| Selected row border | `border-l-amber-500` |
| Drag-drop highlight | `ring-2 ring-amber-500/50` |

---

## YAML Syntax Highlighting

Reuse the exact same approach from `yaml-sheet.tsx`. If the highlighting logic is inline in that file, extract it to a shared utility first:

```typescript
// pages/contracts/yaml-highlight.ts (or inline if small)
export function highlightYaml(yamlString: string): React.ReactNode[]
```

Both `yaml-sheet.tsx` and `version-detail.tsx` should use the same function. Don't duplicate the regex patterns.

---

## Test Checklist

1. Start the server: `docker compose up`
2. Navigate to `/dashboard/contracts?tab=versions`

**Upload flow:**
- [ ] Click "Upload" → sheet slides in from right
- [ ] Paste valid YAML → validation shows "✓ Valid, N contracts"
- [ ] Paste invalid YAML (remove apiVersion) → shows "✗ Invalid" + error
- [ ] Empty textarea → upload button disabled
- [ ] Click "Load starter template" → textarea populated with example
- [ ] Drag a .yaml file onto the sheet → textarea populated
- [ ] Click "Upload Bundle" → toast "Version vN uploaded"
- [ ] Sheet closes, new version appears in list, auto-selected
- [ ] Upload duplicate (same YAML content) → 422 error shown inline
- [ ] Try uploading garbage text → 422 from server shown

**Version list:**
- [ ] All versions listed, newest first
- [ ] Deployed versions show env badges
- [ ] Non-deployed versions show "no deployments" dimmed
- [ ] Click version → right panel shows detail
- [ ] Hover on rows → subtle background change

**Version detail:**
- [ ] Shows version number, bundle name, hash (truncated + copy), uploaded by, timestamp
- [ ] Env deploy status shown with EnvBadge
- [ ] "Deploy to..." button opens dialog
- [ ] Change summary shows "+N added, ~N modified" vs previous version
- [ ] "View full diff →" navigates to `?tab=diff&from=X&to=Y`
- [ ] YAML preview with syntax highlighting
- [ ] First version shows "First version" instead of change summary

**Deploy flow:**
- [ ] Select environment from dropdown
- [ ] Shows currently deployed version for that env
- [ ] Deploy button says "Deploy vN"
- [ ] Already deployed to selected env → deploy button disabled
- [ ] Click deploy → toast "vN deployed to {env}"
- [ ] Dialog closes, env badges update on the version row
- [ ] SSE fires `contract_update` → version list refreshes, env badges update

**Both themes:**
- [ ] Dark: all badges, text, borders readable
- [ ] Light: all badges, text, borders readable
- [ ] No bare `text-*-400` without `text-*-600 dark:text-*-400` pair

**Responsive:**
- [ ] At 1200px+ width: two panels side by side
- [ ] At narrow widths: acceptable degradation (scroll, no overlap)

**Audit checklist:**
- [ ] All files under 200 lines
- [ ] No raw `<button>`, `<input>`, `<select>` — all shadcn
- [ ] No duplicated types (uses `DeploymentResponse` from api, not a new type)
- [ ] No duplicated utilities (uses `formatRelativeTime`, `truncate`, `EnvBadge`)
- [ ] Hover states on all interactive elements
- [ ] Loading states for version list, detail panel, upload, deploy
- [ ] Error states with actionable messages
- [ ] Empty state guides user to upload
- [ ] Keyboard: Enter/Space on version rows (they're buttons), Tab through upload form
- [ ] No `any` types
