# Prompt: Continue Contracts View Implementation

> Previous session built Tab 1 (Contracts) with real API integration.
> This session: finish remaining tabs, polish, and test.

## Required Reading

1. `CONTEXT.md` — What edictum is, contract types, workflows
2. `CLAUDE.md` — Architecture, coding standards
3. `dashboard/src/pages/contracts.tsx` — Current implementation
4. `dashboard/src/components/contracts/` — All contract components
5. `scripts/seed_demo_bundle.py` — Seed script for demo data

## What's Built

### Tab 1: Contracts ✅
- Bundle header with version selector, env badges
- Type overview pills (4 Precondition, 1 Postcondition, etc.)
- Accordion sections by type (shadcn Accordion)
- Collapsible contract rows with expand for details
- YAML viewer (Sheet slide-out)
- Upload flow (Sheet with textarea + drag-drop)
- Deploy dialog (environment picker)
- Empty state when no bundles
- Fetches from real API (`GET /api/v1/bundles`, `GET /api/v1/bundles/{version}/yaml`)

### Tabs 2-4: Placeholders only
- Versions tab — placeholder
- Diff tab — placeholder
- Playground tab — placeholder

## What Needs Building

### Tab 2: Versions
**Purpose:** Version history + deployment status

**Components needed:**
- Version table (shadcn Table) with columns: version, hash, uploaded by, timestamp, env badges
- Row click → Sheet with full YAML + deploy action
- Sort by version (newest first)
- Environment badges on each row showing where deployed

**Data:** Already have `bundles` array from `listBundles()` — just need to render it

### Tab 3: Diff
**Purpose:** Compare two versions side-by-side

**Components needed:**
- Two version selectors (shadcn Select)
- Diff view toggle (side-by-side / unified)
- Diff content area with red/green highlighting
- Contract-level summary: "+2 added, -0 removed, ~1 modified"

**Implementation:**
- Fetch YAML for both versions via `getBundleYaml()`
- Use a diff library (e.g., `diff` npm package) for line-by-line comparison
- Client-side diff — no backend endpoint needed

### Tab 4: Playground
**Purpose:** Test contracts against sample tool calls

**Components needed:**
- YAML input (Textarea) — paste or load from existing version
- Tool call builder: tool name (Input) + args (Textarea for JSON)
- Run button
- Results display: which contracts fired, verdict, messages

**Note:** This is static/demo for now — no backend dry-run endpoint exists. Show a simulated result based on the YAML.

## API Endpoints Available

```
GET  /api/v1/bundles                  → List all versions with deployed_envs[]
GET  /api/v1/bundles/{version}        → Get version metadata
GET  /api/v1/bundles/{version}/yaml   → Get raw YAML content
POST /api/v1/bundles                  → Upload new bundle
POST /api/v1/bundles/{version}/deploy → Deploy to environment
```

## shadcn Components Installed

```
accordion, alert-dialog, badge, button, card, collapsible, dialog,
dropdown-menu, input, label, popover, scroll-area, select, separator,
sheet, sonner, switch, table, tabs, textarea, tooltip
```

## Design Language

Follow the pattern established in `approvals-queue.tsx`:
- Header: Icon + Title + Subtitle with count
- `TabsList variant="line"` for line-style tabs
- `space-y-6 p-6` for page padding
- Empty states: Icon + Title + Description centered

## File Structure

```
dashboard/src/
├── pages/
│   └── contracts.tsx           # Main page with tabs
├── components/contracts/
│   ├── types.ts                # Types + color mappings
│   ├── parse-bundle.ts         # YAML parsing
│   ├── bundle-header.tsx       # Card with version selector
│   ├── contract-row.tsx        # Collapsible row
│   ├── type-section.tsx        # Accordion for type groups
│   ├── yaml-sheet.tsx          # YAML viewer sheet
│   ├── upload-sheet.tsx        # Upload flow
│   ├── deploy-dialog.tsx       # Deploy confirmation
│   └── index.ts                # Barrel export
```

## Testing

1. Start stack: `docker compose up -d`
2. Seed data: `python scripts/seed_demo_bundle.py`
3. Run frontend: `cd dashboard && pnpm dev`
4. Visit: `http://localhost:5173/dashboard/contracts`

## Rules

- pnpm always
- shadcn components for all UI — no custom primitives
- Components < 200 lines
- TypeScript strict mode, no `any`
- Dark theme default

## Order of Work

1. **Tab 2: Versions** — straightforward table, reuses existing data
2. **Tab 3: Diff** — needs diff library, more complex
3. **Tab 4: Playground** — static/demo initially
4. **Polish** — loading states, error handling, SSE updates
5. **Test** — multiple bundles, empty states, edge cases
