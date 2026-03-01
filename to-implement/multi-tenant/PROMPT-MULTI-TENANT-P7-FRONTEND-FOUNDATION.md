# P7: Frontend Foundation — AuthProvider, usePermissions, API Types, Teams API Client

> **Scope:** React auth context provider, permissions hook, updated API types, new teams.ts API client module
> **Depends on:** P3 (updated getMe response), P4 (team management endpoints), P5 (invitation endpoints)
> **Blocks:** P8-P12 (all frontend features need auth context and permissions)
> **Deliverable:** AuthProvider context, usePermissions hook, updated UserInfo/TenantInfo types, teams.ts API client

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Frontend Changes" sections 1, 5, 6, 8
2. `CLAUDE.md` — React/TypeScript coding standards, shadcn mandate, shared modules rules
3. `dashboard/src/hooks/use-auth.ts` — Current useAuth hook (will be refactored)
4. `dashboard/src/components/auth-guard.tsx` — Current AuthGuard (calls useAuth)
5. `dashboard/src/components/dashboard-layout.tsx` — Current DashboardLayout (also calls useAuth — double fetch)
6. `dashboard/src/lib/api/auth.ts` — Current UserInfo type, getMe() function
7. `dashboard/src/lib/api/index.ts` — API re-exports
8. `dashboard/src/lib/api/settings.ts` — Pattern reference for API client modules

---

## Shared Modules

| Module | What to use | What NOT to duplicate |
|--------|------------|----------------------|
| `lib/api/client.ts` | `request<T>()`, `ApiError` | Don't create a new request function |
| `lib/api/auth.ts` | `getMe()` — will be updated | Don't create a separate getMe |
| `lib/utils.ts` | `cn()` for class merging | |

---

## Files to Create/Modify

### `dashboard/src/lib/api/auth.ts` (modify)

Update types to match new getMe response:

```typescript
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "viewer";
}

export interface UserInfo {
  user_id: string;
  email: string;
  display_name: string | null;
  active_tenant: TenantInfo;
  tenants: TenantInfo[];
}
```

Remove old `tenant_id: string` and `is_admin: boolean` fields from `UserInfo`.

### `dashboard/src/lib/api/teams.ts` (new, <120 lines)

```typescript
import { request } from "./client";
import type { TenantInfo } from "./auth";

// Types
export interface TeamMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  accepted_at: string | null;
  invited_at: string;
}

export interface InvitationResult {
  invitation_token: string;
  invitation_url: string;
}

export interface InvitationDetails {
  tenant_name: string;
  inviter_email: string;
  role: string;
  email: string;
  expired: boolean;
  already_accepted: boolean;
}

export interface CreateTenantRequest {
  name: string;
}

// Team management
export function listTeamMembers() { return request<TeamMember[]>("/api/v1/team"); }
export function inviteMember(email: string, role: string) { return request<InvitationResult>("/api/v1/team/invite", { method: "POST", body: JSON.stringify({ email, role }) }); }
export function removeMember(userId: string) { return request<void>(`/api/v1/team/members/${userId}`, { method: "DELETE" }); }
export function changeMemberRole(userId: string, role: string) { return request<void>(`/api/v1/team/members/${userId}`, { method: "PUT", body: JSON.stringify({ role }) }); }
export function transferOwnership(userId: string) { return request<void>("/api/v1/team/transfer-ownership", { method: "POST", body: JSON.stringify({ user_id: userId }) }); }

// Tenant management
export function listTenants() { return request<TenantInfo[]>("/api/v1/tenants"); }
export function createTenant(data: CreateTenantRequest) { return request<TenantInfo>("/api/v1/tenants", { method: "POST", body: JSON.stringify(data) }); }
export function updateTenant(tenantId: string, name: string) { return request<TenantInfo>(`/api/v1/tenants/${tenantId}`, { method: "PUT", body: JSON.stringify({ name }) }); }
export function switchTenant(tenantId: string) { return request<void>("/api/v1/tenants/switch", { method: "POST", body: JSON.stringify({ tenant_id: tenantId }) }); }

export interface AcceptInvitationRequest {
  password?: string | null;
  display_name?: string | null;
}

export interface AcceptResult {
  message: string;
  tenant_slug: string;
  tenant_name: string;
}

// Invitations (public — no auth)
export function getInvitation(token: string) { return request<InvitationDetails>(`/api/v1/invitations/${token}`); }
export function acceptInvitation(token: string, data: AcceptInvitationRequest = {}) { return request<AcceptResult>(`/api/v1/invitations/${token}/accept`, { method: "POST", body: JSON.stringify(data) }); }
```

