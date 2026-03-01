# P11: Invitation Acceptance Page

> **Scope:** Public page for accepting team invitations — token validation, password setting, accept flow
> **Depends on:** P5 (invitation acceptance API endpoints), P7 (API types)
> **Blocks:** Nothing (independent feature)
> **Deliverable:** `/dashboard/accept-invite/:token` page with all states: loading, valid (new user), valid (existing user), expired, invalid

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Frontend Changes > Invitation Acceptance Page" section
2. `CLAUDE.md` — shadcn mandate, dual-theme colors
3. `dashboard/src/pages/login.tsx` — Pattern reference for unauthenticated page (centered card, form)
4. `dashboard/src/pages/bootstrap.tsx` — Pattern reference for setup page
5. `dashboard/src/lib/api/teams.ts` — (from P7) `getInvitation()`, `acceptInvitation()`

---

## Shared Modules

| Module | What to use |
|--------|------------|
| `lib/api/teams.ts` | `getInvitation(token)`, `acceptInvitation(token, password?)` |
| `components/ui/card` | shadcn Card for centered content |
| `components/ui/input` | shadcn Input for password fields |
| `components/ui/button` | shadcn Button |
| `components/ui/alert` | shadcn Alert for error states |
| `components/ui/badge` | shadcn Badge for role badge |
| `components/ui/label` | shadcn Label for form fields |

---

## Files to Create

### `dashboard/src/pages/accept-invite.tsx` (new, <180 lines)

Route: `/dashboard/accept-invite/:token` — **no auth required**.

**State machine:**

```
Loading → Valid (new user)
       → Valid (existing user, logged in)
       → Valid (existing user, not logged in)
       → Expired
       → Invalid / Used
       → Error
```

**On mount:**
1. Read `:token` from URL params
2. Call `getInvitation(token)`
3. If 404: show Invalid state
4. If success with `expired: true`: show Expired state
5. If success with `already_accepted: true`: show Already Used state
6. If success: check if user has a session (try `getMe()` — if it succeeds, user is logged in)
7. Determine which form to show based on user state

**Layout:** Centered card (like login page), max-w-md.

**States:**

#### Loading
- Centered `Loader2` spinner with "Loading invitation..." text

#### Valid — New User (no existing account)
```
┌─────────────────────────────────────┐
│  [Edictum Shield Logo]              │
│                                     │
│  You've been invited to join        │
│  **Acme Corp**                      │
│                                     │
│  Invited by: admin@acme.com         │
│  Your role: [member badge]          │
│                                     │
│  Email: user@example.com (disabled) │
│  Display Name: [_______________]    │
│  Password: [___________________]    │
│  Confirm Password: [___________]    │
│                                     │
│  [Join Team]                        │
└─────────────────────────────────────┘
```
- Email pre-filled and disabled (from invitation details)
- Display name optional
- Password required (min 8 chars), confirm must match
- On submit: `acceptInvitation(token, password)` → redirect to `/dashboard/team/{slug}`

#### Valid — Existing User, Logged In
```
┌─────────────────────────────────────┐
│  [Edictum Shield Logo]              │
│                                     │
│  You've been invited to join        │
│  **Acme Corp**                      │
│                                     │
│  Invited by: admin@acme.com         │
│  Your role: [member badge]          │
│                                     │
│  Logged in as: user@example.com     │
│                                     │
│  [Accept Invitation]                │
└─────────────────────────────────────┘
```
- No password fields needed
- On submit: `acceptInvitation(token)` → redirect to `/dashboard/team/{slug}`

#### Valid — Existing User, Not Logged In
```
┌─────────────────────────────────────┐
│  [Edictum Shield Logo]              │
│                                     │
│  You've been invited to join        │
│  **Acme Corp**                      │
│                                     │
│  Invited by: admin@acme.com         │
│  Your role: [member badge]          │
│                                     │
│  Log in to accept this invitation.  │
│                                     │
│  [Log In] (links to /dashboard/login│
│           with ?redirect=current)   │
└─────────────────────────────────────┘
```
- After login, user is redirected back to this page → shows "Logged In" variant

#### Expired
```
┌─────────────────────────────────────┐
│  [Clock icon]                       │
│                                     │
│  This invitation has expired.       │
│                                     │
│  Contact your team admin for a      │
│  new invitation.                    │
│                                     │
│  [Go to Login]                      │
└─────────────────────────────────────┘
```

#### Invalid / Already Used
```
┌─────────────────────────────────────┐
│  [X icon]                           │
│                                     │
│  This invitation link is invalid    │
│  or has already been used.          │
│                                     │
│  [Go to Login]                      │
└─────────────────────────────────────┘
```

#### Error (network/server error)
- shadcn Alert with error message and "Try Again" button

---

## Wiring Instructions

1. This page is rendered OUTSIDE the `AuthGuard` — it must work without auth context.
2. To check if user is logged in, try calling `getMe()`. If it succeeds → logged in. If 401 → not logged in. Catch and handle gracefully.
3. **Login redirect support (must implement in this prompt):** The login page (`login.tsx`) needs to honor a `?redirect=` query param. After successful login, if `redirect` is present, navigate there instead of the default `/dashboard`. This is required for the "existing user, not logged in" flow. Read `login.tsx` and add redirect support if it doesn't exist. The redirect URL: `/dashboard/login?redirect=/dashboard/accept-invite/{token}`.
4. After successful acceptance, redirect to `/dashboard/team/{slug}` (slug comes from the `AcceptResult.tenant_slug` response field).
5. The `acceptInvitation` API call accepts `{ password, display_name }` — pass both for new user flow.

---

## Verification Checklist

### Functional
- [ ] Loading state shows spinner
- [ ] New user flow: shows password form, creates account + accepts
- [ ] Existing user (logged in) flow: shows accept button, accepts without password
- [ ] Existing user (not logged in) flow: shows login link with redirect
- [ ] After login + redirect, invitation page shows accept button
- [ ] Expired invitation: shows expiry message
- [ ] Invalid token: shows invalid message
- [ ] After acceptance: redirects to team dashboard
- [ ] Password validation: min 8 chars, confirm must match
- [ ] Form errors shown inline (not alert)
- [ ] Network errors shown in Alert with retry
- [ ] Login page honors `?redirect` param (navigates to redirect URL after login, not default)
- [ ] Display name field works for new users (optional, submitted to backend)

### Code Quality
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] File under 200 lines (split into sub-components if needed)
- [ ] Uses shadcn: Card, Input, Button, Alert, Badge, Label
- [ ] No raw HTML form elements

### Both Themes
- [ ] Centered card looks correct in dark mode
- [ ] Centered card looks correct in light mode
- [ ] Role badge uses dual-theme colors
- [ ] Disabled email input readable in both themes
- [ ] Error states visible in both themes
