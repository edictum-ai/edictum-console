# P9: Tenant Switcher in Sidebar + Create Team Dialog

> **Scope:** Team switcher dropdown in sidebar, create new team dialog
> **Depends on:** P7 (auth context with tenants list), P8 (slug-based routes)
> **Blocks:** Nothing (independent feature)
> **Deliverable:** Sidebar shows current team with dropdown to switch, "Create New Team" option with dialog

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Frontend Changes > Tenant Switcher" section
2. `CLAUDE.md` — shadcn mandate, dual-theme colors, component library rules
3. `dashboard/src/components/sidebar.tsx` — Current sidebar structure
4. `dashboard/src/hooks/use-auth.ts` — (from P7) useAuth with tenants array
5. `dashboard/src/lib/api/teams.ts` — (from P7) `createTenant()`, `switchTenant()`

---

## Shared Modules

| Module | What to use |
|--------|------------|
| `hooks/use-auth.ts` | `useAuth()` for tenants list and activeTenant |
| `hooks/use-team-path.ts` | `useTeamPath()` for navigation (from P8) |
| `lib/api/teams.ts` | `createTenant()` API call |
| `components/ui/dropdown-menu` | shadcn DropdownMenu (keyboard accessible) |
| `components/ui/dialog` | shadcn Dialog for "Create Team" form |
| `components/ui/input` | shadcn Input for team name |
| `components/ui/button` | shadcn Button |

---

## Files to Create/Modify

### `dashboard/src/components/sidebar.tsx` (modify)

Add team switcher section between brand header and navigation:

```tsx
// After the brand header (Edictum shield + name), before nav sections:
<TeamSwitcher
  activeTenant={activeTenant}
  tenants={tenants}
  collapsed={collapsed}
/>
```

The sidebar already has `collapsed` state. The switcher must handle both collapsed and expanded states.

### `dashboard/src/components/team-switcher.tsx` (new, <120 lines)

```tsx
interface TeamSwitcherProps {
  activeTenant: TenantInfo;
  tenants: TenantInfo[];
  collapsed: boolean;
}
```

**Expanded state:**
- Shows current team name (truncated if long) with a chevron icon
- Click opens shadcn `DropdownMenu` listing all teams
- Each team shows: name + role badge
- Active team has a check icon
- Separator at bottom
- "Create New Team" option with Plus icon

**Collapsed state:**
- Shows first letter of team name in a circle
- Tooltip with full team name
- Click opens same dropdown

**Switching team:**
```tsx
const navigate = useNavigate();
// Navigate to the new team's slug → TeamGuard detects change → switchTenant() + reload
navigate(`/dashboard/team/${selectedTenant.slug}`);
```

Full page reload happens in TeamGuard when it detects the slug doesn't match activeTenant.

### `dashboard/src/components/create-team-dialog.tsx` (new, <100 lines)

shadcn Dialog with:
- Team name input (shadcn `Input`, min 2 chars, max 100)
- "Create Team" button (shadcn `Button`)
- Loading state on submit
- Error display (Alert)
- On success: navigate to `/dashboard/team/{new-slug}`

```tsx
interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Role badge in team list** (inline, reuse the color patterns from spec):

| Role | Badge classes |
|------|--------------|
| owner | `text-amber-600 dark:text-amber-400 bg-amber-500/15` |
| admin | `text-blue-600 dark:text-blue-400 bg-blue-500/15` |
| member | `text-slate-600 dark:text-slate-400 bg-slate-500/15` |
| viewer | `text-gray-600 dark:text-gray-400 bg-gray-500/15` |

---

## Wiring Instructions

1. `TeamSwitcher` is rendered inside `Sidebar`. Pass `activeTenant` and `tenants` from auth context.
2. The dropdown items navigate to the new slug URL — TeamGuard handles the actual tenant switch.
3. "Create New Team" opens the dialog. After creation, `createTenant()` returns the new TenantInfo with slug → navigate there.
4. If user only has one team, still show the switcher (so they can create a new team) but without a dropdown — just a static name with a "+" button.

---

## Verification Checklist

### Functional
- [ ] Tenant switcher shows current team name in expanded sidebar
- [ ] Tenant switcher shows team initial in collapsed sidebar
- [ ] Dropdown lists all teams with role badges
- [ ] Active team has check icon
- [ ] Clicking another team navigates + page reloads with new tenant context
- [ ] "Create New Team" opens dialog
- [ ] Creating a team navigates to new team's dashboard
- [ ] Creating a team with duplicate name shows error
- [ ] Single-tenant users see team name with "+" button (no dropdown needed unless they have 1 team)
- [ ] Keyboard: dropdown navigable with arrow keys, Enter to select, Escape to close

### Code Quality
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] All files under 200 lines
- [ ] Uses shadcn DropdownMenu, Dialog, Input, Button — no raw HTML
- [ ] Role badge uses shadcn Badge component

### Both Themes
- [ ] Team name readable in dark mode
- [ ] Team name readable in light mode
- [ ] Role badges use dual-theme pattern: `text-*-600 dark:text-*-400`
- [ ] Dropdown menu looks correct in both themes
- [ ] Create team dialog looks correct in both themes
- [ ] Active team indicator visible in both themes
