# P12: Role-Gated UI Across All Existing Views

> **Scope:** Hide/show buttons and actions based on user's role across all existing pages
> **Depends on:** P7 (usePermissions hook), P8 (route structure)
> **Blocks:** Nothing (final polish prompt)
> **Deliverable:** All existing views respect role-based permissions — viewers see read-only UI, members can act, admins can manage

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Frontend Changes > Role-Based UI Gating" section
2. `CLAUDE.md` — shadcn mandate, coding standards
3. `dashboard/src/hooks/use-permissions.ts` — (from P7) `usePermissions()` hook
4. Read every page file to understand what actions exist:
   - `dashboard/src/pages/api-keys.tsx` + sub-components
   - `dashboard/src/pages/approvals/` (approval-card.tsx)
   - `dashboard/src/pages/settings.tsx` + sub-components
   - `dashboard/src/pages/events-feed.tsx` (read-only — no gating needed)
   - `dashboard/src/pages/dashboard-home.tsx` (read-only — no gating needed)
   - `dashboard/src/pages/contracts.tsx` + sub-components (if deploy button exists)

---

## Gating Rules

| Page | Element | Visible to | Hidden from |
|------|---------|-----------|-------------|
| **API Keys** | "Create Key" button | admin, owner | member, viewer |
| **API Keys** | "Revoke" action on each key | admin, owner | member, viewer |
| **API Keys** | Key list (read-only) | all roles | — |
| **Approvals** | "Approve" / "Deny" buttons | member, admin, owner | viewer |
| **Approvals** | Approval list (read-only) | all roles | — |
| **Contracts** | "Deploy" button | member, admin, owner | viewer |
| **Contracts** | "Upload" / contract editing | member, admin, owner | viewer |
| **Contracts** | Contract list (read-only) | all roles | — |
| **Settings** | "Team" tab | all roles (read-only for non-admin) | — |
| **Settings** | "Notifications" tab (CRUD) | admin, owner | member, viewer see read-only |
| **Settings** | "Danger Zone" tab | owner | admin, member, viewer |
| **Sidebar** | All nav items | all roles | — (all pages are viewable) |

---

## Files to Modify

### `dashboard/src/pages/api-keys.tsx` (modify)

```tsx
const { canManageKeys } = usePermissions();

// "Create API Key" button: render only if canManageKeys
{canManageKeys && <Button onClick={...}>Create API Key</Button>}

// In key table row actions: render "Revoke" only if canManageKeys
```

Check sub-components:
- `api-keys/create-key-dialog.tsx` — no change (dialog itself is fine, just don't show the trigger button)
- `api-keys/key-table.tsx` — pass `canManageKeys` prop, conditionally render revoke action
- `api-keys/revoke-key-dialog.tsx` — no change
- `api-keys/empty-state.tsx` — adjust message for viewers ("No API keys yet." without "Create one" CTA if !canManageKeys)

### `dashboard/src/pages/approvals/approval-card.tsx` (modify)

```tsx
const { canApprove } = usePermissions();

// Approve/Deny buttons: render only if canApprove
{canApprove && (
  <div className="flex gap-2">
    <Button onClick={handleApprove}>Approve</Button>
    <Button variant="destructive" onClick={handleDeny}>Deny</Button>
  </div>
)}
```

### `dashboard/src/pages/contracts.tsx` and sub-components (modify)

```tsx
const { canDeploy } = usePermissions();

// Deploy button: render only if canDeploy
// Upload/edit controls: render only if canDeploy
// Viewer sees contracts list and details read-only
```

### `dashboard/src/pages/settings.tsx` (modify)

```tsx
const { canManageTeam, role } = usePermissions();

// Danger Zone tab: only show for owner
{role === "owner" && <TabsTrigger value="danger">Danger Zone</TabsTrigger>}

// Notifications tab: show for all, but CRUD actions only for admin+
// Pass canManageTeam or similar prop to NotificationsSection

// If viewer navigates to ?section=danger via URL: redirect to ?section=system
```

### `dashboard/src/pages/settings/notifications-section.tsx` (modify)

```tsx
// If !canManageTeam: hide "Add Channel" button, hide edit/delete actions in channel table
// Show channels read-only for members/viewers
```

### `dashboard/src/pages/settings/danger-zone-section.tsx` (modify)

```tsx
// This component should only render for owner (parent gates it).
// But as defense-in-depth: check role inside and show warning if non-owner somehow reaches it.
```

---

## Wiring Instructions

1. Import `usePermissions()` at the top of each page/component that needs gating.
2. **Don't remove elements from the DOM in a way that shifts layout.** Use `visibility: hidden` or conditional rendering that maintains the layout structure.
3. **No tooltip on hidden buttons.** If a button is hidden, it's hidden. Don't show a disabled button with "You don't have permission" tooltip — that's unnecessary UX noise. Just hide it.
4. **Backend is the source of truth.** UI gating is a convenience, not a security boundary. The backend enforces roles via `require_role()`. If somehow a viewer sends a POST /keys request, the backend returns 403.
5. Test with different roles by creating test users with different membership roles and switching between them.

---

## Verification Checklist

### Functional (test each role)

**As Owner:**
- [ ] All buttons visible on all pages
- [ ] Danger Zone tab visible in Settings
- [ ] Can create/revoke API keys
- [ ] Can approve/deny approvals
- [ ] Can deploy contracts

**As Admin:**
- [ ] Create/revoke API keys: visible
- [ ] Approve/deny: visible
- [ ] Deploy: visible
- [ ] Danger Zone: hidden
- [ ] Team management: full access

**As Member:**
- [ ] Create/revoke API keys: hidden
- [ ] Approve/deny: visible
- [ ] Deploy: visible
- [ ] Danger Zone: hidden
- [ ] Team management: read-only
- [ ] Notification channels: read-only

**As Viewer:**
- [ ] Create/revoke API keys: hidden
- [ ] Approve/deny: hidden
- [ ] Deploy: hidden
- [ ] Danger Zone: hidden
- [ ] Team management: read-only
- [ ] All pages load and show data (read-only)
- [ ] No empty screens — viewer sees content, just can't act on it

### Code Quality
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] No new files created (only modifications)
- [ ] `usePermissions()` called correctly (not duplicated logic)
- [ ] No `any` types introduced

### Both Themes
- [ ] No visual regressions in dark mode
- [ ] No visual regressions in light mode
- [ ] Layout doesn't shift when buttons are hidden (compare owner view vs viewer view)
