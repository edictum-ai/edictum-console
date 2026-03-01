# P5: Contracts Page Improvements

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group E (items E1-E3)
> **Depends on:** P1 (shared modules), P4 (empty states for contracts tab)
> **Deliverable:** Contract tabs disabled when empty, upload sheet improved with drag-drop + AlertDialog, parallel evaluation
> **Files touched:** ~5 files

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — shadcn mandate (AlertDialog, Tabs, Sheet, Button), file size limits
2. `dashboard/src/pages/contracts.tsx` — tab structure, bundle state
3. `dashboard/src/pages/contracts/upload-sheet.tsx` — current upload UX
4. `dashboard/src/pages/contracts/diff-impact.tsx` — sequential evaluation loop
5. `dashboard/src/pages/contracts/evaluate-replay.tsx` — sequential evaluation loop
6. `dashboard/src/components/ui/tabs.tsx` — verify `disabled` prop support on TabsTrigger
7. `dashboard/src/components/ui/alert-dialog.tsx` — verify it's installed

## Shared Modules Reference

| Import | From |
|--------|------|
| `Tabs, TabsList, TabsTrigger, TabsContent` | `@/components/ui/tabs` |
| `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger` | `@/components/ui/alert-dialog` |
| `Button` | `@/components/ui/button` |
| `Sheet, SheetContent, SheetHeader, SheetTitle` | `@/components/ui/sheet` |
| `toast` | `sonner` |

---

## Tasks

### E1: Disable sub-tabs when no bundles exist

**File:** `dashboard/src/pages/contracts.tsx`

When `summaries.length === 0`, disable Versions, Diff, and Evaluate tabs:

```tsx
<TabsTrigger value="versions" disabled={summaries.length === 0}>
  <History className="mr-1.5 h-3.5 w-3.5" />
  Versions
</TabsTrigger>
<TabsTrigger value="diff" disabled={summaries.length === 0}>
  <GitCompare className="mr-1.5 h-3.5 w-3.5" />
  Diff
</TabsTrigger>
<TabsTrigger value="evaluate" disabled={summaries.length === 0}>
  <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
  Evaluate
</TabsTrigger>
```

shadcn Tabs already supports `disabled` on TabsTrigger. The disabled state will gray out the tab and prevent clicking.

**Note:** After P4-D2, the contracts empty state (`EmptyState` with "No contract bundles yet" copy) already exists on the Contracts tab. E1 adds tab disabling on top of that — they work together.

Also: if the user is on a disabled tab when bundles are deleted (edge case), auto-switch to the "contracts" tab:
```typescript
useEffect(() => {
  if (summaries.length === 0 && activeTab !== "contracts") {
    setTab("contracts")
  }
}, [summaries.length, activeTab, setTab])
```

### E2: Improve Upload Sheet

**File:** `dashboard/src/pages/contracts/upload-sheet.tsx`

Four changes in one:

#### 1. Replace native `confirm()` with shadcn `AlertDialog`

When the user selects a template and there's existing content in the textarea, show an AlertDialog:

```tsx
const [confirmReplace, setConfirmReplace] = useState(false)
const [pendingTemplate, setPendingTemplate] = useState<string | null>(null)

function handleTemplateSelect(templateKey: string) {
  if (yamlContent.trim()) {
    setPendingTemplate(templateKey)
    setConfirmReplace(true)
  } else {
    applyTemplate(templateKey)
  }
}

// In JSX:
<AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Replace current content?</AlertDialogTitle>
      <AlertDialogDescription>
        Loading a template will replace the YAML you've written. This can't be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setPendingTemplate(null)}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => {
        if (pendingTemplate) applyTemplate(pendingTemplate)
        setPendingTemplate(null)
      }}>
        Replace
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### 2. Add drag-and-drop file support

Add a drop zone at the top of the sheet content:

```tsx
const [isDragging, setIsDragging] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)

function handleFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (yamlContent.trim()) {
      // If there's existing content, confirm replacement
      setPendingTemplate(null) // clear any pending template
      // Store the file content for the confirm dialog
      setPendingFileContent(content)
      setConfirmReplace(true)
    } else {
      setYamlContent(content)
    }
  }
  reader.readAsText(file)
}

// Drop zone JSX:
<div
  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
    isDragging ? "border-primary bg-primary/5" : "border-border"
  }`}
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={(e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith(".yaml") || file.name.endsWith(".yml"))) {
      handleFile(file)
    } else {
      toast.error("Please drop a .yaml or .yml file")
    }
  }}
>
  <p className="text-sm text-muted-foreground">
    Drop a .yaml file here or{" "}
    <Button variant="link" className="px-0 h-auto" onClick={() => fileInputRef.current?.click()}>
      browse
    </Button>
  </p>
  <input
    ref={fileInputRef}
    type="file"
    accept=".yaml,.yml"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    }}
  />
</div>
```

#### 3. Fix margins/padding

Ensure consistent spacing in the sheet content. Use `space-y-4` on the main content container.

#### 4. Monospace font on textarea

Add `font-mono` class to the YAML textarea:
```tsx
<textarea className="... font-mono" />
```

### E3: Fix sequential evaluation loops

**Files:** `dashboard/src/pages/contracts/diff-impact.tsx` and `evaluate-replay.tsx`

Create a shared chunked parallel evaluation helper (can go in one of the files or in `lib/`):

```typescript
async function evaluateInChunks<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  chunkSize = 5,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await Promise.all(chunk.map(fn))
  }
}
```

Replace the sequential `for` loops in both files:

```typescript
// Before
for (const event of events) {
  await evaluateSingle(event)
}

// After
await evaluateInChunks(events, evaluateSingle, 5)
```

This processes 5 evaluations concurrently instead of 1, giving ~5x speedup without overwhelming the server.

---

## Verification Checklist

- [ ] When no bundles exist: Versions, Diff, and Evaluate tabs are grayed out and unclickable
- [ ] Clicking a disabled tab does nothing
- [ ] Upload Sheet: selecting a template when content exists shows AlertDialog (not native `confirm()`)
- [ ] Upload Sheet: dragging a .yaml file onto the drop zone populates the textarea
- [ ] Upload Sheet: dragging a non-yaml file shows an error toast
- [ ] Upload Sheet: "Browse" button opens file picker
- [ ] Upload Sheet: textarea has monospace font
- [ ] Upload Sheet: consistent spacing throughout
- [ ] Diff impact evaluation runs noticeably faster (check browser network tab — requests go in batches of 5)
- [ ] Replay evaluation runs noticeably faster
- [ ] `grep -r "window.confirm\|native.*confirm" dashboard/src/` → zero hits in contracts/
- [ ] `pnpm --dir dashboard build` completes without errors
- [ ] Check both dark and light mode
