# P3: Tab 1 — Contracts ("What are my rules?")

> **Scope:** bundle-header, contract-row, contract-detail, contract-summary, contracts-tab, yaml-sheet, search
> **Depends on:** P2 (page shell, types, yaml-parser, API client)
> **Deliverable:** Full Tab 1 working against real data from the API
> **Time budget:** Single session

---

## Required Reading

1. `contracts_spec.md` §3 (Tab 1), §1.6 (shared modules), §1.8 (light/dark), §3.10 (test data)
2. `~/project/edictum/docs/contracts/yaml-reference.md` — Full YAML schema (needed for contract-summary renderer)
3. `PROMPT-FRONTEND-AUDIT.md` — This tab must pass items 1-5

## Shared Modules — MUST Import (Do NOT Reimplement)

| Need | Import from |
|------|-------------|
| Environment badges | `EnvBadge` from `@/lib/env-colors` |
| Relative timestamps | `formatRelativeTime` from `@/lib/format` |
| String truncation | `truncate` from `@/lib/format` |
| SSE | Already wired in page shell from P2 |

---

## Files to Create (6 files)

### 1. `pages/contracts/bundle-header.tsx`

**Props:** `bundles`, `selectedVersion`, `onVersionChange`, `parsedBundle`

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ devops-agent  [v5 ▾]  default: enforce               │
│ observe alongside: on                                │
│ 11 tools classified (3 irreversible, 4 read, ...)    │
│          production: v3  staging: v4  development: v5 │
└──────────────────────────────────────────────────────┘
```

**Components:**
- Outer: `Card` + `CardContent`
- Bundle name: `font-mono font-semibold`
- Version selector: shadcn `Select` with all version numbers. On change → `onVersionChange(version)`
- Default mode badge: `Badge variant="outline"` — enforce: `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30`, observe: amber
- Observe alongside: `Badge variant="outline"` with `bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30` — only shown when `parsedBundle.observe_alongside === true`
- Tool classifications: when `parsedBundle.tools` exists, show summary line in `text-muted-foreground text-xs`. Count by `side_effect` value. Wrap in `Collapsible` — click to expand full tool→side_effect mapping
- Env badges: `EnvBadge` from `@/lib/env-colors`. For each known env (production, staging, development), show badge. If this version is NOT deployed there → add `opacity-40` class

**File size target:** ~80-100 lines

### 2. `pages/contracts/contract-summary.tsx`

**Export:** `function renderContractSummary(contract: ParsedContract): string`

This is a pure function (no JSX), returns a human-readable string.

**By type:**

- **Pre:** `"Denies {tool} when {when_readable}"` (or "Allows", "Warns on" based on effect)
- **Post:** `"Warns on {tool} when {when_readable}"` / `"Redacts {tool} output when {when_readable}"`
- **Session:** `"Max {max_tool_calls} tool calls, {max_attempts} attempts"` + per-tool limits if present
- **Sandbox:** `"Restricts {tools} to {within_list}"` + `", excluding {not_within_list}"` if present. For `allows.commands`: `"Allows commands: {first 5}..."`. For `allows.domains`: `"Allows domains: {list}"`.

**When clause rendering (recursive):**

```typescript
function renderExpression(expr: Expression): string {
  if ("all" in expr) return expr.all.map(renderExpression).map(s => `(${s})`).join(" AND ")
  if ("any" in expr) return expr.any.map(renderExpression).map(s => `(${s})`).join(" OR ")
  if ("not" in expr) return `NOT (${renderExpression(expr.not)})`
  // Leaf: first key is selector, value is operator→operand map
  // "args.path": { "contains_any": [".env", ".secret"] }
  // → "args.path contains .env, .secret"
}
```

**Operator rendering:**
- `contains` → "contains {value}"
- `contains_any` → "contains {comma-separated values}"
- `matches` / `matches_any` → "matches {value}" (truncate long regex patterns)
- `equals` → "equals {value}"
- `not_in` → "not in [{values}]"
- `exists: false` → "is not set"
- `exists: true` → "is set"
- `gt` → "> {value}", `gte` → ">= {value}", `lt` → "< {value}", `lte` → "<= {value}"

**Test with governance-v5:** Make sure it handles:
- Regex patterns in `matches` (truncate to ~50 chars)
- `any` with nested leaves (deny-destructive's `any` list)
- Sandbox with `within`/`not_within` lists
- Sandbox with `allows.commands` (83 commands — truncate to first 5 + "...N more")
- Sandbox with `allows.domains` + `not_allows.domains`
- Simple `{ exists: true }` catch-all

**File size target:** ~100-130 lines

### 3. `pages/contracts/contract-row.tsx`

**Props:** `contract: ParsedContract`, `coverage: ContractCoverage | null`, `defaultMode: Mode`

**Layout (collapsed):**
```
▸ block-sensitive-reads   read_file  enforce deny  secrets dlp  142 events ●
```

**Components:**
- Outer: `Collapsible`
- Trigger row: `CollapsibleTrigger` wrapping a flex row
  - Chevron icon (rotates on expand): `ChevronRight` from lucide, `transition-transform` + `data-[state=open]:rotate-90`
  - Contract ID: `font-mono text-sm`
  - Tool: `<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">`
  - Mode badge: `Badge variant="outline"` — use contract's `mode` if set, otherwise `defaultMode` from bundle
  - Effect badge: `Badge variant="outline"` — color per effect (see §3.5 color table in spec)
  - Tags: `Badge variant="secondary" className="text-[10px]"` for each tag
  - Coverage: event count + dot indicator
    - Fired (count > 0): `bg-emerald-500` dot + "{N} events"
    - Never triggered: `bg-zinc-300 dark:bg-zinc-600` dot + "0 events"
