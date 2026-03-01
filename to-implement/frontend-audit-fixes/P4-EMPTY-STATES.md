# P4: Empty States That Teach

> **Scope:** SPEC-FRONTEND-AUDIT-FIXES.md Group D (items D1-D3)
> **Depends on:** P2 (error/loading states should be done first so empty states layer on top correctly)
> **Deliverable:** Reusable EmptyState component, educational copy on every empty view, dashboard getting started card
> **Files touched:** ~10 files

---

## Required Reading

Read these files before writing any code:

1. `CLAUDE.md` — shadcn mandate (Button, Card), color rules
2. `SPEC-FRONTEND-AUDIT-FIXES.md` Group D — full copy for every empty state
3. `SPEC-PRODUCT-FEATURES.md` Section 1 — First-Start Wizard (D3 is a lightweight precursor)
4. `dashboard/src/components/dashboard/agent-grid.tsx` — current "No agents" empty state
5. `dashboard/src/components/dashboard/activity-column.tsx` — current "No activity yet"
6. `dashboard/src/components/dashboard/triage-column.tsx` — current "No pending approvals"
7. `dashboard/src/pages/approvals-queue.tsx` — current empty state
8. `dashboard/src/pages/api-keys.tsx` — current empty state
9. `dashboard/src/pages/contracts.tsx` — current empty state (if any)
10. `dashboard/src/pages/settings/notifications-section.tsx` — current empty state (if any)

## Shared Modules Reference

| Import | From |
|--------|------|
| `Button` | `@/components/ui/button` |
| `Card` | `@/components/ui/card` |
| `Plus, Activity, Key, FileText, Shield, Bell, Bot` | `lucide-react` |

---

## Tasks

### D1: Create reusable `EmptyState` component

**Create:** `dashboard/src/components/empty-state.tsx`

```typescript
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 text-muted-foreground">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}
```

Keep it simple — no `learnMoreUrl` prop (YAGNI). Add it when docs exist.

### D2: Update all empty states with educational copy

Replace every minimal "No X yet" with the reusable `EmptyState` component using the copy from the spec.

**Events Feed** (`events-feed.tsx` or `events/event-list.tsx` — wherever the "No events found" text is):
```tsx
<EmptyState
  icon={<Activity className="h-10 w-10" />}
  title="No events yet"
  description="Events appear here when agents start making tool calls. Each event shows whether the call was allowed, denied, or observed by your contracts. Connect an agent to start seeing events."
/>
```

**Approvals Queue — Pending tab** (`approvals-queue.tsx`):
Keep the existing green check + "No pending approvals" in the triage column (it's a status indicator, not a teaching moment). But the full approvals page empty state should use:
```tsx
<EmptyState
  icon={<Shield className="h-10 w-10" />}
  title="No pending approvals"
  description="When a contract requires human approval before a tool call executes, it appears here. Add effect: approve to a pre-contract or sandbox contract to enable human-in-the-loop."
/>
```

**Approvals Queue — History tab**:
```tsx
<EmptyState
  icon={<Shield className="h-10 w-10" />}
  title="No approval history"
  description="Past approval decisions will appear here. This includes approved, denied, and timed-out requests."
/>
```

**Contracts** (when `bundles.length === 0`):
```tsx
<EmptyState
  icon={<FileText className="h-10 w-10" />}
  title="No contract bundles yet"
  description="Contracts are YAML rules that enforce boundaries on what your AI agents can do — preconditions before execution, sandboxes for file paths, session limits, and postcondition checks. Upload your first bundle to start."
  action={{ label: "Upload Bundle", onClick: () => setUploadOpen(true) }}
/>
```

**API Keys** (`api-keys.tsx` or `api-keys/empty-state.tsx`):
```tsx
<EmptyState
  icon={<Key className="h-10 w-10" />}
  title="No API keys yet"
  description="API keys authenticate your agents when they connect to the server. Each key is scoped to an environment (production, staging, etc.). Create a key, then set it as EDICTUM_API_KEY in your agent's config."
  action={{ label: "Create Key", onClick: () => setCreateOpen(true) }}
/>
```

**Notifications** (`settings/notifications-section.tsx`):
```tsx
<EmptyState
  icon={<Bell className="h-10 w-10" />}
  title="No notification channels"
  description="Get alerted when approvals are requested, contracts are deployed, or agents disconnect. Supports Telegram, Slack, webhooks, and email."
  action={{ label: "Add Channel", onClick: () => setCreateOpen(true) }}
/>
```

**Agent Fleet** (`dashboard/agent-grid.tsx`):
```tsx
<EmptyState
  icon={<Bot className="h-10 w-10" />}
  title="No agents connected"
  description="Agents appear here when they connect using an API key. Create an API key, install the SDK (pip install edictum[server]), and configure your agent."
  action={{ label: "Create API Key", onClick: () => navigate("/dashboard/keys") }}
/>
```

### D3: Dashboard getting started card

> **Cross-reference:** This is a lightweight precursor to `SPEC-PRODUCT-FEATURES.md` Feature #1 (First-Start Wizard). When the wizard is implemented, this card checks `edictum_wizard_completed` in localStorage and hides itself.

**File:** `dashboard/src/pages/dashboard-home.tsx`

**Create:** `dashboard/src/components/dashboard/getting-started.tsx`

When the dashboard has no data (`events.length === 0 && agents derived from events is empty`), replace the two-column layout with a single-column getting started layout:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, Key, FileText, Bot, Activity } from "lucide-react"
import { useNavigate } from "react-router"

