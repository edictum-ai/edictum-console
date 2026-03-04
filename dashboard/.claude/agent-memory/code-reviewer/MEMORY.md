# Code Reviewer Memory

## Common Patterns to Check

### Duplicated Style Definitions
- `DRIFT_STYLES` is defined in BOTH `agent-table.tsx` and `agent-detail-header.tsx` with different shapes. Extract to shared module.
- `agent-grid.tsx` inlines verdict badge styles instead of using `VERDICT_STYLES` from `lib/verdict-helpers.tsx`.
- Watch for verdict color patterns being hand-rolled instead of using `verdictColor()`.

### Light/Dark Mode
- The correct pattern is `text-*-600 dark:text-*-400`. Using `text-*-500` alone (e.g. `text-red-500 dark:text-red-400`) is inconsistent and harder to read in light mode.
- All `-400` colors MUST be paired with `dark:` prefix.

### Raw HTML Elements
- Pre-existing raw `<button>` in `sidebar.tsx:112` (collapse toggle) and `event-list.tsx:316` (event row). These should use shadcn `<Button>` with appropriate variant.
- These are pre-existing issues but should be tracked.

### File Size Violations
- `event-list.tsx`: 382 lines (limit is 200, flag at 250)
- `sidebar.tsx`: 310 lines (has comment "Intentionally over 200 lines. Do not split.")
- `contracts-tab.tsx`: 231 lines
- `agent-grid.tsx`: 227 lines

### Backend Tenant Isolation
- All agent-related routes properly use `auth.tenant_id` from `require_dashboard_auth`
- All service functions receive and use `tenant_id` parameter
- All SQL queries filter by `tenant_id`
