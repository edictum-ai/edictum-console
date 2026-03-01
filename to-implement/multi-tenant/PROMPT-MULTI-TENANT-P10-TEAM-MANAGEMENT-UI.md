# P10: Team Management UI — Settings Tab with Members, Invitations, Role Dialogs

> **Scope:** Team management tab in Settings page — member table, pending invitations, invite form, role change/transfer dialogs
> **Depends on:** P4 (team management API endpoints), P7 (auth context + permissions), P8 (slug-based routes)
> **Blocks:** Nothing (independent feature)
> **Deliverable:** Full team management UI as a new "Team" tab in Settings, with role-gated actions

---

## Required Reading

1. `SPEC-MULTI-TENANT-UX.md` — "Frontend Changes > Team Management" section, role badge colors, component breakdown
2. `CLAUDE.md` — shadcn mandate, dual-theme colors, 200-line limit, loading/error/empty states
3. `PROMPT-FRONTEND-AUDIT.md` — Quality gate checklist
4. `dashboard/src/pages/settings.tsx` — Current settings page tab structure (pattern to follow)
5. `dashboard/src/pages/settings/notifications-section.tsx` — Pattern for settings section with table + dialog
6. `dashboard/src/pages/settings/notifications/channel-table.tsx` — Table pattern reference
7. `dashboard/src/hooks/use-permissions.ts` — (from P7) `usePermissions()` for role gating
8. `dashboard/src/lib/api/teams.ts` — (from P7) team management API functions

---

## Shared Modules

| Module | What to use |
|--------|------------|
| `hooks/use-auth.ts` | `useAuth()` for current user info |
| `hooks/use-permissions.ts` | `usePermissions()` for `canManageTeam` |
| `lib/api/teams.ts` | `listTeamMembers()`, `inviteMember()`, `removeMember()`, `changeMemberRole()`, `transferOwnership()` |
| `lib/format.ts` | `formatRelativeTime()` for dates |
| `components/ui/table` | shadcn Table for member list |
| `components/ui/badge` | shadcn Badge for role badges |
| `components/ui/dialog` | shadcn Dialog for confirmations |
| `components/ui/input` | shadcn Input for email |
| `components/ui/select` | shadcn Select for role picker |
| `components/ui/button` | shadcn Button |
| `components/ui/alert` | shadcn Alert for errors |
| `components/ui/skeleton` | shadcn Skeleton for loading |
| `components/ui/dropdown-menu` | shadcn DropdownMenu for row actions |

---

## Files to Create/Modify

### `dashboard/src/pages/settings.tsx` (modify)

Add "Team" tab:

```tsx
<TabsList variant="line">
  <TabsTrigger value="system">System</TabsTrigger>
  <TabsTrigger value="team">Team</TabsTrigger>
  <TabsTrigger value="notifications">
    Notifications {channelCount > 0 && <Badge ...>{channelCount}</Badge>}
  </TabsTrigger>
  <TabsTrigger value="danger">Danger Zone</TabsTrigger>
</TabsList>

<TabsContent value="team">
  <TeamSection />
</TabsContent>
```

Default `?section` param remains "system". Add "team" to the allowed values.

### `dashboard/src/pages/settings/team/team-section.tsx` (new, <150 lines)

Tab content wrapper. Fetches team members on mount.

```tsx
export function TeamSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canManageTeam } = usePermissions();

  // Fetch listTeamMembers() on mount
  // Split into: accepted members (accepted_at != null) and pending invitations (accepted_at == null)
  // Render:
  // 1. InviteForm (if canManageTeam)
  // 2. MemberTable (accepted members)
  // 3. PendingInvitations (if any pending, and canManageTeam)

  // Loading: skeleton rows
  // Error: Alert with retry
  // Empty: "You're the only team member. Invite your team to get started."
}
```

### `dashboard/src/pages/settings/team/member-table.tsx` (new, <150 lines)

Members list using shadcn Table.

**Columns:**
- **Member:** Avatar (initial circle) + email + display_name (if set)
- **Role:** Badge with role-specific color
- **Joined:** relative time (`formatRelativeTime`)
- **Actions:** DropdownMenu (only if `canManageTeam`)
  - "Change Role" → opens ChangeRoleDialog
  - "Remove Member" → opens RemoveMemberDialog
  - For owner row: "Transfer Ownership" → opens TransferOwnershipDialog (only if current user is owner)
  - Owner row has no "Remove" or "Change Role" actions

