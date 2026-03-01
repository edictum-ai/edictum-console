# P3: Discord Frontend — Dashboard Channel UI

> **Scope:** Add Discord as a channel type in the Settings → Notifications UI. Config fields, type dropdown, validation, table icon.
> **Depends on:** P1 (backend must accept `discord` channel type).
> **Deliverable:** Admin can create, edit, test, and delete Discord channels from the dashboard. Both dark and light mode work.
> **Estimated files:** 4 modified.

---

## Required Reading

Read these files before writing any code:

1. `PROMPT-DISCORD-INTERACTIVE.md` — Full spec, sections 7–10 (frontend changes)
2. `dashboard/src/pages/settings/notifications/config-fields.tsx` — Where Discord config form fields go
3. `dashboard/src/pages/settings/notifications/channel-dialog.tsx` — Type dropdown + validation
4. `dashboard/src/pages/settings/notifications/channel-table.tsx` — `TYPE_META` icon + label
5. `dashboard/src/lib/api/settings.ts` — `ChannelType` union

---

## Shared Modules — Import, Don't Duplicate

| Need | Import from | Do NOT redefine |
|------|------------|-----------------|
| `ChannelType` | `@/lib/api/settings` (via `@/lib/api`) | Don't create a separate type |
| `Input`, `Label` | `@/components/ui/input`, `@/components/ui/label` | Already imported in config-fields |
| `Gamepad2` icon | `lucide-react` | Don't use a custom SVG |
| `EMPTY_CONFIG` | `./config-fields` | Already exported, extend it |

---

## Files to Modify

### 1. `dashboard/src/lib/api/settings.ts`

Add `"discord"` to the `ChannelType` union:
```typescript
export type ChannelType = "telegram" | "slack" | "webhook" | "email" | "discord"
```

### 2. `dashboard/src/pages/settings/notifications/config-fields.tsx`

**Add Discord to `EMPTY_CONFIG`:**
```typescript
export const EMPTY_CONFIG: Record<ChannelType, Record<string, string>> = {
  telegram: { bot_token: "", chat_id: "" },
  slack: { webhook_url: "" },
  webhook: { url: "", secret: "" },
  email: { /* existing */ },
  discord: { bot_token: "", public_key: "", discord_channel_id: "" },
}
```

**Add Discord branch in `ConfigFields`** — insert BEFORE the email fall-through:
```typescript
if (type === "discord")
  return (
    <>
      <Field
        id="cfg-bot-token"
        label="Bot Token"
        type="password"
        value={config.bot_token}
        onChange={(v) => f("bot_token", v)}
        placeholder="MTIzNDU2Nzg5MDEy..."
      />
      <Field
        id="cfg-public-key"
        label="Public Key"
        value={config.public_key}
        onChange={(v) => f("public_key", v)}
        placeholder="Hex-encoded Ed25519 key from General Information"
        hint="Found in Discord Developer Portal → General Information → Public Key."
      />
      <Field
        id="cfg-discord-channel"
        label="Channel ID"
        value={config.discord_channel_id}
        onChange={(v) => f("discord_channel_id", v)}
        placeholder="1234567890123456789"
        hint="Right-click channel → Copy Channel ID (enable Developer Mode in Discord settings)."
      />
    </>
  )
```

### 3. `dashboard/src/pages/settings/notifications/channel-dialog.tsx`

**Add Discord to the Select dropdown** (after Email):
```typescript
<SelectItem value="discord">Discord</SelectItem>
```

**Add Discord validation to `isValid`** (before the final `return false`):
```typescript
if (type === "discord") return !!config.bot_token && !!config.public_key && !!config.discord_channel_id
```

### 4. `dashboard/src/pages/settings/notifications/channel-table.tsx`

**Add `Gamepad2` import and TYPE_META entry:**
```typescript
import { Send, Hash, Webhook, Mail, Gamepad2, MoreHorizontal, Pencil, Trash2, Power, PowerOff } from "lucide-react"

const TYPE_META: Record<string, { icon: typeof Send; label: string }> = {
  telegram: { icon: Send, label: "Telegram" },
  slack: { icon: Hash, label: "Slack" },
  webhook: { icon: Webhook, label: "Webhook" },
  email: { icon: Mail, label: "Email" },
  discord: { icon: Gamepad2, label: "Discord" },
}
```

---

## Verification Checklist

### Browser (both dark AND light mode)

1. Navigate to `/dashboard/settings` → Notifications tab
2. Click "Add Channel" → verify "Discord" appears in the Type dropdown
3. Select "Discord" → verify 3 fields appear:
   - Bot Token (password input, placeholder `MTIzNDU2Nzg5MDEy...`)
   - Public Key (text input, placeholder `Hex-encoded Ed25519 key...`, hint text visible)
   - Channel ID (text input, placeholder `1234567890123456789`, hint text visible)
4. Verify "Create" button is disabled until all 3 fields + name are filled
5. Fill all fields → click Create → verify channel appears in table with `Gamepad2` icon and "Discord" label
6. Click "Test" → verify test button works (will fail with fake creds, but UI state machine should cycle: testing → failed → idle)
7. Click Edit → verify fields are populated, type dropdown is disabled
8. **Switch to light mode** → repeat steps 2-6, verify all text is readable (no invisible text on white bg)
9. **Switch to dark mode** → verify same

### Code Quality
- [ ] No new files created — all changes are modifications to existing files
- [ ] No raw `<button>`, `<input>`, `<label>` — all shadcn
- [ ] No hardcoded colors — uses existing component tokens
- [ ] `ChannelType` union updated in settings.ts (single source of truth)
- [ ] `EMPTY_CONFIG` has discord entry (form state resets correctly on type change)
- [ ] `isValid` has discord branch (Create button enables correctly)
- [ ] `TYPE_META` has discord entry (table shows correct icon/label)
- [ ] All files still under 200 lines