- Content: `CollapsibleContent` → renders `<ContractDetail />`

**Hover:** `hover:bg-muted/50` on the trigger row
**Keyboard:** Collapsible handles Enter/Space via Radix

**File size target:** ~70-90 lines

### 4. `pages/contracts/contract-detail.tsx`

**Props:** `contract: ParsedContract`, `coverage: ContractCoverage | null`

Rendered inside `CollapsibleContent`. Five sections:

1. **Summary:** Call `renderContractSummary(contract)` — display in `text-sm text-muted-foreground`
2. **Message:** `contract.then?.message` displayed in `font-mono text-sm bg-muted rounded p-2`
3. **When/boundaries:** For pre/post → render the when expression tree. For sandbox → show within/not_within/allows. For session → show limits. Use a simple recursive tree with indentation.
4. **YAML snippet:** This contract's YAML only, in a `Collapsible` with "Show YAML" trigger. Use `<pre className="text-xs bg-muted rounded p-3 overflow-x-auto">`. Generate YAML from the parsed contract using `yaml.dump()` from js-yaml.
5. **Coverage link:** If coverage exists → "N denials in last 24h" as a link. Use React Router `Link` to `/dashboard/events?decision_name={contract.id}`. If no coverage → "No events recorded"

**File size target:** ~100-130 lines

### 5. `pages/contracts/contracts-tab.tsx`

**Props:** `bundles`, `coverage`, `parsedBundle`, `yamlContent`, `selectedVersion`, `onVersionChange`, `onRefresh`

**Layout:**
1. Bundle header (if bundles exist)
2. Search input
3. Type count summary bar
4. Accordion sections by type

**Search:** `Input` with search icon from `InputGroup`. Filters contracts by:
- Contract ID (case-insensitive includes)
- Tool name
- Tag values
- Summary text (from `renderContractSummary`)

Client-side filter — `useMemo` that depends on search query + contracts.

**Type grouping:**
```typescript
const grouped = {
  pre: contracts.filter(c => c.type === "pre"),
  post: contracts.filter(c => c.type === "post"),
  session: contracts.filter(c => c.type === "session"),
  sandbox: contracts.filter(c => c.type === "sandbox"),
}
```

**Accordion:** shadcn `Accordion type="multiple"` — multiple sections can be open simultaneously.

Each section:
```tsx
<AccordionItem value="pre">
  <AccordionTrigger>
    Preconditions <Badge variant="outline">{grouped.pre.length}</Badge>
  </AccordionTrigger>
  <AccordionContent>
    {grouped.pre.map(contract => (
      <ContractRow key={contract.id} contract={contract} coverage={...} defaultMode={...} />
    ))}
  </AccordionContent>
</AccordionItem>
```

Type badge colors (§1.8): pre=amber, post=emerald, session=blue, sandbox=orange. Apply to the count badge.

Hide empty type groups entirely.

**Summary bar:** Show counts for each non-empty type. E.g., "4 Precondition  1 Postcondition  1 Session  2 Sandbox"

**Empty state:** When no bundles exist → empty state card (see §3.9).

**File size target:** ~120-150 lines

### 6. `pages/contracts/yaml-sheet.tsx`

**Props:** `bundleName: string`, `version: number`, `yamlContent: string`