### `dashboard/src/lib/api/index.ts` (modify)

Add re-exports for new module:
```typescript
export * from "./teams";
```

### `dashboard/src/hooks/use-auth.ts` (refactor)

Convert from a simple fetch hook to a React context provider:

```typescript
// Context
interface AuthState {
  user: UserInfo;
  activeTenant: TenantInfo;
  tenants: TenantInfo[];
}

const AuthContext = createContext<(AuthState & { refresh: () => void; logout: () => void }) | null>(null);

// Provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Calls getMe() on mount, stores result in state
  // Provides context to children
  // Handles loading/error states
}

// Hook (throws if used outside provider)
export function useAuth(): AuthState & { refresh: () => void; logout: () => void } {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

### `dashboard/src/hooks/use-permissions.ts` (new, <40 lines)

```typescript
import { useAuth } from "./use-auth";

interface Permissions {
  role: string;
  canManageTeam: boolean;
  canManageKeys: boolean;
  canDeploy: boolean;
  canApprove: boolean;
}

export function usePermissions(): Permissions {
  const { activeTenant } = useAuth();
  const role = activeTenant.role;

  return {
    role,
    canManageTeam: role === "owner" || role === "admin",
    canManageKeys: role === "owner" || role === "admin",
    canDeploy: role !== "viewer",
    canApprove: role !== "viewer",
  };
}
```

### `dashboard/src/components/auth-guard.tsx` (modify)

Wrap children with `AuthProvider`:

```tsx
export function AuthGuard() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
```

The loading/error/redirect logic moves into `AuthProvider`.

### `dashboard/src/components/dashboard-layout.tsx` (modify)

Remove direct `useAuth()` fetch — consume from context instead:

```tsx
export function DashboardLayout() {
  const { user, activeTenant } = useAuth();
  // No more independent getMe() call — uses context from AuthProvider
}
```

Update `Sidebar` props to pass `activeTenant` and `tenants`.

---

## Wiring Instructions

1. `AuthProvider` wraps the `<Outlet />` in `AuthGuard`. All authenticated pages get auth context for free.
2. `useAuth()` is now context-based — calling it from any child component returns the same data (no duplicate fetch).
3. `usePermissions()` derives permissions from `useAuth()` — it's a pure computation hook.
4. The `Sidebar` component props will need updating to accept `TenantInfo` (done in P9).
5. Existing pages that use `useAuth()` (events, approvals, dashboard) will continue to work — the hook interface is the same, just backed by context now.

---

## Verification Checklist

### Code Quality
- [ ] `pnpm tsc --noEmit` passes (no type errors)
- [ ] `pnpm build` succeeds
- [ ] All files under 200 lines
- [ ] No `any` types
- [ ] No raw HTML elements (shadcn mandate)
- [ ] No duplicated types (TenantInfo defined once in auth.ts, re-exported)

### Functional
- [ ] App loads without errors (AuthProvider initializes correctly)
- [ ] `useAuth()` returns user info with `active_tenant` and `tenants` array
- [ ] `usePermissions()` returns correct permissions for each role
- [ ] No double-fetch of getMe() (check Network tab — only one call on page load)
- [ ] Existing pages (Dashboard, Events, Approvals, Contracts, Settings) still work
- [ ] Login/logout flow still works

### Both Themes
- [ ] No visual regressions in dark mode
- [ ] No visual regressions in light mode
