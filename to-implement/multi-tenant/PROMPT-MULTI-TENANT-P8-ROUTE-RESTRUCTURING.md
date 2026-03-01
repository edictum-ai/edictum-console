# P8: Route Restructuring — TeamGuard, TeamRedirect, URL Migration

> **Scope:** Restructure all frontend routes under `/dashboard/team/{slug}/`, add TeamGuard + TeamRedirect
> **Depends on:** P7 (AuthProvider context with tenant info)
> **Blocks:** P9 (tenant switcher needs slug-based navigation), P10-P12 (all features use new routes)
> **Deliverable:** All authenticated pages served under `/dashboard/team/:slug/`, TeamGuard validates membership, TeamRedirect handles bare `/dashboard`

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "URL Structure" section, route structure diagram
2. `dashboard/src/App.tsx` — Current route definitions
3. `dashboard/src/components/auth-guard.tsx` — AuthGuard (from P7, wraps AuthProvider)
4. `dashboard/src/hooks/use-auth.ts` — (from P7) useAuth context
5. `dashboard/src/components/sidebar.tsx` — Navigation links (need slug prefix)
6. `dashboard/src/components/dashboard-layout.tsx` — Layout wrapper
7. Every page that uses `<Link>` or `useNavigate()` — search for `"/dashboard/` across the codebase

---

## Files to Create/Modify

### `dashboard/src/components/team-guard.tsx` (new, <80 lines)

Validates the current user is a member of the team identified by `:slug` in the URL.

```tsx
export function TeamGuard() {
  const { slug } = useParams<{ slug: string }>();
  const { tenants, activeTenant } = useAuth();

  // 1. Find the tenant matching the slug in user's tenants list
  // 2. If not found: show "not a member" error page
  // 3. If found but different from activeTenant: call switchTenant() API + reload
  // 4. If found and matches activeTenant: render <Outlet />

  // Error state: centered card with message
  // "You don't have access to this team."
  // Link: "Go to your team" → navigate to activeTenant.slug
}
```

Key behaviors:
- On first load after login, `activeTenant` should already match the URL slug (TeamRedirect set it)
- If user manually changes slug in URL to another team they belong to: call `switchTenant()` + `window.location.reload()`
- If user changes slug to a team they DON'T belong to: show error, don't call switchTenant

### `dashboard/src/components/team-redirect.tsx` (new, <30 lines)

Handles bare `/dashboard` → redirects to `/dashboard/team/{default-slug}`.

```tsx
export function TeamRedirect() {
  const { activeTenant } = useAuth();
  return <Navigate to={`/dashboard/team/${activeTenant.slug}`} replace />;
}
```

### `dashboard/src/App.tsx` (modify)

Update route structure:

```tsx
<Routes>
  <Route path="/dashboard/login" element={<LoginPage />} />
  <Route path="/dashboard/setup" element={<BootstrapPage />} />
  <Route path="/dashboard/accept-invite/:token" element={<InviteAcceptPage />} />

  <Route path="/dashboard" element={<AuthGuard />}>
    <Route index element={<TeamRedirect />} />
    <Route path="team/:slug" element={<TeamGuard />}>
      <Route element={<DashboardLayout />}>
        <Route index element={<DashboardHome />} />
        <Route path="events" element={<EventsFeed />} />
        <Route path="approvals" element={<ApprovalsQueue />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="keys" element={<ApiKeysPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>
  </Route>

  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>
```

Note: `<InviteAcceptPage />` can be a lazy placeholder for now (P11 builds it). Use `React.lazy()` with a stub that shows "Coming soon" or redirect.

### `dashboard/src/components/sidebar.tsx` (modify)

All navigation links must include the team slug:

```tsx
// Before:
{ path: "/dashboard/events", ... }

// After:
{ path: `/dashboard/team/${activeTenant.slug}/events`, ... }
```

The sidebar needs `activeTenant` from `useAuth()`. Update the component to consume auth context.

Remove the `user: UserInfo` prop pattern if it's being replaced by context consumption. Or keep props and pass `activeTenant` from DashboardLayout.

### `dashboard/src/components/dashboard-layout.tsx` (modify)

Pass `activeTenant.slug` to Sidebar for navigation links.

### `dashboard/src/pages/login.tsx` (modify)

After successful login, redirect to `/dashboard/team/{slug}` instead of `/dashboard`:

```tsx
// After login success:
const me = await getMe();
navigate(`/dashboard/team/${me.active_tenant.slug}`);
```

### All pages using `<Link>` or `useNavigate()` (modify)

Search the codebase for hardcoded `/dashboard/` paths in page components. Each needs the slug prefix. Create a utility hook:

```tsx
// dashboard/src/hooks/use-team-path.ts (new, <15 lines)
export function useTeamPath() {
  const { activeTenant } = useAuth();
  return (path: string) => `/dashboard/team/${activeTenant.slug}${path}`;
}

// Usage:
const teamPath = useTeamPath();
<Link to={teamPath("/events")}>Events</Link>
```

---

## Wiring Instructions

1. The route nesting is: `AuthGuard` (provides auth context) → `TeamGuard` (validates slug) → `DashboardLayout` (sidebar + content) → Page
2. `TeamGuard` must NOT re-fetch auth data — it reads from `useAuth()` context set by `AuthProvider` in `AuthGuard`.
3. The `switchTenant()` + `window.location.reload()` approach means TeamGuard only calls the API when the slug changes to a different team. On normal navigation within the same team, it's a no-op.
4. Old routes (`/dashboard/events`, etc.) should redirect to the new slug-based routes. Add catch-all redirects for backwards compatibility if users have bookmarks.

---

## Verification Checklist

### Functional
- [ ] Navigating to `/dashboard` redirects to `/dashboard/team/{slug}`
- [ ] All sidebar links navigate to `/dashboard/team/{slug}/...` paths
- [ ] Browser back/forward works within the same team
- [ ] Navigating to `/dashboard/team/{wrong-slug}` shows error page
- [ ] Login redirects to `/dashboard/team/{slug}` (not bare `/dashboard`)
- [ ] Page refresh on any team route works (TeamGuard re-validates)
- [ ] URL bar shows correct slug on every page

### Code Quality
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] No hardcoded `/dashboard/events` etc. paths remaining (all use slug-based paths)
- [ ] All files under 200 lines

### Both Themes
- [ ] Error page ("not a member") looks correct in dark mode
- [ ] Error page looks correct in light mode
- [ ] No visual regressions on any existing page
