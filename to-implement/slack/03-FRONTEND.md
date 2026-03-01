# Prompt: Slack Interactive — P3 Frontend

> **Scope:** Add `slack_app` channel type to the notification settings UI. Update type definitions, config form, channel dialog dropdown, and validation.
> **Depends on:** P1 Backend (slack_app channel type accepted by API), P2 Tests (backend verified).
> **Deliverable:** Admin can create and manage Slack (Interactive) channels from the dashboard. Both channel types visible with clear descriptions.
> **Budget:** 3 files modified

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

---

## Step 1: Update API types

### Modify: `dashboard/src/lib/api/settings.ts`

Add `"slack_app"` to the `ChannelType` union:

```typescript
export type ChannelType = "telegram" | "slack" | "webhook" | "email" | "slack_app"
```

---

## Step 2: Update config fields

### Modify: `dashboard/src/pages/settings/notifications/config-fields.tsx`

**Add to `EMPTY_CONFIG`:**

```typescript
slack_app: { bot_token: "", signing_secret: "", slack_channel: "" },
```

**Add `slack_app` branch in `ConfigFields`** (before the email fallback):

```tsx
if (type === "slack_app")
  return (
    <>
      <Field
        id="cfg-bot-token"
        label="Bot Token"
        type="password"
        value={config.bot_token}
        onChange={(v) => f("bot_token", v)}
        placeholder="xoxb-..."
        hint="From OAuth & Permissions after installing the Slack App."
      />
      <Field
        id="cfg-signing-secret"
        label="Signing Secret"
        type="password"
        value={config.signing_secret}
        onChange={(v) => f("signing_secret", v)}
        hint="From Basic Information in your Slack App settings."
      />
      <Field
        id="cfg-slack-channel"
        label="Slack Channel"
        value={config.slack_channel}
        onChange={(v) => f("slack_channel", v)}
        placeholder="#ops-alerts or C01234ABCDE"
        hint="The channel to post approval messages to. Invite the bot first."
      />
    </>
  )
```

---

## Step 3: Update channel dialog

### Modify: `dashboard/src/pages/settings/notifications/channel-dialog.tsx`

**Update `isValid` function** — add `slack_app` case:

```typescript
if (type === "slack_app") return !!config.bot_token && !!config.signing_secret && !!config.slack_channel
```

**Update the `<Select>` dropdown** — update labels and add `slack_app`:

```tsx
<SelectContent>
  <SelectItem value="telegram">Telegram</SelectItem>
  <SelectItem value="slack">Slack (Webhook)</SelectItem>
  <SelectItem value="slack_app">Slack (Interactive)</SelectItem>
  <SelectItem value="webhook">Webhook</SelectItem>
  <SelectItem value="email">Email</SelectItem>
</SelectContent>
```

**Add description text below the Select** that changes based on selected type. Add this after the `</Select>` closing tag, inside the same `<div className="space-y-2">`:

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

## Step 4: Update channel table display (if needed)

### Check: `dashboard/src/pages/settings/notifications/channel-table.tsx`

Read this file. If it displays `channel_type` as raw text (e.g. "slack_app"), add a display name mapping:

```typescript
const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  telegram: "Telegram",
  slack: "Slack (Webhook)",
  slack_app: "Slack (Interactive)",
  webhook: "Webhook",
  email: "Email",
}
```

Use this mapping wherever the channel type is displayed in the table.

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
