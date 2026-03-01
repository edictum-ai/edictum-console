# Prompt: Slack Interactive — P3 Frontend

> **Scope:** Add description text below the channel type selector in the dialog. All other frontend changes were already implemented as part of P1.
> **Depends on:** P1 Backend (done).
> **Deliverable:** Type selector shows contextual description for each channel type. Verify existing P1 frontend work is correct.
> **Budget:** 1 file modified (`channel-dialog.tsx`)

---

## Required Reading (read ALL before coding)

1. `PROMPT-SLACK-INTERACTIVE.md` — full spec (sections: Config Shape, Frontend items in Verification Checklist)
2. `dashboard/src/lib/api/settings.ts` — `ChannelType` definition, API functions
3. `dashboard/src/pages/settings/notifications/config-fields.tsx` — `EMPTY_CONFIG` map, `ConfigFields` component, `Field` helper
4. `dashboard/src/pages/settings/notifications/channel-dialog.tsx` — `isValid` function, `<Select>` dropdown for channel types
5. `dashboard/src/pages/settings/notifications/channel-table.tsx` — channel type display in table (may need label mapping)
6. `CLAUDE.md` — shadcn mandate, dual light/dark colors, 200-line limit

---

## Shared Modules — Use What Exists

| Need | Use | File |
|------|-----|------|
| `ChannelType` type | Update existing | `lib/api/settings.ts` |
| `Input` component | Already imported | `config-fields.tsx` |
| `Label` component | Already imported | `config-fields.tsx` |
| `Field` helper | Already defined | `config-fields.tsx` |
| `Select` / `SelectItem` | Already imported | `channel-dialog.tsx` |

**Do NOT create new components.** All changes fit within existing files.

> **Already done in P1:** `ChannelType` updated in `settings.ts`, `EMPTY_CONFIG` + `ConfigFields` branch added in `config-fields.tsx`, `isValid` + dropdown updated in `channel-dialog.tsx`, `TYPE_META` entry added in `channel-table.tsx`.

---

## Step 1 (only remaining): Add description text to channel dialog

### Modify: `dashboard/src/pages/settings/notifications/channel-dialog.tsx`

The dropdown exists but has no contextual description. Add a description line below the `</Select>` closing tag, inside the same `<div className="space-y-2">`:

**The `<Select>` dropdown already looks like this** (no changes needed):

```tsx
<SelectContent>
  <SelectItem value="telegram">Telegram</SelectItem>
  <SelectItem value="slack">Slack (Webhook)</SelectItem>
  <SelectItem value="slack_app">Slack (Interactive)</SelectItem>
  <SelectItem value="webhook">Webhook</SelectItem>
  <SelectItem value="email">Email</SelectItem>
</SelectContent>
```

**Add this description text** after the `</Select>` closing tag, inside the same `<div className="space-y-2">`:

```tsx
<p className="text-xs text-muted-foreground">
  {type === "slack" && "Sends notifications with a deep link to the approval in the dashboard."}
  {type === "slack_app" && "Sends notifications with interactive Approve/Deny buttons directly in Slack."}
  {type === "telegram" && "Sends notifications with interactive Approve/Deny buttons in Telegram."}
  {type === "webhook" && "POSTs JSON to your endpoint with optional HMAC signature."}
  {type === "email" && "Sends email notifications via SMTP."}
</p>
```

---

## Step 2: Verify P1 frontend work

These were implemented in P1 — just confirm they're correct before closing out:

- `settings.ts` — `ChannelType` includes `"slack_app"` ✓
- `config-fields.tsx` — `EMPTY_CONFIG.slack_app` exists, `ConfigFields` renders bot_token/signing_secret/slack_channel fields ✓
- `channel-dialog.tsx` — `isValid` handles `slack_app`, dropdown shows "Slack (Webhook)" / "Slack (Interactive)" ✓
- `channel-table.tsx` — `TYPE_META` has `slack_app` entry with `Zap` icon + "Slack (Interactive)" label ✓

---

## Verification Checklist

### Browser — Dark Mode
- [ ] Settings → Notifications → Add Channel → type dropdown shows all 5 types with correct labels
- [ ] Select "Slack (Interactive)" → shows Bot Token, Signing Secret, Slack Channel fields
- [ ] Select "Slack (Webhook)" → shows Webhook URL field (unchanged)
- [ ] Description text updates when switching types
- [ ] All three fields required: Create button disabled until all filled
- [ ] Create a Slack (Interactive) channel → appears in table with correct type label
- [ ] Edit existing Slack (Interactive) channel → fields pre-populated, type locked
- [ ] Existing Slack (Webhook) channels display correctly (no regression)

### Browser — Light Mode
- [ ] All text readable (no invisible text on white background)
- [ ] Hint text (`text-muted-foreground`) visible in both themes
- [ ] Password fields (bot_token, signing_secret) mask correctly
- [ ] Description text visible

### Code Quality
- [ ] No file exceeds 200 lines
- [ ] No raw `<input>`, `<label>`, `<select>` — all shadcn
- [ ] No `any` types
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