interface GettingStartedProps {
  hasKeys: boolean
  hasBundles: boolean
}

export function GettingStarted({ hasKeys, hasBundles }: GettingStartedProps) {
  const navigate = useNavigate()

  const steps = [
    { label: "Set up admin account", done: true, icon: CheckCircle2 },
    {
      label: "Create an API key",
      done: hasKeys,
      icon: hasKeys ? CheckCircle2 : Key,
      action: hasKeys ? undefined : () => navigate("/dashboard/keys"),
      actionLabel: "Create Key",
    },
    {
      label: "Upload a contract bundle",
      done: hasBundles,
      icon: hasBundles ? CheckCircle2 : FileText,
      action: hasBundles ? undefined : () => navigate("/dashboard/contracts"),
      actionLabel: "Upload Bundle",
    },
    { label: "Connect an agent", done: false, icon: Bot },
    { label: "See your first events", done: false, icon: Activity },
  ]

  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-lg">Getting Started</CardTitle>
        <p className="text-sm text-muted-foreground">
          Your console is ready. Complete these steps to start governing your agents.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className={`text-sm flex-1 ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {step.label}
              </span>
              {step.action && (
                <Button size="sm" variant="outline" onClick={step.action}>
                  {step.actionLabel}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

In `dashboard-home.tsx`, detect the empty state and render:
```tsx
const agents = deriveAgents(events)
const isEmpty = events.length === 0 && agents.length === 0

// Check if wizard was completed (future: hide getting started)
const wizardCompleted = localStorage.getItem("edictum_wizard_completed") === "true"

if (isEmpty && !wizardCompleted) {
  return (
    <div className="flex flex-col p-4 h-full overflow-auto">
      {/* Stats bar still shows */}
      <div className="-mx-4 -mt-4 mb-0 border-b border-border bg-card/30">
        <div className="px-4 py-0">
          <StatsBar stats={stats} loading={statsLoading} />
        </div>
      </div>
      {/* Getting started card */}
      <GettingStarted hasKeys={/* check from API */} hasBundles={/* check from API */} />
      {/* Agent fleet empty state */}
      <div className="mt-8">
        <AgentGrid events={[]} />
      </div>
    </div>
  )
}
```

To get `hasKeys` and `hasBundles`, you can either:
- Add quick API calls in `fetchData` to check key/bundle counts
- Or pass them from the parent if available from another source
- Simplest: call `listKeys()` and `listBundles()` in the dashboard's fetchData and store counts

---

## Verification Checklist

- [ ] `EmptyState` component exists at `components/empty-state.tsx`
- [ ] Every empty list/table in the app uses `EmptyState` with educational copy
- [ ] Empty state descriptions explain what the feature IS and how to start using it
- [ ] Action buttons on empty states navigate to the right place or open the right dialog
- [ ] Dashboard shows "Getting Started" card when no events and no agents exist
- [ ] Getting started card shows correct checkmarks for completed steps
- [ ] When data arrives (events > 0), dashboard switches to normal two-column layout
- [ ] `pnpm --dir dashboard build` completes without errors
- [ ] Check both dark and light mode — all empty states are readable