**Role badge component (inline or extracted):**

```tsx
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/30",
    admin: "text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/30",
    member: "text-slate-600 dark:text-slate-400 bg-slate-500/15 border-slate-500/30",
    viewer: "text-gray-600 dark:text-gray-400 bg-gray-500/15 border-gray-500/30",
  };
  return <Badge variant="outline" className={cn("capitalize", colors[role])}>{role}</Badge>;
}
```

### `dashboard/src/pages/settings/team/pending-invitations.tsx` (new, <100 lines)

Pending invitations section (only shown if there are pending invitations and user `canManageTeam`).

**Content:**
- Section header: "Pending Invitations"
- For each pending invitation: email, role badge, invited by, "Invited X ago"
- Actions: "Copy Link" button (copies invitation URL), "Revoke" button (calls removeMember to delete the pending membership)

### `dashboard/src/pages/settings/team/invite-form.tsx` (new, <80 lines)

Invite form (only shown if `canManageTeam`).

**Fields:**
- Email input (shadcn Input, type="email", required)
- Role select (shadcn Select: admin, member, viewer — NOT owner)
- "Send Invite" button

**On submit:**
- Call `inviteMember(email, role)`
- On success: show the invitation link in a dialog/toast for the admin to copy (no email sent in v1)
- On error (409 — already a member): show inline error
- On error (other): show alert

### `dashboard/src/pages/settings/team/change-role-dialog.tsx` (new, <80 lines)

shadcn Dialog for changing a member's role.

- Shows: member email, current role
- Role select: admin (if requester is owner), member, viewer
- "Change Role" button
- Loading state, error handling

### `dashboard/src/pages/settings/team/transfer-ownership-dialog.tsx` (new, <80 lines)

shadcn Dialog for transferring ownership. Only the owner can trigger this.

- Warning: "This will transfer ownership of {team name} to {member email}. You will become an admin."
- Confirmation input: type the team name to confirm
- "Transfer Ownership" button (destructive variant)
- On success: refresh page (roles changed)

### `dashboard/src/pages/settings/team/remove-member-dialog.tsx` (new, <60 lines)

shadcn AlertDialog for confirming member removal.

- "Remove {email} from {team name}?"
- "This action cannot be undone."
- "Remove" button (destructive variant)
- On success: remove from local state, show toast

---

## Wiring Instructions

1. Team tab is always visible in Settings (all roles can see the member list). Actions are gated by `canManageTeam`.
2. After invite success, show the invitation URL in a dialog with a "Copy" button and clear instructions ("Share this link with {email}").
3. After role change / member removal, refresh the members list by re-fetching.
4. The owner can't see their own "Remove" or "Change Role" actions — only "Transfer Ownership."
5. Members/viewers see the table as read-only — no action column.

---

## Verification Checklist

### Functional
- [ ] Team tab shows in Settings page
- [ ] Members table shows all accepted team members with role badges
- [ ] Pending invitations section shows pending invites (admin view)
- [ ] Invite form works: enter email + role → get invitation link
- [ ] Invitation link dialog has working "Copy" button
- [ ] Change role dialog works (admin can change member/viewer, owner can promote to admin)
- [ ] Transfer ownership dialog works with confirmation input
- [ ] Remove member dialog works with confirmation
- [ ] Owner row has no "Remove" or "Change Role" actions
- [ ] Viewers/members see read-only member list (no actions)

### States
- [ ] Loading: skeleton rows while fetching
- [ ] Error: Alert with "Retry" button
- [ ] Empty: "You're the only team member. Invite your team to get started."
- [ ] Empty pending: section hidden (not shown as empty)

### Code Quality
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] All files under 200 lines (7 files, each focused)
- [ ] Uses shadcn: Table, Badge, Dialog, AlertDialog, Input, Select, Button, Alert, Skeleton, DropdownMenu
- [ ] No raw HTML elements

### Both Themes
- [ ] Role badges use dual-theme colors: `text-*-600 dark:text-*-400`
- [ ] Member table readable in light mode
- [ ] Member table readable in dark mode
- [ ] Dialogs look correct in both themes
- [ ] Invite form looks correct in both themes