**Trigger:** `Button variant="outline"` labeled "View YAML"

**Sheet:** shadcn `Sheet side="right"`, width ~50% viewport (`className="w-[50vw] sm:max-w-[50vw]"`)

**Contents:**
- `SheetHeader`: "{bundleName} v{version}" + Copy button
- `ScrollArea` with YAML content in `<pre>`
- Copy: `navigator.clipboard.writeText(yamlContent)` + `toast.success("Copied to clipboard")`

**Syntax highlighting:** Hand-rolled regex-based tokenizer. Split YAML into lines, apply spans:
- Keys (`word:` at start of significant content): `text-blue-600 dark:text-blue-400`
- String values (quoted): `text-emerald-600 dark:text-emerald-400`
- Comments (`# ...`): `text-muted-foreground`
- Everything else: `text-foreground`

Keep this simple. A basic regex like `/^(\s*)([\w.-]+)(:)/` for keys, `/"[^"]*"|'[^']*'/` for strings, `/\s#.*/` for comments. Don't over-engineer — YAML highlighting doesn't need to be perfect.

**File size target:** ~80-100 lines

---

## Wire into Page Shell

Update `pages/contracts.tsx` from P2:
- Import `ContractsTab` from `./contracts/contracts-tab`
- Import `YamlSheet` from `./contracts/yaml-sheet`
- Add state for `selectedVersion` and `parsedBundle`/`yamlContent`
- Load YAML when version changes:
  ```typescript
  useEffect(() => {
    if (!selectedVersion) return
    getBundleYaml(selectedVersion).then(yaml => {
      setYamlContent(yaml)
      setParsedBundle(parseContractBundle(yaml))
    }).catch(() => setError("Failed to load bundle YAML"))
  }, [selectedVersion])
  ```
- Default selected version: latest bundle, or production-deployed if exists
- Replace the contracts tab placeholder with `<ContractsTab />`
- Add "View YAML" and "Upload" buttons to the header (Upload is a placeholder button for now — implemented in P4)

---

## Test with Real Data

1. Start the server: `docker compose up`
2. Upload the devops-agent template via curl or the existing upload UI
3. Upload the governance-v5 bundle as a second version
4. Navigate to `/dashboard/contracts`
5. Verify:

**With devops-agent (6 contracts):**
- [ ] Bundle header shows name, version, enforce badge
- [ ] 4 Preconditions section with contracts
- [ ] 1 Postconditions section
- [ ] 1 Sessions section
- [ ] 0 Sandboxes (hidden)
- [ ] Expand block-sensitive-reads → summary "Denies read_file when args.path contains .env, .secret, kubeconfig, credentials, .pem, id_rsa"
- [ ] Tags visible: secrets, dlp
- [ ] YAML snippet shows individual contract YAML

**With governance-v5 (11 contracts):**
- [ ] 6 Preconditions (3 enforce + 3 observe)
- [ ] 0 Postconditions (hidden)
- [ ] 0 Sessions (hidden)
- [ ] 3 Sandboxes
- [ ] Observe-mode contracts show amber mode badge
- [ ] approve-mcp shows blue "approve" effect badge
- [ ] exec-sandbox: expanded detail shows long command list without overflow
- [ ] web-sandbox: shows domains in allows/not_allows
- [ ] Tool classifications line visible in header ("11 tools classified...")
- [ ] Search: type "exec" → filters to deny-destructive, deny-shells, deny-exec-metadata, exec-sandbox
- [ ] Search: type "sandbox" → shows only sandbox contracts

**Both themes:**
- [ ] Dark mode: all badges readable, no invisible text
- [ ] Light mode: all badges readable, no washed-out text
- [ ] `text-*-600 dark:text-*-400` pattern verified on every colored element

**YAML Sheet:**
- [ ] Click "View YAML" → sheet slides in from right
- [ ] YAML is syntax-highlighted (keys blue, strings green, comments dim)
- [ ] Copy button works → toast "Copied to clipboard"
- [ ] Close sheet → returns to contracts view

**Coverage indicators:**
- [ ] If stats endpoint returns data, coverage dots and counts appear
- [ ] If no coverage data, all contracts show "0 events" with empty dot

**Audit checklist items:**
- [ ] All files under 200 lines
- [ ] No raw `<button>`, `<input>`, `<select>` — all shadcn
- [ ] No duplicated utility functions
- [ ] No `any` types
- [ ] Hover states on interactive rows
- [ ] Keyboard navigation works (Enter/Space on collapsible triggers)
