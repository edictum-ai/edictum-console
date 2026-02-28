import { NavLink, Outlet } from "react-router"
import { cn } from "@/lib/utils"

const mockupViews = [
  {
    label: "View 3: Dashboard Home",
    variations: [
      { to: "dashboard-v1", label: "V1: Summary + Triage + Activity" },
      { to: "dashboard-v2", label: "V2: Two-Column Dense" },
      { to: "dashboard-v3", label: "V3: Feed + Floating Alerts" },
      { to: "dashboard-v4", label: "V4: Agent Card Grid" },
      { to: "dashboard-v5", label: "V5: Minimal Triage" },
    ],
  },
  {
    label: "View 4: Events Feed",
    variations: [
      { to: "events-v1", label: "V1: Three-Panel (Datadog)" },
      { to: "events-v2", label: "V2: Two-Panel Pill Filters" },
      { to: "events-v3", label: "V3: Full-Width + Histogram" },
      { to: "events-v4", label: "V4: Kibana Split" },
      { to: "events-v5", label: "V5: Stream-First (Axiom)" },
    ],
  },
  {
    label: "View 5: Approvals Queue",
    variations: [
      { to: "approvals-v1", label: "V1: Adaptive Card/Table" },
      { to: "approvals-v2", label: "V2: Expandable Table Rows" },
      { to: "approvals-v3", label: "V3: Inbox Two-Column" },
      { to: "approvals-v4", label: "V4: Kanban Board" },
      { to: "approvals-v5", label: "V5: Notification Cards" },
    ],
  },
  {
    label: "View 6: Contracts",
    variations: [
      { to: "contracts-v1", label: "V1: Env Matrix + Detail Tabs" },
      { to: "contracts-v2", label: "V2: Split Pane IDE" },
      { to: "contracts-v3", label: "V3: ArgoCD Sync Status" },
      { to: "contracts-v4", label: "V4: Timeline + Composition" },
      { to: "contracts-v5", label: "V5: Tabbed Workbench" },
    ],
  },
  {
    label: "V6 Redesign: Deployments",
    variations: [
      { to: "contracts-deploy-v1", label: "V1: Status Cards + Fleet" },
      { to: "contracts-deploy-v2", label: "V2: Environment Columns" },
      { to: "contracts-deploy-v3", label: "V3: Compact Dashboard" },
      { to: "contracts-deploy-v4", label: "V4: ArgoCD Sync Grid" },
      { to: "contracts-deploy-v5", label: "V5: Split Env + Agents" },
    ],
  },
  {
    label: "V6 Redesign v2: Contracts",
    variations: [
      { to: "contracts-tab1-v1", label: "V1: Contract Cards" },
      { to: "contracts-tab1-v2", label: "V2: Contract Table" },
      { to: "contracts-tab1-v3", label: "V3: Grouped by Type" },
      { to: "contracts-tab1-v3b", label: "V3b: Multi-Bundle" },
      { to: "contracts-tab1-v4", label: "V4: Split View" },
      { to: "contracts-tab1-v5", label: "V5: Document View" },
    ],
  },
]

export function MockupGallery() {
  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Mockup Gallery
        </h2>
        {mockupViews.map((view) => (
          <div key={view.label} className="mb-5">
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {view.label}
            </h3>
            <div className="space-y-0.5">
              {view.variations.map((v) => (
                <NavLink
                  key={v.to}
                  to={v.to}
                  className={({ isActive }) =>
                    cn(
                      "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )
                  }
                >
                  {v.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </aside>
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
